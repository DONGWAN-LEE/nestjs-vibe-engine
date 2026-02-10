/**
 * 로그 백업 서비스
 *
 * 1개월 이상 경과된 로그 파일을 backup/{year-month}/ 디렉토리로 이동합니다.
 * 매일 자정(UTC)에 자동 실행되며, 수동 호출도 가능합니다.
 */

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from './logger.service';

/**
 * 로그 디렉토리 목록
 */
const LOG_DIRECTORIES = ['logs/api', 'logs/socket', 'logs/error'];

/**
 * 1개월(밀리초 단위)
 */
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class LogBackupService {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.logger.setContext('LogBackupService');
  }

  /**
   * 매일 자정(UTC)에 오래된 로그 파일을 백업 디렉토리로 이동합니다
   *
   * 로그 파일의 수정일이 현재 시점으로부터 30일 이상 경과된 경우
   * backup/{year-month}/ 디렉토리로 파일을 이동합니다.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleLogBackup(): Promise<void> {
    this.logger.info('로그 백업 작업 시작');

    let totalMoved = 0;

    for (const logDir of LOG_DIRECTORIES) {
      const movedCount = await this.backupOldLogs(logDir);
      totalMoved += movedCount;
    }

    this.logger.info('로그 백업 작업 완료', { totalMoved });
  }

  /**
   * 지정된 디렉토리의 오래된 로그 파일을 백업합니다
   *
   * @param logDir - 로그 디렉토리 경로
   * @returns 이동된 파일 수
   */
  private async backupOldLogs(logDir: string): Promise<number> {
    const absoluteLogDir = path.resolve(logDir);

    if (!fs.existsSync(absoluteLogDir)) {
      return 0;
    }

    let movedCount = 0;
    const now = Date.now();
    const files = fs.readdirSync(absoluteLogDir);

    for (const file of files) {
      const filePath = path.join(absoluteLogDir, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      const fileAge = now - stat.mtimeMs;

      if (fileAge < ONE_MONTH_MS) {
        continue;
      }

      const backupDir = this.getBackupDirectory(stat.mtime);
      this.ensureDirectoryExists(backupDir);

      const backupPath = path.join(backupDir, file);

      try {
        fs.renameSync(filePath, backupPath);
        movedCount++;
        this.logger.info('로그 파일 백업 완료', {
          source: filePath,
          destination: backupPath,
        });
      } catch (error) {
        this.logger.error('로그 파일 백업 실패', {
          source: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return movedCount;
  }

  /**
   * 파일 수정일 기준으로 백업 디렉토리 경로를 생성합니다
   *
   * @param fileDate - 파일의 수정 날짜
   * @returns 백업 디렉토리 경로 (예: backup/2025-12)
   */
  private getBackupDirectory(fileDate: Date): string {
    const year = fileDate.getUTCFullYear();
    const month = String(fileDate.getUTCMonth() + 1).padStart(2, '0');
    return path.resolve(`backup/${year}-${month}`);
  }

  /**
   * 디렉토리가 존재하지 않으면 재귀적으로 생성합니다
   *
   * @param dirPath - 생성할 디렉토리 경로
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
