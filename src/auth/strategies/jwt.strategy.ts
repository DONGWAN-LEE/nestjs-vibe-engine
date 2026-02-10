/**
 * JWT Passport 전략
 *
 * Authorization 헤더의 Bearer Token을 검증하여
 * JWT 페이로드에서 userId, sessionId를 추출합니다.
 * NestJS Passport 모듈과 통합되어 요청 객체에 사용자 정보를 주입합니다.
 *
 * @module auth/strategies
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * JWT Access Token 페이로드 인터페이스
 *
 * @description
 * Access Token에 포함되는 클레임(claims) 구조입니다.
 */
export interface JwtPayload {
  /** 유저 고유 식별자 (UUID) */
  userId: string;

  /** 세션 고유 식별자 (UUID) */
  sessionId: string;

  /** 토큰 발급 시간 (Unix timestamp) */
  iat: number;

  /** 토큰 만료 시간 (Unix timestamp) */
  exp: number;
}

/**
 * Passport JWT 전략 구현
 *
 * @description
 * - Authorization: Bearer {token} 헤더에서 JWT를 추출합니다
 * - JWT 서명을 검증하고 만료 여부를 확인합니다
 * - 유효한 토큰의 페이로드를 request.user로 주입합니다
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  /**
   * JWT 검증 완료 후 페이로드를 request.user에 주입합니다
   *
   * @param payload - JWT에서 디코딩된 페이로드
   * @returns userId와 sessionId를 포함하는 사용자 객체
   */
  validate(payload: JwtPayload): { userId: string; sessionId: string } {
    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
    };
  }
}
