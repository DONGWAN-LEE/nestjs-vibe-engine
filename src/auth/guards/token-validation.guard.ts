/**
 * 토큰 검증 가드 (강화된 JWT 가드)
 *
 * 표준 JWT 검증 이후 Redis 캐시에서 세션 무효화 상태를 추가 확인합니다.
 * 캐시에 session_invalid:{sessionId} 키가 존재하면 즉시 거부하며,
 * 캐시 장애 시에는 DB 폴백으로 세션 유효성을 검증합니다.
 *
 * @module auth/guards
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { LoggerService } from '../../core/logger/logger.service';

/**
 * 강화된 토큰 검증 가드
 *
 * @description
 * 검증 순서:
 * 1. JWT 서명 및 만료 검증 (Passport JWT 전략에서 처리)
 * 2. Redis 캐시에서 세션 무효화 플래그 확인
 * 3. 캐시 미스 시 DB에서 세션 유효성 확인
 * 4. 모든 검증 통과 시 요청 진행
 */
@Injectable()
export class TokenValidationGuard implements CanActivate {
  private readonly logger: LoggerService;

  constructor(
    private readonly authService: AuthService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('TokenValidationGuard');
  }

  /**
   * 요청의 JWT 토큰을 검증하고 세션 유효성을 확인합니다
   *
   * @param context - NestJS 실행 컨텍스트
   * @returns 세션이 유효하면 true
   * @throws UnauthorizedException 세션이 무효화되었거나 유효하지 않은 경우
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.userId || !user.sessionId) {
      this.logger.warn('요청에 유저 정보가 누락되었습니다');
      throw new UnauthorizedException('Invalid authentication credentials');
    }

    const { userId, sessionId } = user;

    const session = await this.authService.validateSession(userId, sessionId);

    if (!session) {
      this.logger.warn('세션이 무효화되었습니다', { userId, sessionId });
      throw new UnauthorizedException('Session has been invalidated');
    }

    request.user = {
      ...user,
      ...session,
    };

    return true;
  }
}
