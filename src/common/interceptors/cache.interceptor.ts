/**
 * 캐시 인터셉터
 *
 * 데코레이터 기반의 HTTP 응답 캐싱 인터셉터입니다.
 * @CacheKey() 와 @CacheTTL() 데코레이터를 통해 컨트롤러 메서드에
 * 선언적으로 캐시 정책을 적용할 수 있습니다.
 *
 * 캐시 적중 시 Redis에서 직접 응답하고,
 * 미스 시 핸들러를 실행한 뒤 결과를 캐싱합니다.
 *
 * ARCHITECTURE.md Section 6 - Cache Strategy 기반 구현
 *
 * @example
 * ```typescript
 * @Controller('users')
 * @UseInterceptors(CacheInterceptor)
 * export class UserController {
 *   @Get(':id')
 *   @CacheKey('user_info')
 *   @CacheTTL(3600)
 *   async getUser(@Param('id') id: string) {
 *     return this.userService.findById(id);
 *   }
 * }
 * ```
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CacheService } from '../../core/cache/cache.service';
import { LoggerService } from '../../core/logger/logger.service';

/** 캐시 키 메타데이터 심볼 키 */
export const CACHE_KEY_METADATA = 'cache_key';

/** 캐시 TTL 메타데이터 심볼 키 */
export const CACHE_TTL_METADATA = 'cache_ttl';

/**
 * 캐시 키 접두사를 설정하는 데코레이터
 *
 * 실제 캐시 키는 '{prefix}:{HTTP Method}:{URL}' 형식으로 생성됩니다.
 *
 * @param key - 캐시 키 접두사
 * @returns SetMetadata 데코레이터
 */
export const CacheKey = (key: string) => SetMetadata(CACHE_KEY_METADATA, key);

/**
 * 캐시 TTL을 설정하는 데코레이터
 *
 * @param ttl - 캐시 만료 시간 (초 단위)
 * @returns SetMetadata 데코레이터
 */
export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_METADATA, ttl);

/** 기본 캐시 TTL: 5분 */
const DEFAULT_CACHE_TTL = 300;

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('CacheInterceptor');
  }

  /**
   * HTTP 응답을 캐싱하는 인터셉터 로직
   *
   * GET 요청만 캐싱 대상이며, @CacheKey 데코레이터가 없는 핸들러는 건너뜁니다.
   * 캐시 적중 시 Redis에서 직접 응답하고, 미스 시 핸들러 결과를 캐싱합니다.
   *
   * @param context - 실행 컨텍스트
   * @param next - 다음 핸들러 호출
   * @returns Observable 스트림
   */
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.method !== 'GET') {
      return next.handle();
    }

    const cacheKeyPrefix = this.reflector.get<string>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );

    if (!cacheKeyPrefix) {
      return next.handle();
    }

    const ttl = this.reflector.get<number>(
      CACHE_TTL_METADATA,
      context.getHandler(),
    ) || DEFAULT_CACHE_TTL;

    const fullCacheKey = this.buildCacheKey(cacheKeyPrefix, request);

    if (!this.cacheService.isConnected()) {
      return next.handle();
    }

    try {
      const cachedValue = await this.cacheService.get<unknown>(fullCacheKey);

      if (cachedValue !== null) {
        this.logger.debug('Cache hit', { key: fullCacheKey });
        return of(cachedValue);
      }
    } catch (error) {
      this.logger.error('Cache read failed, proceeding to handler', {
        key: fullCacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.cacheService.set(fullCacheKey, response, ttl);
          this.logger.debug('Cache set', { key: fullCacheKey, ttl });
        } catch (error) {
          this.logger.error('Cache write failed', {
            key: fullCacheKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  /**
   * 캐시 키를 생성합니다
   *
   * 접두사, HTTP 메서드, URL 경로를 조합하여 고유한 캐시 키를 만듭니다.
   * 쿼리 파라미터가 있는 경우 정렬된 형태로 포함시킵니다.
   *
   * @param prefix - @CacheKey 데코레이터에 지정된 접두사
   * @param request - Express 요청 객체
   * @returns 생성된 캐시 키
   */
  private buildCacheKey(prefix: string, request: Request): string {
    const queryParams = request.query;
    const sortedQuery = Object.keys(queryParams)
      .sort()
      .map((key) => `${key}=${String(queryParams[key])}`)
      .join('&');

    const path = request.path;

    if (sortedQuery) {
      return `${prefix}:${request.method}:${path}?${sortedQuery}`;
    }

    return `${prefix}:${request.method}:${path}`;
  }
}
