/**
 * Prisma 서비스
 *
 * NestJS 라이프사이클에 통합된 Prisma 클라이언트 래퍼.
 * 모듈 초기화 시 데이터베이스 연결을 수립하고,
 * 모듈 소멸 시 연결을 정리합니다.
 *
 * @module core/database
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { applySoftDeleteMiddleware } from './soft-delete.middleware';

/**
 * Prisma ORM 클라이언트를 NestJS 서비스로 제공하는 래퍼 클래스
 *
 * @description
 * - 애플리케이션 시작 시 자동으로 데이터베이스에 연결
 * - 애플리케이션 종료 시 자동으로 연결 해제
 * - Soft Delete 미들웨어 자동 적용
 * - 헬스체크를 위한 연결 상태 확인 메서드 제공
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    applySoftDeleteMiddleware(this);
  }

  /**
   * 모듈 초기화 시 데이터베이스 연결을 수립합니다.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * 모듈 소멸 시 데이터베이스 연결을 해제합니다.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * 데이터베이스 연결 상태를 확인합니다.
   *
   * @returns 연결이 정상이면 true, 비정상이면 false
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
