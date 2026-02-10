/**
 * API 로그 전용 Winston DailyRotateFile 트랜스포트
 *
 * API 요청/응답 관련 로그를 일별 로테이션 파일로 저장합니다.
 * - 경로: logs/api/api-%DATE%.log
 * - 최대 파일 크기: 50MB
 * - 보관 기간: 30일
 */

import * as DailyRotateFile from 'winston-daily-rotate-file';

/**
 * API 로그 트랜스포트를 생성합니다
 *
 * @returns DailyRotateFile 트랜스포트 인스턴스
 */
export function createApiTransport(): DailyRotateFile {
  return new DailyRotateFile({
    dirname: 'logs/api',
    filename: 'api-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '30d',
    zippedArchive: true,
    format: undefined,
  });
}
