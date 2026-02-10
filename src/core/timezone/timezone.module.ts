/**
 * 타임존 모듈
 *
 * UTC+0 기반 날짜/시간 저장과 클라이언트 타임존 변환 기능을 전역으로 제공합니다.
 * TimezoneService와 TimezoneInterceptor를 포함합니다.
 */

import { Global, Module } from '@nestjs/common';
import { TimezoneService } from './timezone.service';
import { TimezoneInterceptor } from './timezone.interceptor';

@Global()
@Module({
  providers: [TimezoneService, TimezoneInterceptor],
  exports: [TimezoneService, TimezoneInterceptor],
})
export class TimezoneModule {}
