/**
 * 인증 요청 DTO
 *
 * Google OAuth 콜백, 토큰 갱신, 로그아웃 요청에 사용되는
 * 입력 데이터 검증 구조를 정의합니다.
 *
 * @module auth/dto
 */

import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * Google OAuth 콜백 요청 DTO
 *
 * @description
 * Google OAuth 인증 완료 후 콜백 URL로 전달되는
 * 인가 코드(authorization code)를 검증합니다.
 */
export class GoogleCallbackDto {
  /** Google OAuth 인가 코드 */
  @IsString()
  code: string;
}

/**
 * 토큰 갱신 요청 DTO
 *
 * @description
 * 만료된 Access Token을 갱신하기 위해
 * 유효한 Refresh Token을 전달합니다.
 */
export class RefreshTokenDto {
  /** 갱신에 사용할 Refresh Token */
  @IsString()
  refreshToken: string;
}

/**
 * 로그아웃 요청 DTO
 *
 * @description
 * 로그아웃 시 단일 세션 또는 전체 디바이스 세션 무효화를 선택합니다.
 * allDevices가 true이면 해당 유저의 모든 세션이 무효화됩니다.
 */
export class LogoutDto {
  /** 전체 디바이스 세션 무효화 여부 (기본값: false) */
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}
