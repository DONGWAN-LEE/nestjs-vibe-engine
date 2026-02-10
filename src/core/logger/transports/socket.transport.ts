/**
 * Socket 로그 전용 Winston DailyRotateFile 트랜스포트
 *
 * WebSocket 관련 이벤트 로그를 일별 로테이션 파일로 저장합니다.
 * - 경로: logs/socket/socket-%DATE%.log
 * - 최대 파일 크기: 50MB
 * - 보관 기간: 30일
 */

import * as DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Socket 로그 트랜스포트를 생성합니다
 *
 * @returns DailyRotateFile 트랜스포트 인스턴스
 */
export function createSocketTransport(): DailyRotateFile {
  return new DailyRotateFile({
    dirname: 'logs/socket',
    filename: 'socket-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '30d',
    zippedArchive: true,
    format: undefined,
  });
}
