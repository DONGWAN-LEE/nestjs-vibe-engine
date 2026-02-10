/**
 * 사용자 서비스
 *
 * 사용자 도메인의 비즈니스 로직을 처리합니다.
 * 캐시 우선 조회, 이메일 암호화/복호화, 세션 무효화 등의 로직을 포함합니다.
 *
 * ARCHITECTURE.md 설계 원칙:
 * - 요청당 최대 3개 쿼리 이내
 * - 캐시 우선 조회 (Redis)
 * - 이메일은 암호화 저장, 응답 시 복호화
 *
 * @example
 * ```typescript
 * constructor(private readonly userService: UserService) {}
 *
 * const profile = await this.userService.getProfile(userId);
 * ```
 *
 * @module user
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UserRepository } from './user.repository';
import { CacheService } from '../core/cache/cache.service';
import { EncryptionService } from '../core/encryption/encryption.service';
import { LoggerService } from '../core/logger/logger.service';
import { CACHE_KEYS, CACHE_TTL } from '../core/cache/cache-key.constants';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfileResponseDto } from './dto/user-response.dto';

/**
 * 사용자 생성 시 필요한 데이터 인터페이스
 */
interface CreateUserData {
  /** Google OAuth 고유 식별자 */
  googleId: string;
  /** 사용자 이메일 (평문, 내부에서 암호화 처리) */
  email: string;
  /** 사용자 표시 이름 */
  name: string;
  /** 프로필 이미지 URL (선택적) */
  picture?: string;
}

@Injectable()
export class UserService {
  private readonly logger: LoggerService;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly cacheService: CacheService,
    private readonly encryptionService: EncryptionService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('UserService');
  }

  /**
   * ID로 사용자를 조회합니다
   *
   * 캐시 우선 전략을 적용합니다:
   * 1. Redis 캐시 확인 (user_info:{userId})
   * 2. 캐시 미스 시 DB에서 조회
   * 3. DB 조회 결과를 캐시에 저장 (TTL: 1시간)
   *
   * @param id - 사용자 고유 식별자
   * @returns 사용자 엔티티 또는 null
   */
  async findById(id: string): Promise<User | null> {
    const cacheKey = CACHE_KEYS.USER_INFO(id);
    const cached = await this.cacheService.get<User>(cacheKey);

    if (cached) {
      this.logger.debug('User found in cache', { userId: id });
      return cached;
    }

    const user = await this.userRepository.findById(id);

    if (user) {
      await this.cacheService.set(cacheKey, user, CACHE_TTL.USER_INFO);
      this.logger.debug('User cached from DB', { userId: id });
    }

    return user;
  }

  /**
   * 이메일로 사용자를 조회합니다
   *
   * 이메일을 암호화한 후 DB에서 검색합니다.
   * 이메일은 AES-256-GCM으로 암호화되어 저장되므로,
   * 검색 시에는 hashForSearch를 사용하여 해시 기반 조회를 수행합니다.
   *
   * @param email - 평문 이메일 주소
   * @returns 사용자 엔티티 또는 null
   */
  async findByEmail(email: string): Promise<User | null> {
    const encryptedEmail = this.encryptionService.encrypt(email);
    return this.userRepository.findByEmail(encryptedEmail);
  }

  /**
   * Google ID로 사용자를 조회합니다
   *
   * OAuth 인증 콜백에서 기존 사용자 확인에 사용됩니다.
   *
   * @param googleId - Google OAuth 고유 식별자
   * @returns 사용자 엔티티 또는 null
   */
  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findByGoogleId(googleId);
  }

  /**
   * 새로운 사용자를 생성합니다
   *
   * 이메일을 암호화하여 저장하고, 생성된 사용자 정보를 캐시에 저장합니다.
   * Google OAuth 인증 후 최초 로그인 시 호출됩니다.
   *
   * @param data - 사용자 생성 데이터 (이메일은 평문으로 전달)
   * @returns 생성된 사용자 엔티티
   */
  async create(data: CreateUserData): Promise<User> {
    const encryptedEmail = this.encryptionService.encrypt(data.email);

    const user = await this.userRepository.create({
      googleId: data.googleId,
      email: encryptedEmail,
      name: data.name,
      picture: data.picture,
    });

    const cacheKey = CACHE_KEYS.USER_INFO(user.id);
    await this.cacheService.set(cacheKey, user, CACHE_TTL.USER_INFO);

    this.logger.info('User created', { userId: user.id });
    return user;
  }

  /**
   * 사용자 정보를 수정합니다
   *
   * DB를 업데이트한 후 기존 캐시를 무효화하고 새로운 데이터로 캐시를 갱신합니다.
   * Write-through 캐시 전략을 적용합니다.
   *
   * @param id - 사용자 고유 식별자
   * @param dto - 수정할 필드 데이터
   * @returns 수정된 사용자 엔티티
   * @throws NotFoundException 사용자가 존재하지 않는 경우
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findById(id);

    if (!existingUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_001',
          message: 'User not found',
        },
      });
    }

    const updateData: Partial<{ name: string; picture: string | null }> = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }

    if (dto.picture !== undefined) {
      updateData.picture = dto.picture;
    }

    const updatedUser = await this.userRepository.update(id, updateData);

    const cacheKey = CACHE_KEYS.USER_INFO(id);
    await this.cacheService.del(cacheKey);
    await this.cacheService.set(cacheKey, updatedUser, CACHE_TTL.USER_INFO);

    this.logger.info('User updated', { userId: id, fields: Object.keys(updateData) });
    return updatedUser;
  }

  /**
   * 사용자를 소프트 삭제합니다
   *
   * 삭제 프로세스:
   * 1. 사용자 존재 여부 확인
   * 2. deletedAt 설정 (Soft Delete)
   * 3. 해당 사용자의 모든 세션 무효화
   * 4. 사용자 정보 캐시 삭제
   *
   * @param id - 사용자 고유 식별자
   * @returns 소프트 삭제된 사용자 엔티티
   * @throws NotFoundException 사용자가 존재하지 않는 경우
   */
  async softDelete(id: string): Promise<User> {
    const existingUser = await this.userRepository.findById(id);

    if (!existingUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_001',
          message: 'User not found',
        },
      });
    }

    const deletedUser = await this.userRepository.softDelete(id);

    await this.invalidateUserSessions(id);

    const cacheKey = CACHE_KEYS.USER_INFO(id);
    await this.cacheService.del(cacheKey);

    this.logger.info('User soft deleted', { userId: id });
    return deletedUser;
  }

  /**
   * 소프트 삭제된 사용자를 복원합니다
   *
   * deletedAt 필드를 null로 설정하여 계정을 재활성화합니다.
   *
   * @param id - 사용자 고유 식별자
   * @returns 복원된 사용자 엔티티
   * @throws NotFoundException 삭제된 사용자가 존재하지 않는 경우
   */
  async restore(id: string): Promise<User> {
    const deletedUser = await this.userRepository.findDeletedById(id);

    if (!deletedUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_001',
          message: 'Deleted user not found',
        },
      });
    }

    const restoredUser = await this.userRepository.restore(id);

    const cacheKey = CACHE_KEYS.USER_INFO(id);
    await this.cacheService.set(cacheKey, restoredUser, CACHE_TTL.USER_INFO);

    this.logger.info('User restored', { userId: id });
    return restoredUser;
  }

  /**
   * 사용자 프로필을 조회합니다
   *
   * 클라이언트에 반환할 수 있는 형태로 사용자 정보를 변환합니다.
   * 암호화된 이메일을 복호화하고, 타임스탬프를 ISO 8601 문자열로 변환합니다.
   *
   * @param id - 사용자 고유 식별자
   * @returns 사용자 프로필 응답 DTO
   * @throws NotFoundException 사용자가 존재하지 않는 경우
   */
  async getProfile(id: string): Promise<UserProfileResponseDto> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_001',
          message: 'User not found',
        },
      });
    }

    let decryptedEmail: string;
    try {
      decryptedEmail = this.encryptionService.decrypt(user.email);
    } catch {
      this.logger.error('Failed to decrypt user email', { userId: id });
      decryptedEmail = user.email;
    }

    const profile: UserProfileResponseDto = {
      id: user.id,
      email: decryptedEmail,
      name: user.name,
      picture: user.picture ?? undefined,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    return profile;
  }

  /**
   * 사용자의 모든 세션을 무효화합니다
   *
   * 사용자 삭제, 보안 이벤트 발생 시 호출됩니다.
   * 세션 관련 캐시 키를 모두 삭제합니다.
   *
   * @param userId - 사용자 고유 식별자
   */
  private async invalidateUserSessions(userId: string): Promise<void> {
    const sessionCacheKey = CACHE_KEYS.USER_SESSION(userId);
    await this.cacheService.del(sessionCacheKey);

    const sessionKeys = await this.cacheService.keys(`session:*`);
    const userSessionKeys: string[] = [];

    for (const key of sessionKeys) {
      const sessionData = await this.cacheService.get<{ userId: string }>(key);
      if (sessionData && sessionData.userId === userId) {
        userSessionKeys.push(key);
      }
    }

    if (userSessionKeys.length > 0) {
      await this.cacheService.del(...userSessionKeys);
    }

    this.logger.info('User sessions invalidated', {
      userId,
      invalidatedCount: userSessionKeys.length,
    });
  }
}
