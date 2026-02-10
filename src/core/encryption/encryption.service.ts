/**
 * 암호화 서비스
 *
 * AES-256-GCM 알고리즘을 사용한 대칭 암호화를 제공합니다.
 * 인증 태그(Auth Tag)를 통한 무결성 검증이 포함되며,
 * 검색용 단방향 해시 기능도 함께 제공합니다.
 *
 * @example
 * ```typescript
 * const encrypted = encryptionService.encrypt('민감한 데이터');
 * const decrypted = encryptionService.decrypt(encrypted);
 * const searchHash = encryptionService.hashForSearch('검색용 키');
 * ```
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const keyStr = this.configService.get<string>('ENCRYPTION_KEY') || '';
    this.key = Buffer.from(keyStr.padEnd(32, '0').slice(0, 32));
  }

  /**
   * 평문을 AES-256-GCM으로 암호화합니다
   *
   * 암호화 결과는 "IV:AuthTag:암호문" 형식의 16진수 문자열로 반환됩니다.
   * 매 호출마다 랜덤 IV를 생성하므로, 같은 평문이라도 다른 암호문이 생성됩니다.
   *
   * @param plainText - 암호화할 평문 문자열
   * @returns IV, 인증 태그, 암호문이 콜론으로 구분된 문자열
   */
  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * AES-256-GCM으로 암호화된 문자열을 복호화합니다
   *
   * 인증 태그를 검증하여 데이터 무결성을 보장합니다.
   * 잘못된 키나 변조된 데이터의 경우 예외가 발생합니다.
   *
   * @param cipherText - "IV:AuthTag:암호문" 형식의 암호화된 문자열
   * @returns 복호화된 평문 문자열
   * @throws 인증 태그 검증 실패 또는 잘못된 형식인 경우
   */
  decrypt(cipherText: string): string {
    const [ivHex, authTagHex, encrypted] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 검색용 단방향 SHA-256 해시를 생성합니다
   *
   * 암호화된 데이터의 검색을 위해 평문의 해시값을 별도로 저장할 때 사용합니다.
   * 단방향 해시이므로 원본 복원이 불가능합니다.
   *
   * @param plainText - 해시할 평문 문자열
   * @returns 64자리 16진수 SHA-256 해시 문자열
   */
  hashForSearch(plainText: string): string {
    return crypto.createHash('sha256').update(plainText).digest('hex');
  }
}
