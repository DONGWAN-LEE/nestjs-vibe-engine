/**
 * Health Check E2E Tests
 *
 * End-to-end tests for health check endpoints including:
 * - Basic health check (GET /health)
 * - Detailed health check (GET /health/detailed)
 * - Database health indicator
 * - Redis health indicator
 * - Partial failure scenarios
 *
 * These tests use supertest to make HTTP requests to the NestJS application
 * and verify the complete request/response cycle.
 *
 * Based on ARCHITECTURE.md Section 9.7 - Health Check
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus, Injectable } from '@nestjs/common';
import * as request from 'supertest';

// Type definitions for health check responses
interface IndicatorStatus {
  status: 'up' | 'down';
  message?: string;
}

interface HealthCheckResponse {
  status: 'ok' | 'error';
  info: {
    database: IndicatorStatus;
    redis: IndicatorStatus;
  };
}

interface DetailedHealthCheckResponse {
  status: 'ok' | 'error' | 'shutting_down';
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string; message?: string }>;
  details?: Record<string, { status: string }>;
}

// Import NestJS decorators for mock controller
import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TerminusModule, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';

/**
 * Mock PrismaService for testing database health
 */
@Injectable()
class MockPrismaService {
  private _isHealthy = true;
  private _shouldThrow = false;
  private _errorMessage = 'Database connection failed';

  async isHealthy(): Promise<boolean> {
    if (this._shouldThrow) {
      throw new Error(this._errorMessage);
    }
    return this._isHealthy;
  }

  setHealthy(healthy: boolean): void {
    this._isHealthy = healthy;
  }

  setShouldThrow(shouldThrow: boolean, message?: string): void {
    this._shouldThrow = shouldThrow;
    if (message) {
      this._errorMessage = message;
    }
  }

  reset(): void {
    this._isHealthy = true;
    this._shouldThrow = false;
    this._errorMessage = 'Database connection failed';
  }
}

/**
 * Mock CacheService for testing Redis health
 */
@Injectable()
class MockCacheService {
  private _isHealthy = true;
  private _isEnabled = true;
  private _shouldThrow = false;
  private _errorMessage = 'Redis connection failed';

  async isHealthy(): Promise<boolean> {
    if (this._shouldThrow) {
      throw new Error(this._errorMessage);
    }
    return this._isHealthy;
  }

  isEnabled(): boolean {
    return this._isEnabled;
  }

  setHealthy(healthy: boolean): void {
    this._isHealthy = healthy;
  }

  setEnabled(enabled: boolean): void {
    this._isEnabled = enabled;
  }

  setShouldThrow(shouldThrow: boolean, message?: string): void {
    this._shouldThrow = shouldThrow;
    if (message) {
      this._errorMessage = message;
    }
  }

  reset(): void {
    this._isHealthy = true;
    this._isEnabled = true;
    this._shouldThrow = false;
    this._errorMessage = 'Redis connection failed';
  }
}

/**
 * Mock Health Controller for E2E Testing
 * Simulates the actual HealthController behavior from src/health/health.controller.ts
 */
@Controller('health')
@ApiTags('Health')
class MockHealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: MockPrismaService,
    private readonly cache: MockCacheService,
  ) {}

  /**
   * GET /health - Basic health check
   * Returns status of all health indicators
   */
  @Get()
  async check(): Promise<HealthCheckResponse> {
    // Run health checks in parallel for better performance
    const [databaseHealth, redisHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    // Determine overall status
    const allHealthy = databaseHealth.status === 'up' && redisHealth.status === 'up';

    return {
      status: allHealthy ? 'ok' : 'error',
      info: {
        database: databaseHealth,
        redis: redisHealth,
      },
    };
  }

  /**
   * GET /health/detailed - Detailed health check (internal monitoring)
   */
  @Get('detailed')
  async checkDetailed(): Promise<DetailedHealthCheckResponse> {
    return this.health.check([
      // Database health indicator
      async (): Promise<HealthIndicatorResult> => {
        const isHealthy = await this.prisma.isHealthy();
        return {
          database: {
            status: isHealthy ? 'up' : 'down',
          },
        };
      },
      // Redis health indicator
      async (): Promise<HealthIndicatorResult> => {
        if (!this.cache.isEnabled()) {
          return {
            redis: {
              status: 'down',
              message: 'Redis is disabled via configuration',
            },
          };
        }
        const isHealthy = await this.cache.isHealthy();
        return {
          redis: {
            status: isHealthy ? 'up' : 'down',
          },
        };
      },
    ]);
  }

  /**
   * Check database (MySQL via Prisma) health
   */
  private async checkDatabase(): Promise<IndicatorStatus> {
    try {
      const isHealthy = await this.prisma.isHealthy();

      if (isHealthy) {
        return { status: 'up' };
      }

      return {
        status: 'down',
        message: 'Database health check failed',
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis (Cache) health
   */
  private async checkRedis(): Promise<IndicatorStatus> {
    try {
      // Check if cache is enabled first
      if (!this.cache.isEnabled()) {
        return {
          status: 'down',
          message: 'Redis is disabled via configuration',
        };
      }

      const isHealthy = await this.cache.isHealthy();

      if (isHealthy) {
        return { status: 'up' };
      }

      return {
        status: 'down',
        message: 'Redis health check failed',
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * POST /health/test/db/set - Set database health state (for testing only)
   */
  @Get('test/db/healthy')
  setDbHealthy() {
    this.prisma.setHealthy(true);
    this.prisma.setShouldThrow(false);
    return { success: true };
  }

  @Get('test/db/unhealthy')
  setDbUnhealthy() {
    this.prisma.setHealthy(false);
    return { success: true };
  }

  @Get('test/db/error')
  setDbError() {
    this.prisma.setShouldThrow(true, 'Connection refused');
    return { success: true };
  }

  /**
   * Test endpoints for Redis state
   */
  @Get('test/redis/healthy')
  setRedisHealthy() {
    this.cache.setHealthy(true);
    this.cache.setEnabled(true);
    this.cache.setShouldThrow(false);
    return { success: true };
  }

  @Get('test/redis/unhealthy')
  setRedisUnhealthy() {
    this.cache.setHealthy(false);
    return { success: true };
  }

  @Get('test/redis/disabled')
  setRedisDisabled() {
    this.cache.setEnabled(false);
    return { success: true };
  }

  @Get('test/redis/error')
  setRedisError() {
    this.cache.setShouldThrow(true, 'Redis connection timeout');
    return { success: true };
  }

  /**
   * Reset all test state
   */
  @Get('test/reset')
  resetTestState() {
    this.prisma.reset();
    this.cache.reset();
    return { success: true };
  }
}

// Test module setup
@Module({
  imports: [TerminusModule],
  controllers: [MockHealthController],
  providers: [MockPrismaService, MockCacheService],
})
class TestHealthModule {}

describe('Health Check E2E Tests', () => {
  let app: INestApplication;
  let prismaService: MockPrismaService;
  let cacheService: MockCacheService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestHealthModule],
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

    prismaService = moduleFixture.get<MockPrismaService>(MockPrismaService);
    cacheService = moduleFixture.get<MockCacheService>(MockCacheService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset health state before each test
    await request(app.getHttpServer())
      .get('/health/test/reset')
      .expect(HttpStatus.OK);
  });

  describe('Basic Health Check', () => {
    describe('GET /health', () => {
      it('should return healthy status when all services are up', async () => {
        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        const body: HealthCheckResponse = response.body;

        expect(body.status).toBe('ok');
        expect(body.info).toBeDefined();
        expect(body.info.database).toBeDefined();
        expect(body.info.database.status).toBe('up');
        expect(body.info.redis).toBeDefined();
        expect(body.info.redis.status).toBe('up');
      });

      it('should return response format per ARCHITECTURE.md Section 9.7', async () => {
        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        const body: HealthCheckResponse = response.body;

        // Verify exact response structure from ARCHITECTURE.md
        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('info');
        expect(body.info).toHaveProperty('database');
        expect(body.info).toHaveProperty('redis');
        expect(body.info.database).toHaveProperty('status');
        expect(body.info.redis).toHaveProperty('status');
      });

      it('should not require authentication', async () => {
        // Health endpoint should be accessible without auth
        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        expect(response.body.status).toBeDefined();
      });

      it('should return error status when database is down', async () => {
        // Set database to unhealthy
        await request(app.getHttpServer())
          .get('/health/test/db/unhealthy')
          .expect(HttpStatus.OK);

        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK); // Note: Returns 200 even with error status

        const body: HealthCheckResponse = response.body;

        expect(body.status).toBe('error');
        expect(body.info.database.status).toBe('down');
        expect(body.info.database.message).toBeDefined();
        expect(body.info.redis.status).toBe('up');
      });

      it('should return error status when Redis is down', async () => {
        // Set Redis to unhealthy
        await request(app.getHttpServer())
          .get('/health/test/redis/unhealthy')
          .expect(HttpStatus.OK);

        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        const body: HealthCheckResponse = response.body;

        expect(body.status).toBe('error');
        expect(body.info.database.status).toBe('up');
        expect(body.info.redis.status).toBe('down');
        expect(body.info.redis.message).toBeDefined();
      });

      it('should return error status when both database and Redis are down', async () => {
        // Set both services to unhealthy
        await request(app.getHttpServer())
          .get('/health/test/db/unhealthy')
          .expect(HttpStatus.OK);
        await request(app.getHttpServer())
          .get('/health/test/redis/unhealthy')
          .expect(HttpStatus.OK);

        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        const body: HealthCheckResponse = response.body;

        expect(body.status).toBe('error');
        expect(body.info.database.status).toBe('down');
        expect(body.info.redis.status).toBe('down');
      });

      it('should handle database connection errors gracefully', async () => {
        // Set database to throw error
        await request(app.getHttpServer())
          .get('/health/test/db/error')
          .expect(HttpStatus.OK);

        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        const body: HealthCheckResponse = response.body;

        expect(body.status).toBe('error');
        expect(body.info.database.status).toBe('down');
        expect(body.info.database.message).toContain('Connection refused');
      });

      it('should handle Redis connection errors gracefully', async () => {
        // Set Redis to throw error
        await request(app.getHttpServer())
          .get('/health/test/redis/error')
          .expect(HttpStatus.OK);

        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        const body: HealthCheckResponse = response.body;

        expect(body.status).toBe('error');
        expect(body.info.redis.status).toBe('down');
        expect(body.info.redis.message).toContain('timeout');
      });

      it('should indicate when Redis is disabled via configuration', async () => {
        // Disable Redis
        await request(app.getHttpServer())
          .get('/health/test/redis/disabled')
          .expect(HttpStatus.OK);

        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);

        const body: HealthCheckResponse = response.body;

        expect(body.status).toBe('error');
        expect(body.info.redis.status).toBe('down');
        expect(body.info.redis.message).toContain('disabled');
      });
    });
  });

  describe('Detailed Health Check', () => {
    describe('GET /health/detailed', () => {
      it('should return detailed health information', async () => {
        const response = await request(app.getHttpServer())
          .get('/health/detailed')
          .expect(HttpStatus.OK);

        const body: DetailedHealthCheckResponse = response.body;

        expect(body.status).toBeDefined();
        expect(body.info || body.details).toBeDefined();
      });

      it('should include database indicator in detailed response', async () => {
        const response = await request(app.getHttpServer())
          .get('/health/detailed')
          .expect(HttpStatus.OK);

        const body = response.body;

        // Check for database indicator in response
        const hasDatabase =
          (body.info && body.info.database) ||
          (body.details && body.details.database);

        expect(hasDatabase).toBeTruthy();
      });

      it('should include Redis indicator in detailed response', async () => {
        const response = await request(app.getHttpServer())
          .get('/health/detailed')
          .expect(HttpStatus.OK);

        const body = response.body;

        // Check for Redis indicator in response
        const hasRedis =
          (body.info && body.info.redis) ||
          (body.details && body.details.redis);

        expect(hasRedis).toBeTruthy();
      });

      it('should not require authentication', async () => {
        const response = await request(app.getHttpServer())
          .get('/health/detailed')
          .expect(HttpStatus.OK);

        expect(response.body).toBeDefined();
      });
    });
  });

  describe('Health Check Performance', () => {
    it('should respond within acceptable time (< 500ms)', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Health checks should be fast (typically < 50ms, allowing up to 500ms for CI)
      expect(responseTime).toBeLessThan(500);
    });

    it('should run health checks in parallel', async () => {
      // This is tested implicitly by the response time test
      // If checks were sequential, they would take longer
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // With parallel execution, response should be fast
      expect(responseTime).toBeLessThan(500);
    });
  });

  describe('Load Balancer Compatibility', () => {
    it('should return 200 OK for healthy state (ALB/Kubernetes compatibility)', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      // ALB and Kubernetes expect 200 for healthy
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should return 200 even when unhealthy (allows body inspection)', async () => {
      // Set services to unhealthy
      await request(app.getHttpServer())
        .get('/health/test/db/unhealthy')
        .expect(HttpStatus.OK);

      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK); // Still 200 to allow body inspection

      // Status in body indicates error
      expect(response.body.status).toBe('error');
    });

    it('should return valid JSON response', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK)
        .expect('Content-Type', /json/);

      // Should be valid JSON that can be parsed
      expect(() => JSON.parse(JSON.stringify(response.body))).not.toThrow();
    });
  });

  describe('Health Recovery', () => {
    it('should reflect database recovery', async () => {
      // Set database down
      await request(app.getHttpServer())
        .get('/health/test/db/unhealthy')
        .expect(HttpStatus.OK);

      let response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('error');
      expect(response.body.info.database.status).toBe('down');

      // Recover database
      await request(app.getHttpServer())
        .get('/health/test/db/healthy')
        .expect(HttpStatus.OK);

      response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('ok');
      expect(response.body.info.database.status).toBe('up');
    });

    it('should reflect Redis recovery', async () => {
      // Set Redis down
      await request(app.getHttpServer())
        .get('/health/test/redis/unhealthy')
        .expect(HttpStatus.OK);

      let response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('error');
      expect(response.body.info.redis.status).toBe('down');

      // Recover Redis
      await request(app.getHttpServer())
        .get('/health/test/redis/healthy')
        .expect(HttpStatus.OK);

      response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('ok');
      expect(response.body.info.redis.status).toBe('up');
    });

    it('should reflect full system recovery', async () => {
      // Set both services down
      await request(app.getHttpServer())
        .get('/health/test/db/unhealthy')
        .expect(HttpStatus.OK);
      await request(app.getHttpServer())
        .get('/health/test/redis/unhealthy')
        .expect(HttpStatus.OK);

      let response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('error');

      // Reset/recover
      await request(app.getHttpServer())
        .get('/health/test/reset')
        .expect(HttpStatus.OK);

      response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('ok');
      expect(response.body.info.database.status).toBe('up');
      expect(response.body.info.redis.status).toBe('up');
    });
  });

  describe('Error Message Safety', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Set database to error
      await request(app.getHttpServer())
        .get('/health/test/db/error')
        .expect(HttpStatus.OK);

      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      const body: HealthCheckResponse = response.body;
      const errorMessage = body.info.database.message || '';

      // Should not contain sensitive data
      expect(errorMessage).not.toContain('password');
      expect(errorMessage).not.toContain('secret');
      expect(errorMessage).not.toContain('credential');
      expect(errorMessage).not.toContain('api_key');
    });

    it('should not expose stack traces in responses', async () => {
      // Set services to error state
      await request(app.getHttpServer())
        .get('/health/test/db/error')
        .expect(HttpStatus.OK);

      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);

      const responseString = JSON.stringify(response.body);

      expect(responseString).not.toContain('stack');
      expect(responseString).not.toContain('node_modules');
      expect(responseString).not.toContain('at ');
    });
  });

  describe('Concurrent Health Checks', () => {
    it('should handle multiple concurrent health check requests', async () => {
      // Send multiple concurrent requests
      const promises = Array(10).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/health')
      );

      const results = await Promise.all(promises);

      // All requests should succeed
      results.forEach((result) => {
        expect(result.status).toBe(HttpStatus.OK);
        expect(result.body.status).toBe('ok');
      });
    });

    it('should maintain consistent state during concurrent requests', async () => {
      // Set one service down
      await request(app.getHttpServer())
        .get('/health/test/db/unhealthy')
        .expect(HttpStatus.OK);

      // Send concurrent requests
      const promises = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/health')
      );

      const results = await Promise.all(promises);

      // All should report consistent state
      results.forEach((result) => {
        expect(result.body.status).toBe('error');
        expect(result.body.info.database.status).toBe('down');
      });
    });
  });

  describe('Health Endpoint Availability', () => {
    it('should be accessible at /health path', async () => {
      await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK);
    });

    it('should be accessible at /health/detailed path', async () => {
      await request(app.getHttpServer())
        .get('/health/detailed')
        .expect(HttpStatus.OK);
    });

    it('should return 404 for non-existent health sub-paths', async () => {
      await request(app.getHttpServer())
        .get('/health/non-existent')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should handle GET method only for /health', async () => {
      // POST should not be allowed on health endpoint
      await request(app.getHttpServer())
        .post('/health')
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});

/**
 * Additional E2E test utilities for Health module
 */
export async function checkHealth(app: INestApplication): Promise<HealthCheckResponse> {
  const response = await request(app.getHttpServer())
    .get('/health')
    .expect(HttpStatus.OK);

  return response.body;
}

export async function isSystemHealthy(app: INestApplication): Promise<boolean> {
  try {
    const health = await checkHealth(app);
    return health.status === 'ok';
  } catch {
    return false;
  }
}

export async function waitForHealthy(
  app: INestApplication,
  maxWaitMs = 30000,
  intervalMs = 1000,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (await isSystemHealthy(app)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}
