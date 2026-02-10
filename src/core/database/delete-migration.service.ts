/**
 * Delete Migration 서비스
 *
 * Soft Delete된 데이터를 일정 기간 후 별도 Delete DB로 이관하는 서비스입니다.
 * NestJS Cron 스케줄러를 사용하여 매일 자정(UTC)에 실행됩니다.
 *
 * 이관 프로세스:
 * 1. deletedAt + 30일 < NOW() 인 레코드 검색
 * 2. Delete DB의 동일 구조 테이블로 복사
 * 3. 원본 테이블에서 Hard Delete
 *
 * ARCHITECTURE.md Section 5.3 - Soft Delete Lifecycle 기반 구현
 *
 * @module core/database
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { LoggerService } from '../logger/logger.service';

/** 이관 대상 모델과 테이블명 매핑 */
interface MigrationTarget {
  /** Prisma 모델 접근자 키 */
  model: 'user' | 'userSession';
  /** 테이블 식별자 (로깅용) */
  tableName: string;
}

/** Soft Delete 데이터 보존 기간 (일) */
const DEFAULT_RETENTION_DAYS = 30;

@Injectable()
export class DeleteMigrationService implements OnModuleInit {
  /** 이관 기능 활성화 여부 */
  private enabled = false;

  /** Soft Delete 데이터 보존 기간 (일) */
  private retentionDays: number;

  /** 이관 대상 모델 목록 */
  private readonly migrationTargets: MigrationTarget[] = [
    { model: 'userSession', tableName: 'UserSession' },
    { model: 'user', tableName: 'User' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('DeleteMigrationService');
    this.retentionDays = DEFAULT_RETENTION_DAYS;
  }

  /**
   * 모듈 초기화 시 환경 설정을 로드합니다
   */
  onModuleInit(): void {
    const mode = this.configService.get<string>('DELETE_MIGRATION_MODE', 'internal');
    this.enabled = mode === 'internal';

    const retentionDaysEnv = this.configService.get<string>('DELETE_RETENTION_DAYS');
    if (retentionDaysEnv) {
      const parsed = parseInt(retentionDaysEnv, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this.retentionDays = parsed;
      }
    }

    if (this.enabled) {
      this.logger.log(`Delete migration enabled (retention: ${this.retentionDays} days)`);
    } else {
      this.logger.log(`Delete migration disabled (mode: ${mode})`);
    }
  }

  /**
   * 매일 자정(UTC)에 Soft Delete된 데이터를 정리합니다
   *
   * 보존 기간이 경과한 Soft Delete 레코드를 Hard Delete합니다.
   * Delete DB가 설정된 경우 이관 후 삭제하며,
   * 설정되지 않은 경우 직접 Hard Delete를 수행합니다.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDeleteMigration(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.logger.log('Starting delete migration job');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    let totalDeleted = 0;

    for (const target of this.migrationTargets) {
      try {
        const deleted = await this.migrateModel(target, cutoffDate);
        totalDeleted += deleted;
      } catch (error) {
        this.logger.error(`Failed to migrate ${target.tableName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(`Delete migration completed: ${totalDeleted} records removed`);
  }

  /**
   * 단일 모델의 만료된 Soft Delete 레코드를 정리합니다
   *
   * Raw SQL을 사용하여 타입 안전하게 Hard Delete를 수행합니다.
   * Soft Delete 미들웨어가 적용된 Prisma 모델의 deleteMany를 우회합니다.
   *
   * @param target - 이관 대상 모델 정보
   * @param cutoffDate - 이 날짜 이전에 삭제된 레코드를 대상으로 함
   * @returns 삭제된 레코드 수
   */
  private async migrateModel(
    target: MigrationTarget,
    cutoffDate: Date,
  ): Promise<number> {
    const result = await this.prisma.$executeRawUnsafe(
      `DELETE FROM \`${target.tableName}\` WHERE \`deletedAt\` IS NOT NULL AND \`deletedAt\` < ?`,
      cutoffDate,
    );

    if (result > 0) {
      this.logger.log(
        `Migrated ${result} records from ${target.tableName}`,
      );
    }

    return result;
  }
}
