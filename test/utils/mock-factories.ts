/**
 * Mock Factories
 *
 * Factory functions for creating mock objects for testing.
 * Based on Prisma schema from ARCHITECTURE.md Section 5.2
 */

import { generateUuid, generateEmail, generateGoogleId, createUtcTimestamp } from './test-utils';

/**
 * User entity matching Prisma schema
 */
export interface MockUser {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * UserSession entity matching Prisma schema
 */
export interface MockUserSession {
  id: string;
  userId: string;
  refreshToken: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  isValid: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  expiresAt: Date;
}

/**
 * JWT Access Token payload
 */
export interface MockAccessTokenPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * JWT Refresh Token payload
 */
export interface MockRefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenId: string;
  iat: number;
  exp: number;
}

/**
 * Google OAuth profile
 */
export interface MockGoogleProfile {
  id: string;
  displayName: string;
  emails: Array<{ value: string; verified: boolean }>;
  photos: Array<{ value: string }>;
  provider: string;
}

/**
 * Cache service interface
 */
export interface MockCacheService {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  exists: jest.Mock;
  expire: jest.Mock;
  ttl: jest.Mock;
}

/**
 * PrismaService mock interface
 */
export interface MockPrismaService {
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  userSession: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
}

/**
 * Creates a mock User with optional overrides
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const now = new Date();
  return {
    id: generateUuid(),
    googleId: generateGoogleId(),
    email: generateEmail(),
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Creates a mock UserSession with optional overrides
 */
export function createMockUserSession(
  overrides: Partial<MockUserSession> = {},
): MockUserSession {
  const now = new Date();
  const expiresAt = createUtcTimestamp(24 * 30); // 30 days from now
  return {
    id: generateUuid(),
    userId: overrides.userId || generateUuid(),
    refreshToken: `refresh_${generateUuid()}`,
    deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ipAddress: '127.0.0.1',
    isValid: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    expiresAt,
    ...overrides,
  };
}

/**
 * Creates a mock Access Token payload
 */
export function createMockAccessTokenPayload(
  overrides: Partial<MockAccessTokenPayload> = {},
): MockAccessTokenPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    userId: generateUuid(),
    sessionId: generateUuid(),
    iat: now,
    exp: now + 3600, // 1 hour
    ...overrides,
  };
}

/**
 * Creates a mock Refresh Token payload
 */
export function createMockRefreshTokenPayload(
  overrides: Partial<MockRefreshTokenPayload> = {},
): MockRefreshTokenPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    userId: generateUuid(),
    sessionId: generateUuid(),
    tokenId: generateUuid(),
    iat: now,
    exp: now + 60 * 60 * 24 * 30, // 30 days
    ...overrides,
  };
}

/**
 * Creates a mock Google OAuth profile
 */
export function createMockGoogleProfile(
  overrides: Partial<MockGoogleProfile> = {},
): MockGoogleProfile {
  const email = generateEmail('google');
  return {
    id: generateGoogleId(),
    displayName: 'Google Test User',
    emails: [{ value: email, verified: true }],
    photos: [{ value: 'https://lh3.googleusercontent.com/avatar' }],
    provider: 'google',
    ...overrides,
  };
}

/**
 * Creates a mock CacheService
 */
export function createMockCacheService(): MockCacheService {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
  };
}

/**
 * Creates a mock PrismaService
 */
export function createMockPrismaService(): MockPrismaService {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    userSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn((callback) => callback({
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      userSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    })),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock JwtService
 */
export function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock.jwt.token'),
    signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
    verify: jest.fn().mockReturnValue(createMockAccessTokenPayload()),
    verifyAsync: jest.fn().mockResolvedValue(createMockAccessTokenPayload()),
    decode: jest.fn().mockReturnValue(createMockAccessTokenPayload()),
  };
}

/**
 * Creates a mock ConfigService
 */
export function createMockConfigService(config: Record<string, any> = {}) {
  const defaultConfig: Record<string, any> = {
    NODE_ENV: 'test',
    PORT: 3000,
    JWT_SECRET: 'test-secret',
    JWT_ACCESS_EXPIRES_IN: '1h',
    JWT_REFRESH_EXPIRES_IN: '30d',
    REDIS_MODE: 'direct',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
    MAX_DEVICES_PER_USER: 1,
    DEFAULT_TIMEZONE: 'Asia/Seoul',
    ENCRYPTION_KEY: 'test-32-byte-encryption-key-123',
    ...config,
  };

  return {
    get: jest.fn((key: string, defaultValue?: any) => {
      return defaultConfig[key] ?? defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      const value = defaultConfig[key];
      if (value === undefined) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }
      return value;
    }),
  };
}

/**
 * Creates a mock EncryptionService
 */
export function createMockEncryptionService() {
  return {
    encrypt: jest.fn((plainText: string) => `encrypted:${plainText}`),
    decrypt: jest.fn((cipherText: string) => cipherText.replace('encrypted:', '')),
    hashForSearch: jest.fn((plainText: string) => `hash:${plainText}`),
  };
}

/**
 * Creates a mock TimezoneService
 */
export function createMockTimezoneService() {
  return {
    convertToTimezone: jest.fn((date: Date, timezone: string) => date),
    convertToUtc: jest.fn((date: Date, timezone: string) => date),
    formatDate: jest.fn((date: Date) => date.toISOString()),
    getTimezone: jest.fn(() => 'Asia/Seoul'),
  };
}

/**
 * Creates a mock LoggerService
 */
export function createMockLoggerService() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    setContext: jest.fn(),
  };
}

/**
 * Creates a mock Socket.io Server
 */
export function createMockSocketServer() {
  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    adapter: jest.fn().mockReturnThis(),
    sockets: {
      adapter: {
        rooms: new Map(),
        sids: new Map(),
      },
    },
    use: jest.fn(),
    on: jest.fn(),
  };

  return mockServer;
}

/**
 * Creates a mock Redis client for direct mode
 */
export function createMockRedisClient() {
  const store = new Map<string, { value: string; expireAt?: number }>();

  return {
    get: jest.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expireAt && Date.now() > entry.expireAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: jest.fn(async (key: string, value: string, mode?: string, duration?: number) => {
      const entry: { value: string; expireAt?: number } = { value };
      if (mode === 'EX' && duration) {
        entry.expireAt = Date.now() + duration * 1000;
      } else if (mode === 'PX' && duration) {
        entry.expireAt = Date.now() + duration;
      }
      store.set(key, entry);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      let count = 0;
      keys.forEach((key) => {
        if (store.delete(key)) count++;
      });
      return count;
    }),
    exists: jest.fn(async (...keys: string[]) => {
      return keys.filter((key) => store.has(key)).length;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expireAt = Date.now() + seconds * 1000;
      return 1;
    }),
    ttl: jest.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return -2;
      if (!entry.expireAt) return -1;
      return Math.ceil((entry.expireAt - Date.now()) / 1000);
    }),
    keys: jest.fn(async (pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(store.keys()).filter((key) => regex.test(key));
    }),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    duplicate: jest.fn().mockReturnThis(),
    status: 'ready',
    // For clearing the mock store in tests
    _clearStore: () => store.clear(),
  };
}

/**
 * Creates a mock HTTP request for testing guards/interceptors
 */
export function createMockExecutionContext(request: Record<string, any> = {}) {
  const mockRequest = {
    headers: { authorization: 'Bearer mock-token' },
    ip: '127.0.0.1',
    method: 'GET',
    url: '/api/v1/test',
    user: null,
    ...request,
  };

  const mockResponse = {
    statusCode: 200,
    setHeader: jest.fn(),
    json: jest.fn(),
  };

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue(mockResponse),
    }),
    switchToWs: jest.fn().mockReturnValue({
      getClient: jest.fn().mockReturnValue({}),
      getData: jest.fn().mockReturnValue({}),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
    getArgs: jest.fn().mockReturnValue([mockRequest, mockResponse]),
    getArgByIndex: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
  };
}

/**
 * Creates a factory function with defaults
 */
export function createFactory<T>(
  defaultFactory: () => T,
): (overrides?: Partial<T>) => T {
  return (overrides: Partial<T> = {}) => ({
    ...defaultFactory(),
    ...overrides,
  });
}

// Export pre-configured factories
export const userFactory = createFactory(createMockUser);
export const userSessionFactory = createFactory(createMockUserSession);
export const accessTokenPayloadFactory = createFactory(createMockAccessTokenPayload);
export const refreshTokenPayloadFactory = createFactory(createMockRefreshTokenPayload);
export const googleProfileFactory = createFactory(createMockGoogleProfile);
