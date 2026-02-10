/**
 * 암호화 모듈
 *
 * AES-256-GCM 기반의 암호화/복호화 서비스를 전역으로 제공합니다.
 * ConfigService를 통해 ENCRYPTION_KEY 환경 변수를 주입받습니다.
 */

import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
