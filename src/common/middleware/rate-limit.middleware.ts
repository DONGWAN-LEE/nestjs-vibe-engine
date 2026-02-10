/**
 * Rate Limit 미들웨어
 *
 * Redis 슬라이딩 윈도우 기반의 요청 제한 미들웨어입니다.
 * 엔드포인트별 차등 제한을 적용하며, 제한 초과 시 429 응답을 반환합니다.
 *
 * 제한 규칙:
 * - 일반 API: 분당 100회
 * - 인증 관련 API (/auth): 분당 10회
 *
 * ARCHITECTURE.md Section 6.4 - Rate Limiting 기반 구현
 *
 * @example
 * ```typescript
 * // app.module.ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(RateLimitMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */

import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../../core/cache/cache.service';
import { LoggerService } from '../../core/logger/logger.service';

/** Rate Limit 에러 응답 인터페이스 */
interface RateLimitErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/** 분당 최대 요청 수 (일반 API) */
const GLOBAL_LIMIT = 100;

/** 분당 최대 요청 수 (인증 관련 API) */
const AUTH_LIMIT = 10;

/** Rate Limit 윈도우 크기 (초) */
const WINDOW_SECONDS = 60;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('RateLimitMiddleware');
  }

  /**
   * 요청에 대한 Rate Limit을 검사합니다
   *
   * Redis INCR 명령을 사용하여 원자적으로 카운터를 증가시키고,
   * 최초 요청 시 TTL을 설정하는 슬라이딩 윈도우 방식을 적용합니다.
   *
   * @param req - Express 요청 객체
   * @param res - Express 응답 객체
   * @param next - 다음 미들웨어 호출 함수
   */
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!this.cacheService.isConnected()) {
      next();
      return;
    }

    const identifier = this.getIdentifier(req);
    const endpoint = req.path;
    const isAuthEndpoint = endpoint.startsWith('/auth');
    const limit = isAuthEndpoint ? AUTH_LIMIT : GLOBAL_LIMIT;
    const cacheKey = `rate_limit:${identifier}:${endpoint}`;

    try {
      const currentCount = await this.cacheService.incr(cacheKey);

      if (currentCount === 1) {
        await this.cacheService.expire(cacheKey, WINDOW_SECONDS);
      }

      const remainingTtl = await this.cacheService.ttl(cacheKey);

      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - currentCount)));
      res.setHeader('X-RateLimit-Reset', String(remainingTtl > 0 ? remainingTtl : WINDOW_SECONDS));

      if (currentCount > limit) {
        this.logger.warn('Rate limit exceeded', {
          identifier,
          endpoint,
          currentCount,
          limit,
        });

        const errorResponse: RateLimitErrorResponse = {
          success: false,
          error: {
            code: 'RATE_001',
            message: 'Rate limit exceeded',
          },
        };

        res.status(HttpStatus.TOO_MANY_REQUESTS).json(errorResponse);
        return;
      }

      next();
    } catch (error) {
      this.logger.error('Rate limit check failed, allowing request', {
        identifier,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
      next();
    }
  }

  /**
   * 요청에서 클라이언트 식별자를 추출합니다
   *
   * 인증된 사용자는 userId를, 미인증 사용자는 IP 주소를 식별자로 사용합니다.
   *
   * @param req - Express 요청 객체
   * @returns 클라이언트 식별자
   */
  private getIdentifier(req: Request): string {
    const user = (req as unknown as Record<string, unknown>).user as { userId?: string } | undefined;
    if (user?.userId) {
      return user.userId;
    }

    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }

    return req.ip || '0.0.0.0';
  }
}
