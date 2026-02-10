/**
 * 애플리케이션 로거 서비스
 *
 * Winston 기반의 구조화된 JSON 로깅을 제공합니다.
 * 콘솔 출력 없이 파일 트랜스포트만 사용하며,
 * API/Socket/Error 로그를 각각 분리된 파일로 기록합니다.
 *
 * @example
 * ```typescript
 * constructor(private readonly logger: LoggerService) {
 *   this.logger.setContext('AuthService');
 *   this.logger.info('사용자 인증 성공', { userId: '123' });
 * }
 * ```
 */

import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { createApiTransport } from './transports/api.transport';
import { createSocketTransport } from './transports/socket.transport';
import { createErrorTransport } from './transports/error.transport';

/**
 * 로그 메타데이터 인터페이스
 */
interface LogMetadata {
  [key: string]: unknown;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: winston.Logger;
  private context = 'Application';

  constructor() {
    const jsonFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    const apiTransport = createApiTransport();
    apiTransport.format = jsonFormat;

    const socketTransport = createSocketTransport();
    socketTransport.format = jsonFormat;

    const errorTransport = createErrorTransport();
    errorTransport.format = jsonFormat;

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      defaultMeta: { service: 'pp-autoclaude-rnd-be' },
      transports: [apiTransport, socketTransport, errorTransport],
    });
  }

  /**
   * 로거 컨텍스트를 설정합니다
   *
   * @param context - 로그에 포함될 컨텍스트 이름 (예: 클래스명)
   */
  setContext(context: string): void {
    this.context = context;
  }

  /**
   * INFO 레벨 로그를 기록합니다
   *
   * @param message - 로그 메시지
   * @param meta - 추가 메타데이터
   */
  log(message: string, ...optionalParams: unknown[]): void {
    const meta = this.extractMeta(optionalParams);
    this.logger.info(message, { context: this.context, ...meta });
  }

  /**
   * INFO 레벨 로그를 기록합니다
   *
   * @param message - 로그 메시지
   * @param meta - 추가 메타데이터
   */
  info(message: string, meta?: LogMetadata): void {
    this.logger.info(message, { context: this.context, ...meta });
  }

  /**
   * WARN 레벨 로그를 기록합니다
   *
   * @param message - 경고 메시지
   * @param meta - 추가 메타데이터
   */
  warn(message: string, ...optionalParams: unknown[]): void {
    const meta = this.extractMeta(optionalParams);
    this.logger.warn(message, { context: this.context, ...meta });
  }

  /**
   * ERROR 레벨 로그를 기록합니다
   *
   * @param message - 에러 메시지
   * @param meta - 추가 메타데이터 (에러 객체 포함 가능)
   */
  error(message: string, ...optionalParams: unknown[]): void {
    const meta = this.extractMeta(optionalParams);
    this.logger.error(message, { context: this.context, ...meta });
  }

  /**
   * DEBUG 레벨 로그를 기록합니다
   *
   * @param message - 디버그 메시지
   * @param meta - 추가 메타데이터
   */
  debug(message: string, ...optionalParams: unknown[]): void {
    const meta = this.extractMeta(optionalParams);
    this.logger.debug(message, { context: this.context, ...meta });
  }

  /**
   * VERBOSE 레벨 로그를 기록합니다
   *
   * @param message - 상세 메시지
   * @param meta - 추가 메타데이터
   */
  verbose(message: string, ...optionalParams: unknown[]): void {
    const meta = this.extractMeta(optionalParams);
    this.logger.verbose(message, { context: this.context, ...meta });
  }

  /**
   * NestJS LoggerService 호환을 위한 메타데이터 추출
   *
   * @param optionalParams - NestJS에서 전달하는 선택적 파라미터
   * @returns 추출된 메타데이터 객체
   */
  private extractMeta(optionalParams: unknown[]): LogMetadata {
    if (optionalParams.length === 0) {
      return {};
    }

    const lastParam = optionalParams[optionalParams.length - 1];

    if (typeof lastParam === 'string') {
      return { context: lastParam };
    }

    if (lastParam instanceof Error) {
      return {
        error: lastParam.message,
        stack: lastParam.stack,
      };
    }

    if (typeof lastParam === 'object' && lastParam !== null) {
      return lastParam as LogMetadata;
    }

    return { additionalInfo: optionalParams };
  }
}
