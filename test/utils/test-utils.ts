/**
 * Test Utilities
 *
 * Common utilities for testing NestJS Backend Engine.
 * Provides helpers for creating test modules, managing test lifecycle,
 * and common test operations.
 */

import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Type } from '@nestjs/common';

/**
 * Test context interface
 */
export interface TestContext {
  app: INestApplication;
  module: TestingModule;
}

/**
 * Creates a test application with standard configuration
 * matching production setup (ValidationPipe, etc.)
 */
export async function createTestApp(
  moduleBuilder: TestingModuleBuilder,
): Promise<TestContext> {
  const module = await moduleBuilder.compile();
  const app = module.createNestApplication();

  // Apply same pipes as production
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  return { app, module };
}

/**
 * Safely closes a test application
 */
export async function closeTestApp(context: TestContext): Promise<void> {
  if (context?.app) {
    await context.app.close();
  }
}

/**
 * Creates a minimal test module with specified providers
 */
export async function createTestModule(
  providers: any[],
  imports: any[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports,
    providers,
  }).compile();
}

/**
 * Get a service instance from a test module
 */
export function getService<T>(module: TestingModule, serviceClass: Type<T>): T {
  return module.get<T>(serviceClass);
}

/**
 * Waits for a specified duration (use sparingly in tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates a random UUID v4 for testing
 */
export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a random email for testing
 */
export function generateEmail(prefix = 'test'): string {
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}.${random}@test.example.com`;
}

/**
 * Generates a random Google ID for testing
 */
export function generateGoogleId(): string {
  return Math.random().toString().substring(2, 23);
}

/**
 * Creates a mock JWT token for testing
 * Note: This is NOT a valid JWT, just for testing mock scenarios
 */
export function createMockJwt(
  payload: Record<string, any> = {},
  expired = false,
): string {
  const now = Math.floor(Date.now() / 1000);
  const defaultPayload = {
    userId: generateUuid(),
    sessionId: generateUuid(),
    iat: expired ? now - 7200 : now,
    exp: expired ? now - 3600 : now + 3600,
    ...payload,
  };

  // Base64 encode the payload (NOT a real JWT signature)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadStr = Buffer.from(JSON.stringify(defaultPayload)).toString('base64url');
  const signature = Buffer.from('mock-signature').toString('base64url');

  return `${header}.${payloadStr}.${signature}`;
}

/**
 * Creates a mock refresh token for testing
 */
export function createMockRefreshToken(
  payload: Record<string, any> = {},
): string {
  const defaultPayload = {
    userId: generateUuid(),
    sessionId: generateUuid(),
    tokenId: generateUuid(),
    ...payload,
  };

  return createMockJwt(defaultPayload);
}

/**
 * Extracts payload from a mock JWT (NOT for production use)
 */
export function decodeMockJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Creates a timestamp in UTC format
 */
export function createUtcTimestamp(offsetHours = 0): Date {
  const now = new Date();
  now.setHours(now.getHours() + offsetHours);
  return now;
}

/**
 * Formats a date to the expected response format (YYYY-MM-DD HH:mm:ss)
 */
export function formatDateResponse(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Creates a mock request object for testing
 */
export function createMockRequest(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    headers: {
      authorization: 'Bearer mock-token',
      'content-type': 'application/json',
      'x-timezone': 'Asia/Seoul',
      ...overrides.headers,
    },
    ip: '127.0.0.1',
    method: 'GET',
    url: '/api/v1/test',
    body: {},
    query: {},
    params: {},
    user: null,
    ...overrides,
  };
}

/**
 * Creates a mock response object for testing
 */
export function createMockResponse(): Record<string, any> {
  const res: Record<string, any> = {
    statusCode: 200,
    headers: {},
    body: null,
  };

  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };

  res.json = (data: any) => {
    res.body = data;
    return res;
  };

  res.send = (data: any) => {
    res.body = data;
    return res;
  };

  res.setHeader = (name: string, value: string) => {
    res.headers[name] = value;
    return res;
  };

  return res;
}

/**
 * Asserts that a promise rejects with a specific error type
 */
export async function expectToThrow<T extends Error>(
  promise: Promise<any>,
  errorType?: new (...args: any[]) => T,
): Promise<T> {
  try {
    await promise;
    throw new Error('Expected promise to reject but it resolved');
  } catch (error) {
    if (errorType && !(error instanceof errorType)) {
      throw new Error(
        `Expected error of type ${errorType.name} but got ${(error as Error).constructor.name}`,
      );
    }
    return error as T;
  }
}

/**
 * Creates mock socket for testing
 */
export function createMockSocket(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: generateUuid(),
    handshake: {
      auth: {
        token: 'Bearer mock-token',
      },
      headers: {},
      query: {},
    },
    data: {
      userId: null,
      sessionId: null,
    },
    rooms: new Set<string>(),
    join: jest.fn((room: string) => {
      (overrides.rooms || new Set()).add(room);
    }),
    leave: jest.fn((room: string) => {
      (overrides.rooms || new Set()).delete(room);
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

/**
 * Redis cache key helpers matching ARCHITECTURE.md Section 6.1
 */
export const cacheKeys = {
  userInfo: (userId: string) => `user_info:${userId}`,
  userSession: (userId: string) => `user_session:${userId}`,
  refreshToken: (tokenHash: string) => `refresh_token:${tokenHash}`,
  rateLimit: (userId: string, endpoint: string) => `rate_limit:${userId}:${endpoint}`,
  socketRoom: (roomId: string) => `socket_room:${roomId}`,
};

/**
 * Error codes matching ARCHITECTURE.md Section 9.3
 */
export const errorCodes = {
  // Request errors (400)
  REQ_001: 'Invalid request body',
  REQ_002: 'Missing required field',

  // Auth errors (401)
  AUTH_001: 'Token expired',
  AUTH_002: 'Invalid token',
  AUTH_003: 'Token not provided',

  // Permission errors (403)
  PERM_001: 'Access denied',

  // Not found errors (404)
  NOT_001: 'Resource not found',
  NOT_002: 'User not found',

  // Rate limit errors (429)
  RATE_001: 'Rate limit exceeded',

  // Server errors (500)
  SRV_001: 'Internal server error',
  SRV_002: 'Database connection failed',
  SRV_003: 'Redis connection failed',
};

/**
 * Default test timeout for async operations
 */
export const TEST_TIMEOUT = 30000;

/**
 * Default database operation timeout
 */
export const DB_TIMEOUT = 10000;

/**
 * Default Redis operation timeout
 */
export const REDIS_TIMEOUT = 5000;
