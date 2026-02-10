/**
 * 캐시 모듈
 *
 * Redis 기반 캐시 기능을 전역으로 제공하는 모듈입니다.
 * ioredis를 사용하여 Direct 모드와 Cluster 모드를 모두 지원합니다.
 * @Global() 데코레이터를 통해 앱 전체에서 CacheService를 주입받을 수 있습니다.
 *
 * ARCHITECTURE.md Section 6 - Cache Strategy (Redis) 기반 설계
 *
 * @example
 * ```typescript
 * // app.module.ts
 * import { CacheModule } from './core/cache/cache.module';
 *
 * @Module({
 *   imports: [ConfigModule.forRoot(), CacheModule],
 * })
 * export class AppModule {}
 * ```
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';
import { LoggerService } from '../logger/logger.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CacheService, LoggerService],
  exports: [CacheService],
})
export class CacheModule {}
