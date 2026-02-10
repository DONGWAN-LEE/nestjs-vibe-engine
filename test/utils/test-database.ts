/**
 * Test Database Utilities
 *
 * Utilities for managing test databases with Prisma.
 * Provides helpers for setup, teardown, seeding, and cleanup.
 *
 * Based on ARCHITECTURE.md Section 5 database patterns.
 */

import { PrismaClient } from '@prisma/client';
import {
  createMockUser,
  createMockUserSession,
  MockUser,
  MockUserSession,
} from './mock-factories';

/**
 * Test database configuration
 */
export interface TestDatabaseConfig {
  url?: string;
  logging?: boolean;
}

/**
 * Seed data interface
 */
export interface SeedData {
  users?: Partial<MockUser>[];
  sessions?: Partial<MockUserSession>[];
}

/**
 * Test database manager for integration tests
 *
 * Usage:
 * ```typescript
 * const db = new TestDatabase();
 * await db.setup();
 * // ... run tests
 * await db.teardown();
 * ```
 */
export class TestDatabase {
  private prisma: PrismaClient | null = null;
  private config: TestDatabaseConfig;

  constructor(config: TestDatabaseConfig = {}) {
    this.config = {
      url: config.url || process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test_db',
      logging: config.logging ?? false,
    };
  }

  /**
   * Initialize the test database connection
   */
  async setup(): Promise<PrismaClient> {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.config.url,
        },
      },
      log: this.config.logging ? ['query', 'info', 'warn', 'error'] : [],
    });

    await this.prisma.$connect();
    return this.prisma;
  }

  /**
   * Get the Prisma client instance
   */
  getClient(): PrismaClient {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }
    return this.prisma;
  }

  /**
   * Clean all tables (use with caution)
   * Order matters due to foreign key constraints
   */
  async cleanAll(): Promise<void> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    // Disable foreign key checks for MySQL
    await this.prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');

    try {
      // Delete in order: dependent tables first
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE `UserSession`');
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE `User`');
    } finally {
      // Re-enable foreign key checks
      await this.prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }
  }

  /**
   * Clean specific tables
   */
  async cleanTables(...tables: string[]): Promise<void> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    await this.prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');

    try {
      for (const table of tables) {
        await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
      }
    } finally {
      await this.prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }
  }

  /**
   * Seed the database with test data
   */
  async seed(data: SeedData): Promise<{ users: MockUser[]; sessions: MockUserSession[] }> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    const createdUsers: MockUser[] = [];
    const createdSessions: MockUserSession[] = [];

    // Create users
    if (data.users && data.users.length > 0) {
      for (const userData of data.users) {
        const user = createMockUser(userData);
        const created = await this.prisma.user.create({
          data: {
            id: user.id,
            googleId: user.googleId,
            email: user.email,
            name: user.name,
            picture: user.picture,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            deletedAt: user.deletedAt,
          },
        });
        createdUsers.push(created as unknown as MockUser);
      }
    }

    // Create sessions
    if (data.sessions && data.sessions.length > 0) {
      for (const sessionData of data.sessions) {
        const session = createMockUserSession(sessionData);
        const created = await this.prisma.userSession.create({
          data: {
            id: session.id,
            userId: session.userId,
            refreshToken: session.refreshToken,
            deviceInfo: session.deviceInfo,
            ipAddress: session.ipAddress,
            isValid: session.isValid,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            deletedAt: session.deletedAt,
            expiresAt: session.expiresAt,
          },
        });
        createdSessions.push(created as unknown as MockUserSession);
      }
    }

    return { users: createdUsers, sessions: createdSessions };
  }

  /**
   * Create a single test user
   */
  async createUser(overrides: Partial<MockUser> = {}): Promise<MockUser> {
    const { users } = await this.seed({ users: [overrides] });
    return users[0];
  }

  /**
   * Create a user with an active session
   */
  async createUserWithSession(
    userOverrides: Partial<MockUser> = {},
    sessionOverrides: Partial<MockUserSession> = {},
  ): Promise<{ user: MockUser; session: MockUserSession }> {
    const user = await this.createUser(userOverrides);
    const { sessions } = await this.seed({
      sessions: [{ ...sessionOverrides, userId: user.id }],
    });

    return { user, session: sessions[0] };
  }

  /**
   * Delete a user by ID (hard delete for tests)
   */
  async deleteUser(userId: string): Promise<void> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    // Delete sessions first due to foreign key
    await this.prisma.userSession.deleteMany({ where: { userId } });
    await this.prisma.user.delete({ where: { id: userId } });
  }

  /**
   * Soft delete a user (set deletedAt)
   */
  async softDeleteUser(userId: string): Promise<void> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Find user by ID
   */
  async findUserById(userId: string): Promise<MockUser | null> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    return this.prisma.user.findUnique({
      where: { id: userId },
    }) as unknown as Promise<MockUser | null>;
  }

  /**
   * Find user by Google ID
   */
  async findUserByGoogleId(googleId: string): Promise<MockUser | null> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    return this.prisma.user.findUnique({
      where: { googleId },
    }) as unknown as Promise<MockUser | null>;
  }

  /**
   * Find active sessions for a user
   */
  async findUserSessions(userId: string): Promise<MockUserSession[]> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    return this.prisma.userSession.findMany({
      where: {
        userId,
        isValid: true,
        deletedAt: null,
      },
    }) as unknown as Promise<MockUserSession[]>;
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(userId: string): Promise<number> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    const result = await this.prisma.userSession.updateMany({
      where: { userId, isValid: true },
      data: { isValid: false },
    });

    return result.count;
  }

  /**
   * Close the database connection
   */
  async teardown(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
  }

  /**
   * Execute a raw SQL query (for advanced testing scenarios)
   */
  async executeRaw(sql: string, ...params: any[]): Promise<any> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    return this.prisma.$executeRawUnsafe(sql, ...params);
  }

  /**
   * Query raw SQL (for advanced testing scenarios)
   */
  async queryRaw<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    if (!this.prisma) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }

    return this.prisma.$queryRawUnsafe(sql, ...params) as Promise<T[]>;
  }
}

/**
 * Creates a test database instance with automatic cleanup
 *
 * Usage in Jest:
 * ```typescript
 * describe('MyTest', () => {
 *   const { getDb, cleanup } = createTestDatabaseHelper();
 *
 *   beforeAll(async () => {
 *     await getDb().setup();
 *   });
 *
 *   afterAll(async () => {
 *     await cleanup();
 *   });
 *
 *   beforeEach(async () => {
 *     await getDb().cleanAll();
 *   });
 * });
 * ```
 */
export function createTestDatabaseHelper(config?: TestDatabaseConfig) {
  const db = new TestDatabase(config);

  return {
    getDb: () => db,
    cleanup: () => db.teardown(),
  };
}

/**
 * Prisma transaction helper for testing
 *
 * Wraps a test callback in a transaction that gets rolled back.
 * Useful for keeping tests isolated without actually modifying the database.
 *
 * Note: This requires setting up a test-specific Prisma client with
 * interactive transactions enabled.
 */
export async function withRollback<T>(
  prisma: PrismaClient,
  callback: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  let result: T;

  try {
    // Start transaction
    await prisma.$executeRawUnsafe('START TRANSACTION');

    // Execute callback
    result = await callback(prisma);

    // Rollback to keep database clean
    await prisma.$executeRawUnsafe('ROLLBACK');

    return result;
  } catch (error) {
    // Rollback on error
    await prisma.$executeRawUnsafe('ROLLBACK');
    throw error;
  }
}

/**
 * Wait for database to be ready (useful in CI/CD)
 */
export async function waitForDatabase(
  config: TestDatabaseConfig = {},
  maxAttempts = 30,
  delayMs = 1000,
): Promise<boolean> {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: config.url || process.env.DATABASE_URL,
      },
    },
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$disconnect();
      return true;
    } catch {
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return false;
}

/**
 * Check if database is available
 */
export async function isDatabaseAvailable(
  config: TestDatabaseConfig = {},
): Promise<boolean> {
  try {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.url || process.env.DATABASE_URL,
        },
      },
    });

    await prisma.$connect();
    await prisma.$disconnect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Export a singleton instance for simple usage
 */
export const testDatabase = new TestDatabase();
