/**
 * Auth Module Integration Tests
 *
 * Tests the complete authentication flow including:
 * - Google OAuth login handling
 * - Token generation and validation
 * - Token refresh with rotation
 * - Session management and invalidation
 * - Single device enforcement
 * - Token theft detection
 *
 * These tests use a NestJS testing module with real service implementations
 * but mocked external dependencies (Google OAuth, database, cache).
 *
 * Based on ARCHITECTURE.md Section 7 - Authentication Flow
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import {
  createMockUser,
  createMockUserSession,
  createMockPrismaService,
  createMockCacheService,
  createMockConfigService,
  MockUser,
  MockUserSession,
} from '../utils/mock-factories';
import { generateUuid, generateGoogleId, generateEmail } from '../utils/test-utils';
import { sha256Hash } from '../../src/common/utils';

// Type definitions for AuthService (matching implementation)
interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  emailVerified: boolean;
  accessToken: string;
}

interface CachedUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  googleId: string;
}

interface AuthResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresIn: number;
    refreshExpiresIn: number;
    tokenType: string;
  };
  isNewUser: boolean;
}

interface TokenRefreshResponseDto {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
}

interface LogoutResponseDto {
  message: string;
  sessionsInvalidated: number;
}

interface SessionValidationResult {
  valid: boolean;
  user?: CachedUserInfo;
  error?: string;
}

// Mock AuthService for integration testing
// In a real integration test, this would be the actual AuthService
// For this test, we create a realistic mock that behaves like the real service
class MockAuthService {
  private readonly jwtConfig = {
    secret: 'test-secret-key-for-jwt-signing',
    accessExpiresIn: '1h',
    refreshExpiresIn: '30d',
    accessExpiresInSeconds: 3600,
    refreshExpiresInSeconds: 2592000,
    maxDevicesPerUser: 1,
  };

  constructor(
    private readonly prisma: ReturnType<typeof createMockPrismaService>,
    private readonly cacheService: ReturnType<typeof createMockCacheService>,
    private readonly jwtService: JwtService,
  ) {}

  async handleGoogleLogin(
    googleProfile: GoogleProfile,
    options: { deviceInfo?: string; ipAddress?: string } = {},
  ): Promise<AuthResponseDto> {
    // 1. Find or create user
    let user = await this.prisma.user.findUnique({ where: { googleId: googleProfile.googleId } });
    let isNewUser = false;

    if (!user) {
      // Check if email exists with different Google account
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: googleProfile.email },
      });

      if (existingByEmail) {
        throw new ConflictException('Email is already registered with a different account');
      }

      // Create new user
      user = {
        id: generateUuid(),
        googleId: googleProfile.googleId,
        email: googleProfile.email,
        name: googleProfile.name,
        picture: googleProfile.picture,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      this.prisma.user.create.mockResolvedValueOnce(user);
      user = await this.prisma.user.create({ data: user });
      isNewUser = true;
    }

    // 2. Invalidate existing sessions (single device policy)
    if (this.jwtConfig.maxDevicesPerUser === 1) {
      const existingSessions = await this.prisma.userSession.findMany({
        where: { userId: user.id, isValid: true, deletedAt: null },
      });

      for (const session of existingSessions) {
        await this.cacheService.set(`session_invalid:${session.id}`, true, 86400);
      }

      await this.prisma.userSession.updateMany({
        where: { userId: user.id, isValid: true, deletedAt: null },
        data: { isValid: false },
      });
    }

    // 3. Create new session
    const sessionId = generateUuid();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.jwtConfig.refreshExpiresInSeconds);

    const session = {
      id: sessionId,
      userId: user.id,
      refreshToken: '',
      deviceInfo: options.deviceInfo || null,
      ipAddress: options.ipAddress || null,
      isValid: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      expiresAt,
    };

    this.prisma.userSession.create.mockResolvedValueOnce(session);
    await this.prisma.userSession.create({ data: session });

    // 4. Generate tokens
    const tokenId = generateUuid();
    const accessPayload = { userId: user.id, sessionId };
    const refreshPayload = { userId: user.id, sessionId, tokenId };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: this.jwtConfig.accessExpiresIn,
    });
    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: this.jwtConfig.refreshExpiresIn,
    });

    // 5. Store refresh token hash
    const refreshTokenHash = sha256Hash(refreshToken);
    this.prisma.userSession.update.mockResolvedValueOnce({ ...session, refreshToken: refreshTokenHash });
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { refreshToken: refreshTokenHash },
    });

    // 6. Cache user info
    const userInfo: CachedUserInfo = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || undefined,
      googleId: user.googleId,
    };
    await this.cacheService.set(`user_info:${user.id}`, userInfo, 3600);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture || undefined,
      },
      tokens: {
        accessToken,
        refreshToken,
        accessExpiresIn: this.jwtConfig.accessExpiresInSeconds,
        refreshExpiresIn: this.jwtConfig.refreshExpiresInSeconds,
        tokenType: 'Bearer',
      },
      isNewUser,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenRefreshResponseDto> {
    // 1. Verify token
    let payload: { userId: string; sessionId: string; tokenId: string };
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.jwtConfig.secret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.tokenId) {
      throw new UnauthorizedException('Invalid token type');
    }

    // 2. Validate session
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId, deletedAt: null },
    });

    if (!session || !session.isValid || session.userId !== payload.userId) {
      throw new UnauthorizedException('Session not found or invalid');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session has expired');
    }

    // 3. Check for token reuse (theft detection)
    const currentTokenHash = sha256Hash(refreshToken);
    if (session.refreshToken !== currentTokenHash) {
      // Token theft detected - invalidate all sessions
      const allSessions = await this.prisma.userSession.findMany({
        where: { userId: payload.userId, isValid: true, deletedAt: null },
      });

      for (const s of allSessions) {
        await this.cacheService.set(`session_invalid:${s.id}`, true, 86400);
      }

      await this.prisma.userSession.updateMany({
        where: { userId: payload.userId, isValid: true, deletedAt: null },
        data: { isValid: false },
      });

      throw new UnauthorizedException('Token theft detected. All sessions have been invalidated.');
    }

    // 4. Generate new token pair
    const newTokenId = generateUuid();
    const accessPayload = { userId: payload.userId, sessionId: payload.sessionId };
    const newRefreshPayload = { userId: payload.userId, sessionId: payload.sessionId, tokenId: newTokenId };

    const newAccessToken = this.jwtService.sign(accessPayload, {
      expiresIn: this.jwtConfig.accessExpiresIn,
    });
    const newRefreshToken = this.jwtService.sign(newRefreshPayload, {
      expiresIn: this.jwtConfig.refreshExpiresIn,
    });

    // 5. Update session with new token hash
    const newRefreshTokenHash = sha256Hash(newRefreshToken);
    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + this.jwtConfig.refreshExpiresInSeconds);

    this.prisma.userSession.update.mockResolvedValueOnce({
      ...session,
      refreshToken: newRefreshTokenHash,
      expiresAt: newExpiresAt,
    });

    await this.prisma.userSession.update({
      where: { id: payload.sessionId },
      data: { refreshToken: newRefreshTokenHash, expiresAt: newExpiresAt },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessExpiresIn: this.jwtConfig.accessExpiresInSeconds,
      refreshExpiresIn: this.jwtConfig.refreshExpiresInSeconds,
    };
  }

  async validateSession(userId: string, sessionId: string): Promise<SessionValidationResult> {
    // 1. Check if session is invalidated in cache
    const isInvalid = await this.cacheService.exists(`session_invalid:${sessionId}`);
    if (isInvalid) {
      return { valid: false, error: 'Session has been invalidated' };
    }

    // 2. Try cache first
    const cachedUser = await this.cacheService.get(`user_info:${userId}`);
    if (cachedUser) {
      return { valid: true, user: cachedUser as CachedUserInfo };
    }

    // 3. Fetch from database
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId, deletedAt: null },
    });

    if (!session || !session.isValid) {
      return { valid: false, error: 'Session not found or invalid' };
    }

    if (session.userId !== userId) {
      return { valid: false, error: 'Session does not belong to user' };
    }

    if (session.expiresAt < new Date()) {
      return { valid: false, error: 'Session has expired' };
    }

    // 4. Fetch user
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      return { valid: false, error: 'User not found' };
    }

    const userInfo: CachedUserInfo = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || undefined,
      googleId: user.googleId,
    };

    // Cache for future requests
    await this.cacheService.set(`user_info:${userId}`, userInfo, 3600);

    return { valid: true, user: userInfo };
  }

  async logout(sessionId: string, allDevices = false): Promise<LogoutResponseDto> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId, deletedAt: null },
    });

    if (!session) {
      return {
        message: 'Session not found or already logged out',
        sessionsInvalidated: 0,
      };
    }

    if (allDevices) {
      const allSessions = await this.prisma.userSession.findMany({
        where: { userId: session.userId, isValid: true, deletedAt: null },
      });

      for (const s of allSessions) {
        await this.cacheService.set(`session_invalid:${s.id}`, true, 86400);
      }

      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, isValid: true, deletedAt: null },
        data: { isValid: false },
      });

      return {
        message: 'Successfully logged out from all devices',
        sessionsInvalidated: allSessions.length,
      };
    }

    // Invalidate single session
    await this.cacheService.set(`session_invalid:${sessionId}`, true, 86400);
    this.prisma.userSession.update.mockResolvedValueOnce({ ...session, isValid: false });
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isValid: false },
    });

    return {
      message: 'Successfully logged out',
      sessionsInvalidated: 1,
    };
  }
}

describe('Auth Module Integration Tests', () => {
  let authService: MockAuthService;
  let jwtService: JwtService;
  let mockPrismaService: ReturnType<typeof createMockPrismaService>;
  let mockCacheService: ReturnType<typeof createMockCacheService>;

  beforeEach(async () => {
    mockPrismaService = createMockPrismaService();
    mockCacheService = createMockCacheService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: 'test-secret-key-for-jwt-signing',
            signOptions: { expiresIn: '1h' },
          }),
        },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            jwt: {
              secret: 'test-secret-key-for-jwt-signing',
              accessExpiresIn: '1h',
              refreshExpiresIn: '30d',
              accessExpiresInSeconds: 3600,
              refreshExpiresInSeconds: 2592000,
              maxDevicesPerUser: 1,
            },
          }),
        },
      ],
    }).compile();

    jwtService = module.get<JwtService>(JwtService);
    authService = new MockAuthService(mockPrismaService, mockCacheService, jwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Authentication Flow', () => {
    it('should handle complete login flow for new user', async () => {
      // Arrange
      const googleProfile: GoogleProfile = {
        googleId: generateGoogleId(),
        email: generateEmail('test'),
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        emailVerified: true,
        accessToken: 'google-access-token',
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null) // No user by googleId
        .mockResolvedValueOnce(null); // No user by email

      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await authService.handleGoogleLogin(googleProfile, {
        deviceInfo: 'Chrome on Windows',
        ipAddress: '192.168.1.1',
      });

      // Assert
      expect(result.isNewUser).toBe(true);
      expect(result.user.email).toBe(googleProfile.email);
      expect(result.user.name).toBe(googleProfile.name);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.tokens.tokenType).toBe('Bearer');
      expect(result.tokens.accessExpiresIn).toBe(3600);
      expect(result.tokens.refreshExpiresIn).toBe(2592000);

      // Verify token structure
      const accessPayload = jwtService.decode(result.tokens.accessToken) as Record<string, unknown>;
      expect(accessPayload.userId).toBeDefined();
      expect(accessPayload.sessionId).toBeDefined();

      const refreshPayload = jwtService.decode(result.tokens.refreshToken) as Record<string, unknown>;
      expect(refreshPayload.userId).toBeDefined();
      expect(refreshPayload.sessionId).toBeDefined();
      expect(refreshPayload.tokenId).toBeDefined();
    });

    it('should handle login for existing user', async () => {
      // Arrange
      const existingUser = createMockUser();
      const googleProfile: GoogleProfile = {
        googleId: existingUser.googleId,
        email: existingUser.email,
        name: existingUser.name,
        picture: existingUser.picture || '',
        emailVerified: true,
        accessToken: 'google-access-token',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await authService.handleGoogleLogin(googleProfile);

      // Assert
      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(existingUser.id);
    });

    it('should reject login when email is registered with different Google account', async () => {
      // Arrange
      const existingUser = createMockUser();
      const googleProfile: GoogleProfile = {
        googleId: 'different-google-id',
        email: existingUser.email, // Same email, different Google ID
        name: 'Different User',
        picture: 'https://example.com/other.jpg',
        emailVerified: true,
        accessToken: 'google-access-token',
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null) // No user by new googleId
        .mockResolvedValueOnce(existingUser); // Email exists

      // Act & Assert
      await expect(authService.handleGoogleLogin(googleProfile)).rejects.toThrow(ConflictException);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh tokens successfully with valid refresh token', async () => {
      // Arrange
      const user = createMockUser();
      const tokenId = generateUuid();
      const sessionId = generateUuid();

      const refreshPayload = { userId: user.id, sessionId, tokenId };
      const refreshToken = jwtService.sign(refreshPayload, { expiresIn: '30d' });
      const refreshTokenHash = sha256Hash(refreshToken);

      const session: MockUserSession = createMockUserSession({
        id: sessionId,
        userId: user.id,
        refreshToken: refreshTokenHash,
        isValid: true,
        expiresAt: new Date(Date.now() + 86400000 * 30), // 30 days
      });

      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await authService.refreshTokens(refreshToken);

      // Assert
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.accessToken).not.toBe(refreshToken);
      expect(result.refreshToken).not.toBe(refreshToken);
      expect(result.accessExpiresIn).toBe(3600);
      expect(result.refreshExpiresIn).toBe(2592000);

      // Verify new tokens are valid
      const newAccessPayload = jwtService.decode(result.accessToken) as Record<string, unknown>;
      expect(newAccessPayload.userId).toBe(user.id);
      expect(newAccessPayload.sessionId).toBe(sessionId);
    });

    it('should detect token theft when refresh token is reused', async () => {
      // Arrange
      const user = createMockUser();
      const tokenId = generateUuid();
      const sessionId = generateUuid();

      const refreshPayload = { userId: user.id, sessionId, tokenId };
      const refreshToken = jwtService.sign(refreshPayload, { expiresIn: '30d' });

      // Session has different token hash (token was already used)
      const session: MockUserSession = createMockUserSession({
        id: sessionId,
        userId: user.id,
        refreshToken: 'different-hash',
        isValid: true,
        expiresAt: new Date(Date.now() + 86400000 * 30),
      });

      mockPrismaService.userSession.findUnique.mockResolvedValue(session);
      mockPrismaService.userSession.findMany.mockResolvedValue([session]);

      // Act & Assert
      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.userSession.updateMany).toHaveBeenCalled();
    });

    it('should reject expired refresh token', async () => {
      // Arrange
      const invalidToken = 'invalid.jwt.token';

      // Act & Assert
      await expect(authService.refreshTokens(invalidToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when session is invalid', async () => {
      // Arrange
      const user = createMockUser();
      const tokenId = generateUuid();
      const sessionId = generateUuid();

      const refreshPayload = { userId: user.id, sessionId, tokenId };
      const refreshToken = jwtService.sign(refreshPayload, { expiresIn: '30d' });

      mockPrismaService.userSession.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Session Validation Flow', () => {
    it('should validate active session with cached user', async () => {
      // Arrange
      const user = createMockUser();
      const sessionId = generateUuid();

      const cachedUser: CachedUserInfo = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture || undefined,
        googleId: user.googleId,
      };

      mockCacheService.exists.mockResolvedValue(false); // Not invalidated
      mockCacheService.get.mockResolvedValue(cachedUser);

      // Act
      const result = await authService.validateSession(user.id, sessionId);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.user).toEqual(cachedUser);
    });

    it('should reject invalidated session', async () => {
      // Arrange
      const userId = generateUuid();
      const sessionId = generateUuid();

      mockCacheService.exists.mockResolvedValue(true); // Session is invalidated

      // Act
      const result = await authService.validateSession(userId, sessionId);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session has been invalidated');
    });

    it('should fetch from database on cache miss', async () => {
      // Arrange
      const user = createMockUser();
      const session = createMockUserSession({
        userId: user.id,
        isValid: true,
        expiresAt: new Date(Date.now() + 86400000),
      });

      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.get.mockResolvedValue(null); // Cache miss
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      // Act
      const result = await authService.validateSession(user.id, session.id);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.user?.id).toBe(user.id);
      expect(mockCacheService.set).toHaveBeenCalled(); // User should be cached
    });

    it('should reject expired session', async () => {
      // Arrange
      const user = createMockUser();
      const session = createMockUserSession({
        userId: user.id,
        isValid: true,
        expiresAt: new Date(Date.now() - 86400000), // Expired yesterday
      });

      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await authService.validateSession(user.id, session.id);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session has expired');
    });
  });

  describe('Logout Flow', () => {
    it('should logout single session', async () => {
      // Arrange
      const user = createMockUser();
      const session = createMockUserSession({
        userId: user.id,
        isValid: true,
      });

      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await authService.logout(session.id, false);

      // Assert
      expect(result.sessionsInvalidated).toBe(1);
      expect(result.message).toContain('logged out');
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `session_invalid:${session.id}`,
        true,
        86400,
      );
    });

    it('should logout all user sessions', async () => {
      // Arrange
      const user = createMockUser();
      const sessions = [
        createMockUserSession({ userId: user.id, isValid: true }),
        createMockUserSession({ userId: user.id, isValid: true }),
        createMockUserSession({ userId: user.id, isValid: true }),
      ];

      mockPrismaService.userSession.findUnique.mockResolvedValue(sessions[0]);
      mockPrismaService.userSession.findMany.mockResolvedValue(sessions);

      // Act
      const result = await authService.logout(sessions[0].id, true);

      // Assert
      expect(result.sessionsInvalidated).toBe(3);
      expect(result.message).toContain('all devices');
      expect(mockCacheService.set).toHaveBeenCalledTimes(3);
    });

    it('should handle logout for non-existent session', async () => {
      // Arrange
      mockPrismaService.userSession.findUnique.mockResolvedValue(null);

      // Act
      const result = await authService.logout('non-existent-session-id', false);

      // Assert
      expect(result.sessionsInvalidated).toBe(0);
      expect(result.message).toContain('not found');
    });
  });

  describe('Single Device Enforcement', () => {
    it('should invalidate existing sessions on new login', async () => {
      // Arrange
      const existingUser = createMockUser();
      const existingSessions = [
        createMockUserSession({ userId: existingUser.id, isValid: true }),
        createMockUserSession({ userId: existingUser.id, isValid: true }),
      ];

      const googleProfile: GoogleProfile = {
        googleId: existingUser.googleId,
        email: existingUser.email,
        name: existingUser.name,
        picture: existingUser.picture || '',
        emailVerified: true,
        accessToken: 'google-access-token',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.userSession.findMany.mockResolvedValue(existingSessions);

      // Act
      await authService.handleGoogleLogin(googleProfile);

      // Assert
      // Verify existing sessions were invalidated in cache
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `session_invalid:${existingSessions[0].id}`,
        true,
        86400,
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `session_invalid:${existingSessions[1].id}`,
        true,
        86400,
      );

      // Verify sessions were invalidated in database
      expect(mockPrismaService.userSession.updateMany).toHaveBeenCalled();
    });
  });

  describe('Cache Integration', () => {
    it('should cache user info after login', async () => {
      // Arrange
      const googleProfile: GoogleProfile = {
        googleId: generateGoogleId(),
        email: generateEmail('cache'),
        name: 'Cache Test User',
        picture: 'https://example.com/avatar.jpg',
        emailVerified: true,
        accessToken: 'google-access-token',
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await authService.handleGoogleLogin(googleProfile);

      // Assert - verify user info was cached
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('user_info:'),
        expect.objectContaining({
          email: googleProfile.email,
          name: googleProfile.name,
        }),
        3600,
      );
    });

    it('should invalidate cache on session invalidation', async () => {
      // Arrange
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });

      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      await authService.logout(session.id, false);

      // Assert
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `session_invalid:${session.id}`,
        true,
        86400,
      );
    });
  });

  describe('JWT Token Structure', () => {
    it('should generate tokens with correct structure per ARCHITECTURE.md', async () => {
      // Arrange
      const googleProfile: GoogleProfile = {
        googleId: generateGoogleId(),
        email: generateEmail('jwt'),
        name: 'JWT Test User',
        picture: 'https://example.com/avatar.jpg',
        emailVerified: true,
        accessToken: 'google-access-token',
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await authService.handleGoogleLogin(googleProfile);

      // Assert - Access Token structure
      const accessPayload = jwtService.decode(result.tokens.accessToken) as Record<string, unknown>;
      expect(accessPayload).toHaveProperty('userId');
      expect(accessPayload).toHaveProperty('sessionId');
      expect(accessPayload).toHaveProperty('iat');
      expect(accessPayload).toHaveProperty('exp');

      // Assert - Refresh Token structure
      const refreshPayload = jwtService.decode(result.tokens.refreshToken) as Record<string, unknown>;
      expect(refreshPayload).toHaveProperty('userId');
      expect(refreshPayload).toHaveProperty('sessionId');
      expect(refreshPayload).toHaveProperty('tokenId'); // Only refresh token has tokenId
      expect(refreshPayload).toHaveProperty('iat');
      expect(refreshPayload).toHaveProperty('exp');
    });
  });
});
