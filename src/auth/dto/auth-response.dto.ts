/**
 * 인증 응답 DTO
 *
 * Google OAuth 로그인, 토큰 갱신, 로그아웃 시 반환되는
 * 응답 데이터 구조를 정의합니다.
 *
 * @module auth/dto
 */

/**
 * 유저 정보 응답 구조
 */
export class AuthUserDto {
  /** 유저 고유 식별자 (UUID) */
  id: string;

  /** 유저 이메일 주소 */
  email: string;

  /** 유저 표시 이름 */
  name: string;

  /** Google 프로필 사진 URL */
  picture?: string;
}

/**
 * 토큰 페어 응답 구조
 */
export class AuthTokensDto {
  /** JWT Access Token */
  accessToken: string;

  /** JWT Refresh Token */
  refreshToken: string;

  /** Access Token 만료 시간 (초 단위, 3600) */
  accessExpiresIn: number;

  /** Refresh Token 만료 시간 (초 단위, 2592000) */
  refreshExpiresIn: number;

  /** 토큰 타입 식별자 */
  tokenType: string;
}

/**
 * Google OAuth 로그인 응답 DTO
 *
 * @description
 * - user: 로그인한 유저의 기본 정보
 * - tokens: Access/Refresh Token 페어
 * - isNewUser: 신규 가입 여부
 */
export class AuthResponseDto {
  /** 유저 기본 정보 */
  user: AuthUserDto;

  /** JWT 토큰 페어 */
  tokens: AuthTokensDto;

  /** 신규 가입 유저 여부 */
  isNewUser: boolean;
}

/**
 * 토큰 갱신 응답 DTO
 *
 * @description
 * Refresh Token을 사용하여 새로운 토큰 페어를 발급받은 결과입니다.
 * 기존 Refresh Token은 무효화되며, 새로운 페어로 교체됩니다.
 */
export class TokenRefreshResponseDto {
  /** 새로 발급된 JWT Access Token */
  accessToken: string;

  /** 새로 발급된 JWT Refresh Token */
  refreshToken: string;

  /** Access Token 만료 시간 (초 단위, 3600) */
  accessExpiresIn: number;

  /** Refresh Token 만료 시간 (초 단위, 2592000) */
  refreshExpiresIn: number;
}

/**
 * 로그아웃 응답 DTO
 *
 * @description
 * 로그아웃 처리 결과를 반환합니다.
 * allDevices 옵션에 따라 단일 또는 전체 세션이 무효화됩니다.
 */
export class LogoutResponseDto {
  /** 처리 결과 메시지 */
  message: string;

  /** 무효화된 세션 수 */
  sessionsInvalidated: number;
}
