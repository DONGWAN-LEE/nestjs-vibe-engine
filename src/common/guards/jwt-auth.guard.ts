/**
 * JWT 인증 가드
 *
 * Passport JWT 전략을 사용하는 표준 인증 가드입니다.
 * Authorization: Bearer {token} 헤더의 JWT를 검증합니다.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@Request() req) {
 *   return req.user;
 * }
 * ```
 *
 * @module common/guards
 */

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Passport 'jwt' 전략 기반 인증 가드
 *
 * @description
 * - AuthGuard('jwt')를 상속하여 JWT 검증 로직을 재사용합니다
 * - JwtStrategy에서 정의된 validate 메서드를 호출합니다
 * - 검증 성공 시 request.user에 페이로드가 주입됩니다
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
