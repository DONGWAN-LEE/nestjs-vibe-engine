/**
 * Error 로그 전용 Winston DailyRotateFile 트랜스포트
 *
 * 에러 레벨 로그만 별도 파일로 분리 저장합니다.
 * - 경로: logs/error/error-%DATE%.log
 * - 레벨: error
 * - 최대 파일 크기: 50MB
 * - 보관 기간: 30일
 */

import * as DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Error 로그 트랜스포트를 생성합니다
 *
 * @returns DailyRotateFile 트랜스포트 인스턴스
 */
export function createErrorTransport(): DailyRotateFile {
  return new DailyRotateFile({
    dirname: 'logs/error',
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '50m',
    maxFiles: '30d',
    zippedArchive: true,
    format: undefined,
  });
}
