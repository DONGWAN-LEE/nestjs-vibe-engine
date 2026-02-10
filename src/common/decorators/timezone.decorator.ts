/**
 * 타임존 데코레이터
 *
 * 요청 헤더에서 클라이언트 타임존 정보를 추출하는 파라미터 데코레이터입니다.
 * X-Timezone 헤더를 읽으며, 미지정 시 'Asia/Seoul'을 기본값으로 사용합니다.
 *
 * @example
 * ```typescript
 * @Get('events')
 * getEvents(@Timezone() timezone: string) {
 *   // timezone = 'Asia/Seoul' (기본값) 또는 헤더에서 전달된 타임존
 *   return this.eventService.findAll(timezone);
 * }
 * ```
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * 기본 타임존 폴백 값
 */
const DEFAULT_TIMEZONE = 'Asia/Seoul';

/**
 * 요청의 X-Timezone 헤더에서 타임존을 추출하는 데코레이터
 *
 * @param _data - 사용하지 않는 파라미터 (데코레이터 시그니처 호환)
 * @param ctx - 실행 컨텍스트
 * @returns IANA 타임존 문자열 (예: 'Asia/Seoul', 'America/New_York')
 */
export const Timezone = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const headerTimezone = request.headers['x-timezone'] as string;

    return headerTimezone || DEFAULT_TIMEZONE;
  },
);
