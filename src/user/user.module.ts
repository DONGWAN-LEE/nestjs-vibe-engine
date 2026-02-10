/**
 * 사용자 모듈
 *
 * 사용자 도메인에 필요한 컨트롤러, 서비스, 리포지토리를 등록합니다.
 * UserService를 외부 모듈(AuthModule 등)에서 사용할 수 있도록 exports 합니다.
 *
 * ARCHITECTURE.md Section 2 - 프로젝트 구조 (Feature-based) 기반 설계
 *
 * @example
 * ```typescript
 * // app.module.ts
 * import { UserModule } from './user/user.module';
 *
 * @Module({
 *   imports: [UserModule],
 * })
 * export class AppModule {}
 * ```
 *
 * @module user
 */

import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { LoggerService } from '../core/logger/logger.service';

/**
 * 사용자 도메인 모듈
 *
 * @description
 * - UserController: REST API 엔드포인트 (GET/PATCH/DELETE /users/me, POST /users/restore)
 * - UserService: 비즈니스 로직 (캐시 관리, 암호화, 세션 무효화)
 * - UserRepository: Prisma 기반 데이터 접근 계층
 * - LoggerService: Winston 기반 구조화된 로깅
 *
 * 외부 의존성:
 * - PrismaService: DatabaseModule에서 전역 제공
 * - CacheService: CacheModule에서 전역 제공 (@Global)
 * - EncryptionService: EncryptionModule에서 제공
 */
@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository, LoggerService],
  exports: [UserService],
})
export class UserModule {}
