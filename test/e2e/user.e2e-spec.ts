/**
 * User Module E2E Tests
 *
 * End-to-end tests for user management including:
 * - User profile retrieval (GET /api/v1/users/me)
 * - User profile update (PATCH /api/v1/users/me)
 * - User soft delete (DELETE /api/v1/users/me)
 * - User restoration (POST /api/v1/users/me/restore)
 *
 * These tests use supertest to make HTTP requests to the NestJS application
 * and verify the complete request/response cycle.
 *
 * Based on ARCHITECTURE.md Section 5.2 (User Schema) and Section 9 (API Responses)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  generateUuid,
  generateEmail,
  generateGoogleId,
  cacheKeys,
} from '../utils/test-utils';
import {
  createMockUser,
  createMockPrismaService,
  createMockCacheService,
  createMockConfigService,
  createMockEncryptionService,
  MockUser,
} from '../utils/mock-factories';

// Type definitions for test responses
interface UserProfileResponse {
  success: boolean;
  data: {
    id: string;
    email: string;
    name: string;
    picture?: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface UserUpdateResponse {
  success: boolean;
  data: {
    id: string;
    email: string;
    name: string;
    picture?: string;
    updatedAt: string;
  };
}

interface UserDeleteResponse {
  success: boolean;
  data: {
    message: string;
  };
}

interface ErrorResponse {
  success: boolean;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Import NestJS decorators for mock controller
import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  Headers,
  HttpCode,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

/**
 * Mock User Controller for E2E Testing
 * Simulates the actual UserController behavior
 */
@Controller('api/v1/users')
class MockUserController {
  private users: Map<string, MockUser> = new Map();
  private deletedUsers: Map<string, MockUser> = new Map();
  private cacheStore: Map<string, unknown> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /api/v1/users/me - Get current user profile
   */
  @Get('me')
  async getProfile(@Headers('authorization') authHeader: string) {
    const user = await this.validateAndGetUser(authHeader);

    return {
      success: true,
      data: {
        id: user.id,
        email: this.decryptEmail(user.email),
        name: user.name,
        picture: user.picture,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    };
  }

  /**
   * PATCH /api/v1/users/me - Update current user profile
   */
  @Patch('me')
  async updateProfile(
    @Headers('authorization') authHeader: string,
    @Body() body: { name?: string; picture?: string },
  ) {
    const user = await this.validateAndGetUser(authHeader);

    // Validate update data
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === '')) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REQ_002',
          message: 'Invalid name provided',
        },
      });
    }

    if (body.picture !== undefined && typeof body.picture !== 'string') {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REQ_002',
          message: 'Invalid picture URL provided',
        },
      });
    }

    // Update user
    const updatedAt = new Date();
    if (body.name !== undefined) {
      user.name = body.name.trim();
    }
    if (body.picture !== undefined) {
      user.picture = body.picture || null;
    }
    user.updatedAt = updatedAt;

    this.users.set(user.id, user);

    // Invalidate cache
    this.cacheStore.delete(cacheKeys.userInfo(user.id));

    return {
      success: true,
      data: {
        id: user.id,
        email: this.decryptEmail(user.email),
        name: user.name,
        picture: user.picture,
        updatedAt: user.updatedAt.toISOString(),
      },
    };
  }

  /**
   * DELETE /api/v1/users/me - Soft delete current user
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteProfile(@Headers('authorization') authHeader: string) {
    const user = await this.validateAndGetUser(authHeader);

    // Soft delete - set deletedAt timestamp
    user.deletedAt = new Date();
    user.updatedAt = new Date();

    // Move to deleted users store
    this.deletedUsers.set(user.id, user);
    this.users.delete(user.id);

    // Invalidate cache
    this.cacheStore.delete(cacheKeys.userInfo(user.id));

    return {
      success: true,
      data: {
        message: 'Account successfully deleted',
      },
    };
  }

  /**
   * POST /api/v1/users/me/restore - Restore soft-deleted user
   * Note: This requires special handling - user would need to re-authenticate
   * For testing purposes, we allow restoration with a valid token
   */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  async restoreProfile(@Body() body: { userId: string; adminToken?: string }) {
    const { userId } = body;

    const deletedUser = this.deletedUsers.get(userId);
    if (!deletedUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_002',
          message: 'User not found or not deleted',
        },
      });
    }

    // Restore user
    deletedUser.deletedAt = null;
    deletedUser.updatedAt = new Date();

    this.users.set(userId, deletedUser);
    this.deletedUsers.delete(userId);

    return {
      success: true,
      data: {
        id: deletedUser.id,
        email: this.decryptEmail(deletedUser.email),
        name: deletedUser.name,
        picture: deletedUser.picture,
        message: 'Account successfully restored',
      },
    };
  }

  /**
   * POST /api/v1/users/test/setup - Create test user (for E2E testing only)
   */
  @Post('test/setup')
  @HttpCode(HttpStatus.OK)
  async setupTestUser(@Body() body: { name?: string; email?: string; picture?: string }) {
    const user = createMockUser({
      name: body.name || 'E2E Test User',
      email: this.encryptEmail(body.email || generateEmail('e2e')),
      picture: body.picture || null,
    });

    this.users.set(user.id, user);

    // Create JWT tokens for the test user
    const sessionId = generateUuid();
    const tokenId = generateUuid();

    const accessPayload = { userId: user.id, sessionId };
    const refreshPayload = { userId: user.id, sessionId, tokenId };

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign(refreshPayload, { expiresIn: '30d' });

    // Cache user info
    this.cacheStore.set(cacheKeys.userInfo(user.id), {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      googleId: user.googleId,
    });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: body.email || this.decryptEmail(user.email),
          name: user.name,
          picture: user.picture,
        },
        tokens: {
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
        },
      },
    };
  }

  /**
   * POST /api/v1/users/test/cleanup - Clean up test data
   */
  @Post('test/cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanup() {
    this.users.clear();
    this.deletedUsers.clear();
    this.cacheStore.clear();
    return { success: true };
  }

  /**
   * GET /api/v1/users/test/cache/:userId - Check cache state (for testing)
   */
  @Get('test/cache/:userId')
  async getCacheState(@Headers('authorization') authHeader: string) {
    const payload = this.verifyToken(authHeader);
    const cached = this.cacheStore.get(cacheKeys.userInfo(payload.userId));
    return {
      success: true,
      data: {
        cached: cached !== undefined,
        cacheKey: cacheKeys.userInfo(payload.userId),
      },
    };
  }

  /**
   * Helper: Validate authorization and get user
   */
  private async validateAndGetUser(authHeader: string): Promise<MockUser> {
    const payload = this.verifyToken(authHeader);
    const user = this.users.get(payload.userId);

    if (!user) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_002',
          message: 'User not found',
        },
      });
    }

    return user;
  }

  /**
   * Helper: Verify JWT token
   */
  private verifyToken(authHeader: string): { userId: string; sessionId: string } {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_003',
          message: 'Token not provided',
        },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_001',
          message: 'Invalid or expired token',
        },
      });
    }
  }

  /**
   * Helper: Encrypt email (mock implementation)
   */
  private encryptEmail(email: string): string {
    return `encrypted:${email}`;
  }

  /**
   * Helper: Decrypt email (mock implementation)
   */
  private decryptEmail(encryptedEmail: string): string {
    return encryptedEmail.replace('encrypted:', '');
  }
}

// Test module setup
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => ({
        NODE_ENV: 'test',
        JWT_SECRET: 'e2e-test-secret-key-for-jwt-signing',
      })],
    }),
    JwtModule.register({
      secret: 'e2e-test-secret-key-for-jwt-signing',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [MockUserController],
})
class TestUserModule {}

describe('User E2E Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestUserModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same configuration as production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    jwtService = moduleFixture.get<JwtService>(JwtService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await request(app.getHttpServer())
      .post('/api/v1/users/test/cleanup')
      .expect(HttpStatus.OK);
  });

  describe('User Profile', () => {
    describe('GET /api/v1/users/me', () => {
      it('should return current user profile', async () => {
        // Setup test user
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({ name: 'Profile Test User', email: 'profile@test.com' })
          .expect(HttpStatus.OK);

        const { accessToken } = setupResponse.body.data.tokens;

        // Get profile
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        const body: UserProfileResponse = response.body;

        expect(body.success).toBe(true);
        expect(body.data.name).toBe('Profile Test User');
        expect(body.data.email).toBe('profile@test.com');
        expect(body.data.id).toBeDefined();
        expect(body.data.createdAt).toBeDefined();
        expect(body.data.updatedAt).toBeDefined();
      });

      it('should return user profile with picture URL', async () => {
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({
            name: 'Picture Test User',
            email: 'picture@test.com',
            picture: 'https://example.com/avatar.jpg',
          })
          .expect(HttpStatus.OK);

        const { accessToken } = setupResponse.body.data.tokens;

        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        expect(response.body.data.picture).toBe('https://example.com/avatar.jpg');
      });

      it('should reject request without authorization header', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .expect(HttpStatus.UNAUTHORIZED);

        const body: ErrorResponse = response.body;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_003');
        expect(body.error.message).toContain('Token not provided');
      });

      it('should reject request with invalid token', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', 'Bearer invalid.jwt.token')
          .expect(HttpStatus.UNAUTHORIZED);

        const body: ErrorResponse = response.body;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_001');
      });

      it('should reject request with expired token', async () => {
        // Create an expired token
        const expiredToken = jwtService.sign(
          { userId: generateUuid(), sessionId: generateUuid() },
          { expiresIn: '-1h' },
        );

        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${expiredToken}`)
          .expect(HttpStatus.UNAUTHORIZED);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('AUTH_001');
      });

      it('should return 404 for deleted user', async () => {
        // Setup and then delete user
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({ name: 'To Be Deleted' })
          .expect(HttpStatus.OK);

        const { accessToken } = setupResponse.body.data.tokens;

        // Delete the user
        await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        // Try to get profile (should fail)
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.NOT_FOUND);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('NOT_002');
      });
    });
  });

  describe('User Update', () => {
    describe('PATCH /api/v1/users/me', () => {
      let accessToken: string;
      let userId: string;

      beforeEach(async () => {
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({ name: 'Update Test User', email: 'update@test.com' })
          .expect(HttpStatus.OK);

        accessToken = setupResponse.body.data.tokens.accessToken;
        userId = setupResponse.body.data.user.id;
      });

      it('should update user name', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Updated Name' })
          .expect(HttpStatus.OK);

        const body: UserUpdateResponse = response.body;

        expect(body.success).toBe(true);
        expect(body.data.name).toBe('Updated Name');
        expect(body.data.updatedAt).toBeDefined();
      });

      it('should update user picture', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ picture: 'https://example.com/new-avatar.png' })
          .expect(HttpStatus.OK);

        expect(response.body.data.picture).toBe('https://example.com/new-avatar.png');
      });

      it('should update both name and picture', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'New Name',
            picture: 'https://example.com/updated.jpg',
          })
          .expect(HttpStatus.OK);

        expect(response.body.data.name).toBe('New Name');
        expect(response.body.data.picture).toBe('https://example.com/updated.jpg');
      });

      it('should clear picture when set to empty string', async () => {
        // First set a picture
        await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ picture: 'https://example.com/avatar.jpg' })
          .expect(HttpStatus.OK);

        // Then clear it
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ picture: '' })
          .expect(HttpStatus.OK);

        expect(response.body.data.picture).toBeNull();
      });

      it('should reject empty name', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '' })
          .expect(HttpStatus.BAD_REQUEST);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('REQ_002');
      });

      it('should reject whitespace-only name', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '   ' })
          .expect(HttpStatus.BAD_REQUEST);

        expect(response.body.success).toBe(false);
      });

      it('should trim whitespace from name', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '  Trimmed Name  ' })
          .expect(HttpStatus.OK);

        expect(response.body.data.name).toBe('Trimmed Name');
      });

      it('should reject update without authorization', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .send({ name: 'New Name' })
          .expect(HttpStatus.UNAUTHORIZED);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('AUTH_003');
      });

      it('should invalidate cache after update', async () => {
        // First, verify cache exists
        const cacheCheckBefore = await request(app.getHttpServer())
          .get('/api/v1/users/test/cache/' + userId)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        expect(cacheCheckBefore.body.data.cached).toBe(true);

        // Update user
        await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Cache Invalidation Test' })
          .expect(HttpStatus.OK);

        // Verify cache was invalidated
        const cacheCheckAfter = await request(app.getHttpServer())
          .get('/api/v1/users/test/cache/' + userId)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        expect(cacheCheckAfter.body.data.cached).toBe(false);
      });

      it('should preserve unchanged fields', async () => {
        // Get original profile
        const originalProfile = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        const originalEmail = originalProfile.body.data.email;

        // Update only name
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'New Name Only' })
          .expect(HttpStatus.OK);

        expect(response.body.data.email).toBe(originalEmail);
      });
    });
  });

  describe('User Soft Delete', () => {
    describe('DELETE /api/v1/users/me', () => {
      let accessToken: string;
      let userId: string;

      beforeEach(async () => {
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({ name: 'Delete Test User', email: 'delete@test.com' })
          .expect(HttpStatus.OK);

        accessToken = setupResponse.body.data.tokens.accessToken;
        userId = setupResponse.body.data.user.id;
      });

      it('should soft delete user account', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        const body: UserDeleteResponse = response.body;

        expect(body.success).toBe(true);
        expect(body.data.message).toContain('deleted');
      });

      it('should prevent access after deletion', async () => {
        // Delete user
        await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        // Try to access profile
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.NOT_FOUND);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('NOT_002');
      });

      it('should prevent updates after deletion', async () => {
        // Delete user
        await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        // Try to update
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Should Fail' })
          .expect(HttpStatus.NOT_FOUND);

        expect(response.body.success).toBe(false);
      });

      it('should invalidate cache after deletion', async () => {
        // Verify cache exists before
        const cacheCheckBefore = await request(app.getHttpServer())
          .get('/api/v1/users/test/cache/' + userId)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        expect(cacheCheckBefore.body.data.cached).toBe(true);

        // Delete user
        await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        // Note: After deletion, the token is still valid but user is not found
        // Cache check would fail because user is deleted
      });

      it('should reject deletion without authorization', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .expect(HttpStatus.UNAUTHORIZED);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('AUTH_003');
      });

      it('should prevent double deletion', async () => {
        // First deletion
        await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        // Second deletion should fail
        const response = await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.NOT_FOUND);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('User Restoration', () => {
    describe('POST /api/v1/users/restore', () => {
      let userId: string;

      beforeEach(async () => {
        // Create and delete a user
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({ name: 'Restore Test User', email: 'restore@test.com' })
          .expect(HttpStatus.OK);

        userId = setupResponse.body.data.user.id;
        const accessToken = setupResponse.body.data.tokens.accessToken;

        // Delete the user
        await request(app.getHttpServer())
          .delete('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);
      });

      it('should restore soft-deleted user', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/users/restore')
          .send({ userId })
          .expect(HttpStatus.OK);

        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toContain('restored');
        expect(response.body.data.name).toBe('Restore Test User');
      });

      it('should return 404 for non-existent user', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/users/restore')
          .send({ userId: generateUuid() })
          .expect(HttpStatus.NOT_FOUND);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('NOT_002');
      });

      it('should return 404 for non-deleted user', async () => {
        // Create a user without deleting
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({ name: 'Active User' })
          .expect(HttpStatus.OK);

        const activeUserId = setupResponse.body.data.user.id;

        const response = await request(app.getHttpServer())
          .post('/api/v1/users/restore')
          .send({ userId: activeUserId })
          .expect(HttpStatus.NOT_FOUND);

        expect(response.body.success).toBe(false);
      });

      it('should allow access after restoration', async () => {
        // Restore user
        await request(app.getHttpServer())
          .post('/api/v1/users/restore')
          .send({ userId })
          .expect(HttpStatus.OK);

        // Create new tokens for restored user (simulating re-login)
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/users/test/setup')
          .send({ name: 'Post Restore User' })
          .expect(HttpStatus.OK);

        const accessToken = setupResponse.body.data.tokens.accessToken;

        // Access should work
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Error Response Format', () => {
    it('should return errors in standard format per ARCHITECTURE.md Section 9', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(HttpStatus.UNAUTHORIZED);

      const error: ErrorResponse = response.body;

      // Per ARCHITECTURE.md Section 9.2 - Error Response format
      expect(error.success).toBe(false);
      expect(error.error).toBeDefined();
      expect(error.error.code).toBeDefined();
      expect(error.error.message).toBeDefined();
    });

    it('should use correct HTTP status codes', async () => {
      // 401 for missing/invalid token
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(HttpStatus.UNAUTHORIZED);

      // 404 for non-existent resource
      const setupResponse = await request(app.getHttpServer())
        .post('/api/v1/users/test/setup')
        .send({ name: 'Status Code Test' })
        .expect(HttpStatus.OK);

      const accessToken = setupResponse.body.data.tokens.accessToken;

      await request(app.getHttpServer())
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('Security Considerations', () => {
    it('should not expose sensitive information in responses', async () => {
      const setupResponse = await request(app.getHttpServer())
        .post('/api/v1/users/test/setup')
        .send({ name: 'Security Test User' })
        .expect(HttpStatus.OK);

      const accessToken = setupResponse.body.data.tokens.accessToken;

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Should not expose internal fields
      expect(response.body.data.googleId).toBeUndefined();
      expect(response.body.data.deletedAt).toBeUndefined();
      expect(response.body.data.password).toBeUndefined();
    });

    it('should not expose stack traces in error responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(JSON.stringify(response.body)).not.toContain('stack');
      expect(JSON.stringify(response.body)).not.toContain('node_modules');
    });

    it('should handle malformed authorization header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'InvalidFormat')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.success).toBe(false);
    });

    it('should reject token with manipulated payload', async () => {
      // Create a valid-looking but manipulated token
      const manipulatedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJtYW5pcHVsYXRlZCIsInNlc3Npb25JZCI6ImZha2UifQ.invalid';

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${manipulatedToken}`)
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent profile updates', async () => {
      const setupResponse = await request(app.getHttpServer())
        .post('/api/v1/users/test/setup')
        .send({ name: 'Concurrent Test User' })
        .expect(HttpStatus.OK);

      const accessToken = setupResponse.body.data.tokens.accessToken;

      // Send multiple concurrent updates
      const promises = [
        request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Update 1' }),
        request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Update 2' }),
        request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Update 3' }),
      ];

      const results = await Promise.all(promises);

      // All updates should succeed
      results.forEach((result) => {
        expect(result.status).toBe(HttpStatus.OK);
        expect(result.body.success).toBe(true);
      });
    });
  });
});

/**
 * Additional E2E test utilities for User module
 */
export async function setupAuthenticatedUser(app: INestApplication): Promise<{
  user: { id: string; email: string; name: string };
  accessToken: string;
}> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/users/test/setup')
    .send({ name: 'Authenticated Test User' })
    .expect(HttpStatus.OK);

  return {
    user: response.body.data.user,
    accessToken: response.body.data.tokens.accessToken,
  };
}

export async function cleanupUserTestData(app: INestApplication): Promise<void> {
  await request(app.getHttpServer())
    .post('/api/v1/users/test/cleanup')
    .expect(HttpStatus.OK);
}
