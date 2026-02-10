/**
 * 타임존 변환 인터셉터
 *
 * 응답 데이터의 Date 필드를 클라이언트 타임존으로 자동 변환합니다.
 * X-Timezone 헤더에서 타임존을 읽으며,
 * 미지정 시 DEFAULT_TIMEZONE 환경 변수, 최종 폴백으로 'Asia/Seoul'을 사용합니다.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { TimezoneService } from './timezone.service';

@Injectable()
export class TimezoneInterceptor implements NestInterceptor {
  constructor(private readonly timezoneService: TimezoneService) {}

  /**
   * 요청-응답 사이클을 가로채어 응답 내 Date 필드를 타임존 변환합니다
   *
   * @param context - 실행 컨텍스트
   * @param next - 다음 핸들러
   * @returns 타임존이 변환된 응답 Observable
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const timezone = this.resolveTimezone(request);

    return next.handle().pipe(
      map((data) => {
        if (data === null || data === undefined) {
          return data;
        }
        return this.transformDates(data, timezone);
      }),
    );
  }

  /**
   * 요청에서 타임존을 결정합니다
   *
   * 우선순위: X-Timezone 헤더 > DEFAULT_TIMEZONE 환경 변수 > 'Asia/Seoul'
   *
   * @param request - Express Request 객체
   * @returns IANA 타임존 문자열
   */
  private resolveTimezone(request: Request): string {
    const headerTimezone = request.headers['x-timezone'] as string;

    if (headerTimezone) {
      return headerTimezone;
    }

    return this.timezoneService.getDefaultTimezone();
  }

  /**
   * 데이터 내 모든 Date 필드를 재귀적으로 타임존 변환합니다
   *
   * Date 객체를 발견하면 'YYYY-MM-DD HH:mm:ss' 형식의 문자열로 변환합니다.
   * 배열과 중첩 객체를 재귀적으로 순회합니다.
   *
   * @param data - 변환할 데이터 (원시값, 객체, 배열)
   * @param tz - 대상 IANA 타임존
   * @returns Date 필드가 변환된 데이터
   */
  private transformDates(data: unknown, tz: string): unknown {
    if (data instanceof Date) {
      return this.timezoneService.convertToTimezone(data, tz);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.transformDates(item, tz));
    }

    if (data !== null && typeof data === 'object') {
      const transformed: Record<string, unknown> = {};
      const entries = Object.entries(data as Record<string, unknown>);

      for (const [key, value] of entries) {
        transformed[key] = this.transformDates(value, tz);
      }

      return transformed;
    }

    return data;
  }
}
