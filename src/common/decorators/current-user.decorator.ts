/**
 * 현재 사용자 데코레이터
 *
 * 인증된 요청에서 사용자 정보를 추출하는 파라미터 데코레이터입니다.
 * Passport 미들웨어가 request.user에 저장한 사용자 객체를 반환합니다.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 *
 * // 특정 필드만 추출
 * @Get('my-id')
 * @UseGuards(JwtAuthGuard)
 * getMyId(@CurrentUser('id') userId: string) {
 *   return userId;
 * }
 * ```
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * 인증된 요청의 사용자 정보를 추출하는 데코레이터
 *
 * @param data - 추출할 사용자 객체의 특정 속성명 (선택, 미지정 시 전체 user 객체 반환)
 * @param ctx - 실행 컨텍스트
 * @returns 사용자 객체 또는 지정된 속성 값
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      return null;
    }

    if (data) {
      return (user as Record<string, unknown>)[data];
    }

    return user;
  },
);
