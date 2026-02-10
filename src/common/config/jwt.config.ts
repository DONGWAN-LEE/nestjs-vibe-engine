/**
 * JWT 인증 설정
 *
 * JWT 토큰 생성 및 검증에 필요한 설정을 정의합니다.
 * Access Token, Refresh Token의 만료 시간과
 * 사용자당 최대 디바이스 수 제한을 관리합니다.
 *
 * @module common/config
 */

import { registerAs } from '@nestjs/config';

/**
 * JWT 인증 관련 설정을 등록합니다.
 *
 * @description
 * - secret: JWT 서명에 사용되는 비밀 키
 * - accessExpiresIn: Access Token 만료 시간
 * - refreshExpiresIn: Refresh Token 만료 시간
 * - maxDevicesPerUser: 사용자당 허용되는 최대 동시 세션 수
 */
export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  maxDevicesPerUser: parseInt(process.env.MAX_DEVICES_PER_USER || '1', 10),
}));
