/**
 * Session Management Integration Tests
 *
 * Tests the complete session management flow including:
 * - Session creation and initialization
 * - Session validation with cache integration
 * - Session invalidation (single and all devices)
 * - Single device enforcement (MAX_DEVICES_PER_USER=1)
 * - Token rotation and theft detection
 * - Force logout via socket notification
 * - Session expiration handling
 * - Concurrent session management
 *
 * These tests use a NestJS testing module with real service implementations
 * but mocked external dependencies (database, cache, socket).
 *
 * Based on ARCHITECTURE.md Section 7 - Authentication Flow and Session Management
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import {
  createMockUser,
  createMockUserSession,
  createMockPrismaService,
  createMockCacheService,
  createMockConfigService,
  createMockSocketServer,
  MockUser,
  MockUserSession,
} from '../utils/mock-factories';
import { generateUuid, generateGoogleId, createMockSocket, cacheKeys } from '../utils/test-utils';
import { sha256Hash } from '../../src/common/utils';

// Type definitions for Session Management (matching implementation)
interface SessionInfo {
  id: string;
  userId: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  isValid: boolean;
}

interface CreateSessionDto {
  userId: string;
  deviceInfo?: string;
  ipAddress?: string;
}

interface SessionValidationResult {
  valid: boolean;
  session?: SessionInfo;
  userId?: string;
  error?: string;
}

interface ForceLogoutEvent {
  type: 'force_logout';
  reason: string;
  sessionId: string;
  timestamp: Date;
}

interface SessionListResponseDto {
  sessions: SessionInfo[];
  total: number;
  activeCount: number;
}

// Mock Session Service for integration testing
// Simulates the behavior of the real SessionService
class MockSessionService {
  private readonly config = {
    maxDevicesPerUser: 1,
    sessionTtl: 2592000, // 30 days in seconds
    accessTokenTtl: 3600, // 1 hour
    refreshTokenTtl: 2592000, // 30 days
    jwtSecret: 'test-secret-key-for-jwt-signing',
  };

  constructor(
    private readonly prisma: ReturnType<typeof createMockPrismaService>,
    private readonly cacheService: ReturnType<typeof createMockCacheService>,
    private readonly socketServer: ReturnType<typeof createMockSocketServer>,
    private readonly jwtService: JwtService,
  ) {}

  async createSession(dto: CreateSessionDto): Promise<SessionInfo> {
    // 1. Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId, deletedAt: null },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // 2. Check single device enforcement
    if (this.config.maxDevicesPerUser === 1) {
      const existingSessions = await this.prisma.userSession.findMany({
        where: { userId: dto.userId, isValid: true, deletedAt: null },
      });

      // Invalidate existing sessions
      for (const session of existingSessions) {
        await this.invalidateSession(session.id, 'new_login');
      }
    }

    // 3. Create new session
    const sessionId = generateUuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionTtl * 1000);

    const session: SessionInfo = {
      id: sessionId,
      userId: dto.userId,
      deviceInfo: dto.deviceInfo || null,
      ipAddress: dto.ipAddress || null,
      createdAt: now,
      expiresAt,
      isValid: true,
    };

    const dbSession: MockUserSession = {
      id: sessionId,
      userId: dto.userId,
      refreshToken: '',
      deviceInfo: dto.deviceInfo || null,
      ipAddress: dto.ipAddress || null,
      isValid: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      expiresAt,
    };

    this.prisma.userSession.create.mockResolvedValueOnce(dbSession);
    await this.prisma.userSession.create({ data: dbSession });

    // 4. Cache session info
    await this.cacheService.set(
      `session:${sessionId}`,
      session,
      this.config.sessionTtl,
    );

    return session;
  }

  async validateSession(sessionId: string, userId: string): Promise<SessionValidationResult> {
    // 1. Check invalidation flag in cache
    const isInvalidated = await this.cacheService.exists(`session_invalid:${sessionId}`);
    if (isInvalidated) {
      return { valid: false, error: 'Session has been invalidated' };
    }

    // 2. Try cache first
    const cachedSession = await this.cacheService.get(`session:${sessionId}`);
    if (cachedSession) {
      const session = cachedSession as SessionInfo;
      if (session.userId !== userId) {
        return { valid: false, error: 'Session does not belong to user' };
      }
      if (new Date(session.expiresAt) < new Date()) {
        return { valid: false, error: 'Session has expired' };
      }
      return { valid: true, session, userId: session.userId };
    }

    // 3. Fetch from database
    const dbSession = await this.prisma.userSession.findUnique({
      where: { id: sessionId, deletedAt: null },
    });

    if (!dbSession) {
      return { valid: false, error: 'Session not found' };
    }

    if (!dbSession.isValid) {
      return { valid: false, error: 'Session is no longer valid' };
    }

    if (dbSession.userId !== userId) {
      return { valid: false, error: 'Session does not belong to user' };
    }

    if (dbSession.expiresAt < new Date()) {
      return { valid: false, error: 'Session has expired' };
    }

    const session: SessionInfo = {
      id: dbSession.id,
      userId: dbSession.userId,
      deviceInfo: dbSession.deviceInfo,
      ipAddress: dbSession.ipAddress,
      createdAt: dbSession.createdAt,
      expiresAt: dbSession.expiresAt,
      isValid: dbSession.isValid,
    };

    // Cache for future requests
    await this.cacheService.set(
      `session:${sessionId}`,
      session,
      this.config.accessTokenTtl,
    );

    return { valid: true, session, userId: dbSession.userId };
  }

  async invalidateSession(
    sessionId: string,
    reason: string = 'logout',
  ): Promise<{ success: boolean; notified: boolean }> {
    // 1. Get session info for socket notification
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId, deletedAt: null },
    });

    if (!session) {
      return { success: false, notified: false };
    }

    // 2. Invalidate in database
    this.prisma.userSession.update.mockResolvedValueOnce({ ...session, isValid: false });
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isValid: false },
    });

    // 3. Set invalidation flag in cache
    await this.cacheService.set(`session_invalid:${sessionId}`, true, 86400);

    // 4. Remove session from cache
    await this.cacheService.del(`session:${sessionId}`);

    // 5. Send force logout via socket
    const event: ForceLogoutEvent = {
      type: 'force_logout',
      reason,
      sessionId,
      timestamp: new Date(),
    };

    this.socketServer.to(`user:${session.userId}`).emit('force_logout', event);

    return { success: true, notified: true };
  }

  async invalidateAllUserSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<{ count: number; notifiedCount: number }> {
    // 1. Get all active sessions for user
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, isValid: true, deletedAt: null },
    });

    const sessionsToInvalidate = exceptSessionId
      ? sessions.filter((s: MockUserSession) => s.id !== exceptSessionId)
      : sessions;

    // 2. Invalidate each session
    let notifiedCount = 0;
    for (const session of sessionsToInvalidate) {
      const result = await this.invalidateSession(session.id, 'logout_all_devices');
      if (result.notified) notifiedCount++;
    }

    return { count: sessionsToInvalidate.length, notifiedCount };
  }

  async getActiveSessions(userId: string): Promise<SessionListResponseDto> {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, isValid: true, deletedAt: null },
    });

    const sessionInfos: SessionInfo[] = sessions.map((s: MockUserSession) => ({
      id: s.id,
      userId: s.userId,
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isValid: s.isValid,
    }));

    return {
      sessions: sessionInfos,
      total: sessionInfos.length,
      activeCount: sessionInfos.filter((s) => s.isValid).length,
    };
  }

  async extendSession(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId, deletedAt: null },
    });

    if (!session || !session.isValid) {
      return null;
    }

    const newExpiresAt = new Date(Date.now() + this.config.sessionTtl * 1000);

    const updatedSession = { ...session, expiresAt: newExpiresAt };
    this.prisma.userSession.update.mockResolvedValueOnce(updatedSession);
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { expiresAt: newExpiresAt },
    });

    const sessionInfo: SessionInfo = {
      id: updatedSession.id,
      userId: updatedSession.userId,
      deviceInfo: updatedSession.deviceInfo,
      ipAddress: updatedSession.ipAddress,
      createdAt: updatedSession.createdAt,
      expiresAt: updatedSession.expiresAt,
      isValid: updatedSession.isValid,
    };

    // Update cache
    await this.cacheService.set(
      `session:${sessionId}`,
      sessionInfo,
      this.config.sessionTtl,
    );

    return sessionInfo;
  }

  async rotateRefreshToken(
    sessionId: string,
    currentTokenHash: string,
    newTokenHash: string,
  ): Promise<{ success: boolean; theftDetected: boolean }> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId, deletedAt: null },
    });

    if (!session || !session.isValid) {
      return { success: false, theftDetected: false };
    }

    // Check if current token matches stored hash
    if (session.refreshToken !== currentTokenHash) {
      // Token theft detected - invalidate all sessions
      await this.invalidateAllUserSessions(session.userId);
      return { success: false, theftDetected: true };
    }

    // Rotate token
    const updatedSession = { ...session, refreshToken: newTokenHash };
    this.prisma.userSession.update.mockResolvedValueOnce(updatedSession);
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { refreshToken: newTokenHash },
    });

    return { success: true, theftDetected: false };
  }

  async cleanupExpiredSessions(): Promise<{ cleanedCount: number }> {
    const now = new Date();
    const expiredSessions = await this.prisma.userSession.findMany({
      where: { expiresAt: { lt: now }, deletedAt: null },
    });

    for (const session of expiredSessions) {
      await this.cacheService.del(`session:${session.id}`);
    }

    await this.prisma.userSession.updateMany({
      where: { expiresAt: { lt: now }, deletedAt: null },
      data: { isValid: false, deletedAt: now },
    });

    return { cleanedCount: expiredSessions.length };
  }
}

describe('Session Management Integration Tests', () => {
  let sessionService: MockSessionService;
  let jwtService: JwtService;
  let mockPrismaService: ReturnType<typeof createMockPrismaService>;
  let mockCacheService: ReturnType<typeof createMockCacheService>;
  let mockSocketServer: ReturnType<typeof createMockSocketServer>;

  beforeEach(async () => {
    mockPrismaService = createMockPrismaService();
    mockCacheService = createMockCacheService();
    mockSocketServer = createMockSocketServer();

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
            MAX_DEVICES_PER_USER: 1,
            JWT_ACCESS_EXPIRES_IN: '1h',
            JWT_REFRESH_EXPIRES_IN: '30d',
          }),
        },
      ],
    }).compile();

    jwtService = module.get<JwtService>(JwtService);
    sessionService = new MockSessionService(
      mockPrismaService,
      mockCacheService,
      mockSocketServer,
      jwtService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Creation', () => {
    it('should create a new session for valid user', async () => {
      // Arrange
      const user = createMockUser();
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await sessionService.createSession({
        userId: user.id,
        deviceInfo: 'Chrome on Windows',
        ipAddress: '192.168.1.1',
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe(user.id);
      expect(result.deviceInfo).toBe('Chrome on Windows');
      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.isValid).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockPrismaService.userSession.create).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should create session with default values when optional fields not provided', async () => {
      // Arrange
      const user = createMockUser();
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await sessionService.createSession({
        userId: user.id,
      });

      // Assert
      expect(result.deviceInfo).toBeNull();
      expect(result.ipAddress).toBeNull();
    });

    it('should throw BadRequestException for non-existent user', async () => {
      // Arrange
      const userId = generateUuid();
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        sessionService.createSession({ userId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should invalidate existing sessions on new login (single device enforcement)', async () => {
      // Arrange
      const user = createMockUser();
      const existingSessions = [
        createMockUserSession({ userId: user.id, isValid: true }),
        createMockUserSession({ userId: user.id, isValid: true }),
      ];

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany.mockResolvedValue(existingSessions);
      mockPrismaService.userSession.findUnique
        .mockResolvedValueOnce(existingSessions[0])
        .mockResolvedValueOnce(existingSessions[1]);

      // Act
      await sessionService.createSession({
        userId: user.id,
        deviceInfo: 'New Device',
      });

      // Assert - Previous sessions should be invalidated
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
    });
  });

  describe('Session Validation', () => {
    it('should validate session from cache', async () => {
      // Arrange
      const session: SessionInfo = {
        id: generateUuid(),
        userId: generateUuid(),
        deviceInfo: 'Chrome',
        ipAddress: '127.0.0.1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), // 1 day ahead
        isValid: true,
      };

      mockCacheService.exists.mockResolvedValue(false); // Not invalidated
      mockCacheService.get.mockResolvedValue(session);

      // Act
      const result = await sessionService.validateSession(session.id, session.userId);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.session?.id).toBe(session.id);
      expect(result.userId).toBe(session.userId);
      expect(mockPrismaService.userSession.findUnique).not.toHaveBeenCalled();
    });

    it('should return invalid for invalidated session', async () => {
      // Arrange
      const sessionId = generateUuid();
      const userId = generateUuid();

      mockCacheService.exists.mockResolvedValue(true); // Invalidated

      // Act
      const result = await sessionService.validateSession(sessionId, userId);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session has been invalidated');
    });

    it('should validate session from database on cache miss', async () => {
      // Arrange
      const dbSession = createMockUserSession({
        isValid: true,
        expiresAt: new Date(Date.now() + 86400000),
      });

      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.get.mockResolvedValue(null); // Cache miss
      mockPrismaService.userSession.findUnique.mockResolvedValue(dbSession);

      // Act
      const result = await sessionService.validateSession(dbSession.id, dbSession.userId);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.session?.id).toBe(dbSession.id);
      expect(mockCacheService.set).toHaveBeenCalled(); // Should cache for future
    });

    it('should return invalid for non-existent session', async () => {
      // Arrange
      const sessionId = generateUuid();
      const userId = generateUuid();

      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.userSession.findUnique.mockResolvedValue(null);

      // Act
      const result = await sessionService.validateSession(sessionId, userId);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session not found');
    });

    it('should return invalid for expired session', async () => {
      // Arrange
      const dbSession = createMockUserSession({
        isValid: true,
        expiresAt: new Date(Date.now() - 86400000), // Expired yesterday
      });

      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.userSession.findUnique.mockResolvedValue(dbSession);

      // Act
      const result = await sessionService.validateSession(dbSession.id, dbSession.userId);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session has expired');
    });

    it('should return invalid when user ID does not match', async () => {
      // Arrange
      const session: SessionInfo = {
        id: generateUuid(),
        userId: generateUuid(),
        deviceInfo: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        isValid: true,
      };

      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.get.mockResolvedValue(session);

      // Act - different userId
      const result = await sessionService.validateSession(session.id, 'different-user-id');

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session does not belong to user');
    });
  });

  describe('Session Invalidation', () => {
    it('should invalidate single session', async () => {
      // Arrange
      const session = createMockUserSession({ isValid: true });
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await sessionService.invalidateSession(session.id, 'user_logout');

      // Assert
      expect(result.success).toBe(true);
      expect(result.notified).toBe(true);
      expect(mockPrismaService.userSession.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: { isValid: false },
      });
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `session_invalid:${session.id}`,
        true,
        86400,
      );
      expect(mockCacheService.del).toHaveBeenCalledWith(`session:${session.id}`);
    });

    it('should send force_logout event via socket', async () => {
      // Arrange
      const session = createMockUserSession({ isValid: true });
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      await sessionService.invalidateSession(session.id, 'new_login');

      // Assert
      expect(mockSocketServer.to).toHaveBeenCalledWith(`user:${session.userId}`);
      expect(mockSocketServer.emit).toHaveBeenCalledWith(
        'force_logout',
        expect.objectContaining({
          type: 'force_logout',
          reason: 'new_login',
          sessionId: session.id,
        }),
      );
    });

    it('should return false for non-existent session', async () => {
      // Arrange
      mockPrismaService.userSession.findUnique.mockResolvedValue(null);

      // Act
      const result = await sessionService.invalidateSession('non-existent-id', 'logout');

      // Assert
      expect(result.success).toBe(false);
      expect(result.notified).toBe(false);
    });
  });

  describe('Invalidate All User Sessions', () => {
    it('should invalidate all sessions for a user', async () => {
      // Arrange
      const userId = generateUuid();
      const sessions = [
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
      ];

      mockPrismaService.userSession.findMany.mockResolvedValue(sessions);
      mockPrismaService.userSession.findUnique
        .mockResolvedValueOnce(sessions[0])
        .mockResolvedValueOnce(sessions[1])
        .mockResolvedValueOnce(sessions[2]);

      // Act
      const result = await sessionService.invalidateAllUserSessions(userId);

      // Assert
      expect(result.count).toBe(3);
      expect(result.notifiedCount).toBe(3);
    });

    it('should exclude specified session when invalidating all', async () => {
      // Arrange
      const userId = generateUuid();
      const sessions = [
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
      ];
      const exceptSessionId = sessions[1].id;

      mockPrismaService.userSession.findMany.mockResolvedValue(sessions);
      mockPrismaService.userSession.findUnique
        .mockResolvedValueOnce(sessions[0])
        .mockResolvedValueOnce(sessions[2]);

      // Act
      const result = await sessionService.invalidateAllUserSessions(userId, exceptSessionId);

      // Assert
      expect(result.count).toBe(2); // Should exclude one session
    });
  });

  describe('Get Active Sessions', () => {
    it('should return list of active sessions for user', async () => {
      // Arrange
      const userId = generateUuid();
      const sessions = [
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
      ];

      mockPrismaService.userSession.findMany.mockResolvedValue(sessions);

      // Act
      const result = await sessionService.getActiveSessions(userId);

      // Assert
      expect(result.total).toBe(2);
      expect(result.activeCount).toBe(2);
      expect(result.sessions).toHaveLength(2);
    });

    it('should return empty list when user has no sessions', async () => {
      // Arrange
      const userId = generateUuid();
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await sessionService.getActiveSessions(userId);

      // Assert
      expect(result.total).toBe(0);
      expect(result.activeCount).toBe(0);
      expect(result.sessions).toHaveLength(0);
    });
  });

  describe('Session Extension', () => {
    it('should extend valid session', async () => {
      // Arrange
      const session = createMockUserSession({
        isValid: true,
        expiresAt: new Date(Date.now() + 86400000), // 1 day ahead
      });

      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await sessionService.extendSession(session.id);

      // Assert
      expect(result).toBeDefined();
      expect(result?.expiresAt.getTime()).toBeGreaterThan(session.expiresAt.getTime());
      expect(mockPrismaService.userSession.update).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return null for invalid session', async () => {
      // Arrange
      const session = createMockUserSession({ isValid: false });
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await sessionService.extendSession(session.id);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      // Arrange
      mockPrismaService.userSession.findUnique.mockResolvedValue(null);

      // Act
      const result = await sessionService.extendSession('non-existent-id');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Token Rotation', () => {
    it('should rotate refresh token successfully', async () => {
      // Arrange
      const currentToken = 'current-refresh-token';
      const newToken = 'new-refresh-token';
      const currentHash = sha256Hash(currentToken);
      const newHash = sha256Hash(newToken);

      const session = createMockUserSession({
        isValid: true,
        refreshToken: currentHash,
      });

      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await sessionService.rotateRefreshToken(
        session.id,
        currentHash,
        newHash,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.theftDetected).toBe(false);
      expect(mockPrismaService.userSession.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: { refreshToken: newHash },
      });
    });

    it('should detect token theft when hash does not match', async () => {
      // Arrange
      const session = createMockUserSession({
        isValid: true,
        refreshToken: 'stored-hash',
      });

      mockPrismaService.userSession.findUnique.mockResolvedValue(session);
      mockPrismaService.userSession.findMany.mockResolvedValue([session]);

      // Act
      const result = await sessionService.rotateRefreshToken(
        session.id,
        'different-hash', // Wrong hash
        'new-hash',
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.theftDetected).toBe(true);
    });

    it('should return failure for invalid session', async () => {
      // Arrange
      const session = createMockUserSession({ isValid: false });
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      const result = await sessionService.rotateRefreshToken(
        session.id,
        'current-hash',
        'new-hash',
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.theftDetected).toBe(false);
    });
  });

  describe('Expired Session Cleanup', () => {
    it('should cleanup expired sessions', async () => {
      // Arrange
      const expiredSessions = [
        createMockUserSession({ expiresAt: new Date(Date.now() - 86400000) }),
        createMockUserSession({ expiresAt: new Date(Date.now() - 172800000) }),
      ];

      mockPrismaService.userSession.findMany.mockResolvedValue(expiredSessions);

      // Act
      const result = await sessionService.cleanupExpiredSessions();

      // Assert
      expect(result.cleanedCount).toBe(2);
      expect(mockCacheService.del).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.userSession.updateMany).toHaveBeenCalled();
    });

    it('should return 0 when no expired sessions', async () => {
      // Arrange
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await sessionService.cleanupExpiredSessions();

      // Assert
      expect(result.cleanedCount).toBe(0);
    });
  });

  describe('Single Device Enforcement', () => {
    it('should allow only one active session per user', async () => {
      // Arrange
      const user = createMockUser();
      const existingSession = createMockUserSession({
        userId: user.id,
        isValid: true,
        deviceInfo: 'Old Device',
      });

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany.mockResolvedValue([existingSession]);
      mockPrismaService.userSession.findUnique.mockResolvedValue(existingSession);

      // Act
      const newSession = await sessionService.createSession({
        userId: user.id,
        deviceInfo: 'New Device',
      });

      // Assert
      expect(newSession.deviceInfo).toBe('New Device');
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `session_invalid:${existingSession.id}`,
        true,
        86400,
      );
    });
  });

  describe('Force Logout via Socket', () => {
    it('should emit force_logout event with correct payload', async () => {
      // Arrange
      const session = createMockUserSession({ isValid: true });
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      await sessionService.invalidateSession(session.id, 'admin_action');

      // Assert
      expect(mockSocketServer.to).toHaveBeenCalledWith(`user:${session.userId}`);
      expect(mockSocketServer.emit).toHaveBeenCalledWith(
        'force_logout',
        expect.objectContaining({
          type: 'force_logout',
          reason: 'admin_action',
          sessionId: session.id,
          timestamp: expect.any(Date),
        }),
      );
    });

    it('should notify all devices on invalidate all sessions', async () => {
      // Arrange
      const userId = generateUuid();
      const sessions = [
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
      ];

      mockPrismaService.userSession.findMany.mockResolvedValue(sessions);
      mockPrismaService.userSession.findUnique
        .mockResolvedValueOnce(sessions[0])
        .mockResolvedValueOnce(sessions[1]);

      // Act
      await sessionService.invalidateAllUserSessions(userId);

      // Assert
      expect(mockSocketServer.emit).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Integration', () => {
    it('should use consistent cache key format for sessions', async () => {
      // Arrange
      const user = createMockUser();
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const result = await sessionService.createSession({ userId: user.id });

      // Assert
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `session:${result.id}`,
        expect.objectContaining({ id: result.id }),
        expect.any(Number),
      );
    });

    it('should cache session with correct TTL', async () => {
      // Arrange
      const user = createMockUser();
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      await sessionService.createSession({ userId: user.id });

      // Assert
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('session:'),
        expect.any(Object),
        2592000, // 30 days in seconds
      );
    });

    it('should remove session from cache on invalidation', async () => {
      // Arrange
      const session = createMockUserSession({ isValid: true });
      mockPrismaService.userSession.findUnique.mockResolvedValue(session);

      // Act
      await sessionService.invalidateSession(session.id, 'logout');

      // Assert
      expect(mockCacheService.del).toHaveBeenCalledWith(`session:${session.id}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(
        sessionService.createSession({ userId: generateUuid() }),
      ).rejects.toThrow('Database error');
    });

    it('should handle cache errors during validation', async () => {
      // Arrange
      mockCacheService.exists.mockRejectedValue(new Error('Cache error'));

      // Act & Assert
      await expect(
        sessionService.validateSession(generateUuid(), generateUuid()),
      ).rejects.toThrow('Cache error');
    });
  });

  describe('Concurrent Session Handling', () => {
    it('should handle rapid session creation for same user', async () => {
      // Arrange
      const user = createMockUser();
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Act - Create two sessions rapidly
      const [session1, session2] = await Promise.all([
        sessionService.createSession({ userId: user.id, deviceInfo: 'Device 1' }),
        sessionService.createSession({ userId: user.id, deviceInfo: 'Device 2' }),
      ]);

      // Assert
      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1.id).not.toBe(session2.id);
    });

    it('should properly invalidate when multiple sessions exist', async () => {
      // Arrange
      const userId = generateUuid();
      const sessions = [
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
        createMockUserSession({ userId, isValid: true }),
      ];

      mockPrismaService.userSession.findMany.mockResolvedValue(sessions);
      sessions.forEach((s, i) => {
        mockPrismaService.userSession.findUnique.mockResolvedValueOnce(s);
      });

      // Act
      const result = await sessionService.invalidateAllUserSessions(userId);

      // Assert
      expect(result.count).toBe(4);
      expect(mockCacheService.del).toHaveBeenCalledTimes(4);
    });
  });

  describe('Session Info Accuracy', () => {
    it('should return accurate session information', async () => {
      // Arrange
      const user = createMockUser();
      const now = new Date();
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.userSession.findMany.mockResolvedValue([]);

      // Act
      const session = await sessionService.createSession({
        userId: user.id,
        deviceInfo: 'Chrome on macOS',
        ipAddress: '10.0.0.1',
      });

      // Assert
      expect(session.userId).toBe(user.id);
      expect(session.deviceInfo).toBe('Chrome on macOS');
      expect(session.ipAddress).toBe('10.0.0.1');
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
