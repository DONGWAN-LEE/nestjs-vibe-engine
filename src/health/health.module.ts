/**
 * 헬스체크 모듈
 *
 * 애플리케이션 상태 확인 엔드포인트를 제공합니다.
 * TerminusModule을 사용하여 Database 및 Redis 연결 상태를 모니터링합니다.
 */

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
