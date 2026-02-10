/**
 * 데이터베이스 모듈
 *
 * PrismaService를 전역으로 제공하는 NestJS 모듈.
 * 애플리케이션 전체에서 단일 Prisma 인스턴스를 공유합니다.
 *
 * @module core/database
 */

import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { DeleteMigrationService } from './delete-migration.service';

/**
 * 전역 데이터베이스 모듈
 *
 * @description
 * - Global 데코레이터로 모든 모듈에서 PrismaService 주입 가능
 * - 별도 import 없이 어디서든 PrismaService 사용 가능
 * - Soft Delete 미들웨어 자동 적용 (PrismaService 생성자)
 * - DeleteMigrationService: 만료된 Soft Delete 데이터 자동 정리
 */
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [PrismaService, DeleteMigrationService],
  exports: [PrismaService],
})
export class DatabaseModule {}
