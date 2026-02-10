/**
 * 타임존 서비스
 *
 * UTC+0 기준 저장과 클라이언트 타임존 변환을 담당합니다.
 * dayjs와 UTC/timezone 플러그인을 사용하여
 * 일관된 날짜/시간 처리를 보장합니다.
 *
 * @example
 * ```typescript
 * // UTC Date를 한국 시간으로 변환
 * const kst = timezoneService.convertToTimezone(new Date(), 'Asia/Seoul');
 *
 * // 한국 시간 문자열을 UTC Date로 변환
 * const utc = timezoneService.convertToUtc('2025-01-15 09:00:00', 'Asia/Seoul');
 * ```
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 날짜/시간 표시 형식
 */
const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

@Injectable()
export class TimezoneService {
  private readonly defaultTimezone: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultTimezone =
      this.configService.get<string>('DEFAULT_TIMEZONE') || 'Asia/Seoul';
  }

  /**
   * UTC Date 객체를 지정된 타임존의 문자열로 변환합니다
   *
   * @param date - 변환할 UTC Date 객체
   * @param tz - 대상 IANA 타임존 (예: 'Asia/Seoul', 'America/New_York')
   * @returns 타임존이 적용된 'YYYY-MM-DD HH:mm:ss' 형식 문자열
   */
  convertToTimezone(date: Date, tz: string): string {
    return dayjs.utc(date).tz(tz).format(DATE_FORMAT);
  }

  /**
   * 특정 타임존의 날짜/시간 문자열을 UTC Date 객체로 변환합니다
   *
   * @param dateStr - 변환할 날짜/시간 문자열 (예: '2025-01-15 09:00:00')
   * @param tz - 입력 문자열의 IANA 타임존
   * @returns UTC 기준 Date 객체
   */
  convertToUtc(dateStr: string, tz: string): Date {
    return dayjs.tz(dateStr, tz).utc().toDate();
  }

  /**
   * UTC Date 객체를 지정된 타임존(또는 기본 타임존)으로 포맷합니다
   *
   * @param date - 포맷할 UTC Date 객체
   * @param tz - 대상 IANA 타임존 (미지정 시 기본 타임존 사용)
   * @returns 'YYYY-MM-DD HH:mm:ss' 형식의 문자열
   */
  formatDate(date: Date, tz?: string): string {
    const targetTz = tz || this.defaultTimezone;
    return dayjs.utc(date).tz(targetTz).format(DATE_FORMAT);
  }

  /**
   * 설정된 기본 타임존을 반환합니다
   *
   * 환경 변수 DEFAULT_TIMEZONE이 설정되지 않은 경우 'Asia/Seoul'을 반환합니다.
   *
   * @returns 기본 IANA 타임존 문자열
   */
  getDefaultTimezone(): string {
    return this.defaultTimezone;
  }
}
