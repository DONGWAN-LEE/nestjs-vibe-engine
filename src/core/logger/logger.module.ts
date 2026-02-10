/**
 * 로거 모듈
 *
 * Winston 기반 로깅 시스템을 전역으로 제공합니다.
 * API, Socket, Error 로그를 각각 분리된 파일로 관리하며,
 * 오래된 로그 파일의 자동 백업 기능을 포함합니다.
 */

import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { LogBackupService } from './log-backup.service';

@Global()
@Module({
  providers: [LoggerService, LogBackupService],
  exports: [LoggerService],
})
export class LoggerModule {}
