/**
 * 루트 애플리케이션 모듈
 *
 * NestJS 애플리케이션의 최상위 모듈로,
 * 전역 설정과 핵심 모듈을 통합합니다.
 *
 * @module app
 */

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import { LoggerModule } from './core/logger/logger.module';
import { EncryptionModule } from './core/encryption/encryption.module';
import { TimezoneModule } from './core/timezone/timezone.module';
import { CacheModule } from './core/cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { SocketModule } from './core/socket/socket.module';
import { UserModule } from './user/user.module';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import {
  appConfig,
  jwtConfig,
  redisConfig,
  databaseConfig,
} from './common/config';

/**
 * 애플리케이션 루트 모듈
 *
 * @description
 * - ConfigModule: 환경 변수 및 설정 파일 전역 로드
 * - DatabaseModule: Prisma ORM 전역 데이터베이스 연결
 * - LoggerModule: Winston 기반 전역 로깅
 * - EncryptionModule: AES-256-GCM 암호화
 * - TimezoneModule: UTC+0 저장/변환
 * - CacheModule: Redis 캐시 레이어
 * - AuthModule: Google OAuth + JWT 인증
 * - HealthModule: 헬스체크 엔드포인트
 * - SocketModule: Socket.io 실시간 통신
 * - UserModule: 사용자 관리
 * - RateLimitMiddleware: Redis 슬라이딩 윈도우 기반 요청 제한
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, jwtConfig, redisConfig, databaseConfig],
    }),
    DatabaseModule,
    LoggerModule,
    EncryptionModule,
    TimezoneModule,
    CacheModule,
    AuthModule,
    HealthModule,
    SocketModule,
    UserModule,
  ],
})
export class AppModule implements NestModule {
  /**
   * 전역 미들웨어를 등록합니다
   *
   * RateLimitMiddleware를 모든 라우트에 적용하여
   * Redis 기반 슬라이딩 윈도우 요청 제한을 수행합니다.
   *
   * ARCHITECTURE.md Section 9.4 - Rate Limiting 기반 구현
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
