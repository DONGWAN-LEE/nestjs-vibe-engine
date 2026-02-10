/**
 * 헬스체크 컨트롤러
 *
 * 애플리케이션의 상태를 확인하는 엔드포인트를 제공합니다.
 * 로드 밸런서 호환성을 위해 항상 HTTP 200을 반환하며,
 * status 필드로 실제 상태를 표시합니다.
 *
 * - GET /health: 기본 헬스체크 (Database + Redis)
 * - GET /health/detailed: TerminusModule 기반 상세 헬스체크
 */

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
} from '@nestjs/terminus';
import { PrismaService } from 'src/core/database/prisma.service';
import { CacheService } from 'src/core/cache/cache.service';
import { LoggerService } from 'src/core/logger/logger.service';

/**
 * 개별 서비스 상태 정보
 */
interface ServiceHealth {
  status: 'up' | 'down';
  message?: string;
}

/**
 * 기본 헬스체크 응답
 */
interface HealthResponse {
  status: 'ok' | 'error';
  info: {
    database: ServiceHealth;
    redis: ServiceHealth;
  };
}

@Controller('health')
export class HealthController {
  private readonly logger: LoggerService;

  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('HealthController');
  }

  /**
   * 기본 헬스체크 엔드포인트
   *
   * Database와 Redis의 연결 상태를 병렬로 확인합니다.
   * 로드 밸런서 호환을 위해 항상 HTTP 200을 반환하며,
   * 응답 body의 status 필드로 실제 상태를 표시합니다.
   *
   * @returns 각 서비스의 상태 정보를 포함한 헬스체크 결과
   */
  @Get()
  async check(): Promise<HealthResponse> {
    const [databaseHealth, redisHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const isHealthy =
      databaseHealth.status === 'up' && redisHealth.status === 'up';

    if (!isHealthy) {
      this.logger.warn('헬스체크 이상 감지', {
        database: databaseHealth,
        redis: redisHealth,
      });
    }

    return {
      status: isHealthy ? 'ok' : 'error',
      info: {
        database: databaseHealth,
        redis: redisHealth,
      },
    };
  }

  /**
   * 상세 헬스체크 엔드포인트
   *
   * TerminusModule의 HealthCheckService를 사용하여
   * 각 서비스에 대한 상세한 상태 정보를 제공합니다.
   *
   * @returns TerminusModule 형식의 상세 헬스체크 결과
   */
  @Get('detailed')
  @HealthCheck()
  async checkDetailed(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      () => this.checkDatabaseIndicator(),
      () => this.checkRedisIndicator(),
    ]);
  }

  /**
   * 데이터베이스 연결 상태를 확인합니다
   *
   * @returns 데이터베이스 상태 정보
   */
  private async checkDatabase(): Promise<ServiceHealth> {
    try {
      const isHealthy = await this.prismaService.isHealthy();
      return {
        status: isHealthy ? 'up' : 'down',
        message: isHealthy ? undefined : 'Database connection failed',
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Redis 연결 상태를 확인합니다
   *
   * @returns Redis 상태 정보
   */
  private async checkRedis(): Promise<ServiceHealth> {
    try {
      const isHealthy = await this.cacheService.isHealthy();
      return {
        status: isHealthy ? 'up' : 'down',
        message: isHealthy ? undefined : 'Redis connection failed',
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * TerminusModule 호환 데이터베이스 헬스 인디케이터
   *
   * @returns Terminus HealthIndicatorResult 호환 객체
   */
  private async checkDatabaseIndicator() {
    try {
      const isHealthy = await this.prismaService.isHealthy();
      return {
        database: {
          status: isHealthy ? ('up' as const) : ('down' as const),
        },
      };
    } catch (error) {
      return {
        database: {
          status: 'down' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * TerminusModule 호환 Redis 헬스 인디케이터
   *
   * @returns Terminus HealthIndicatorResult 호환 객체
   */
  private async checkRedisIndicator() {
    try {
      const isHealthy = await this.cacheService.isHealthy();
      return {
        redis: {
          status: isHealthy ? ('up' as const) : ('down' as const),
        },
      };
    } catch (error) {
      return {
        redis: {
          status: 'down' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
