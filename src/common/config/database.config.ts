/**
 * 데이터베이스 설정
 *
 * Prisma ORM의 데이터베이스 연결에 필요한 설정을 정의합니다.
 * DATABASE_URL 환경 변수를 통해 MySQL 연결 문자열을 관리합니다.
 *
 * @module common/config
 */

import { registerAs } from '@nestjs/config';

/**
 * 데이터베이스 연결 설정을 등록합니다.
 *
 * @description
 * - url: MySQL 데이터베이스 연결 URL (Prisma 형식)
 *   형식: mysql://USER:PASSWORD@HOST:PORT/DATABASE
 */
export default registerAs('database', () => ({
  url:
    process.env.DATABASE_URL ||
    'mysql://root:password@localhost:3306/nestjs_engine_db',
}));
