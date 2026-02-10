/**
 * 애플리케이션 설정
 *
 * 애플리케이션의 기본 실행 환경 설정을 정의합니다.
 * NODE_ENV, PORT, API 프리픽스, API 버전 등을 관리합니다.
 *
 * @module common/config
 */

import { registerAs } from '@nestjs/config';

/**
 * 애플리케이션 기본 설정을 등록합니다.
 *
 * @description
 * - NODE_ENV: 실행 환경 (local, development, staging, production)
 * - PORT: 서버 리스닝 포트
 * - API_PREFIX: API 경로 접두사
 * - API_VERSION: API 버전 식별자
 */
export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'local',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  apiVersion: process.env.API_VERSION || 'v1',
}));
