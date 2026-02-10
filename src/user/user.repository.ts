/**
 * 사용자 리포지토리
 *
 * Prisma 기반의 사용자 데이터 접근 계층입니다.
 * 모든 조회 메서드는 기본적으로 Soft Delete된 레코드를 제외하며,
 * 삭제된 레코드 조회를 위한 별도 메서드를 제공합니다.
 *
 * ARCHITECTURE.md Section 5 - Database 설계 기반 구현
 *
 * @example
 * ```typescript
 * constructor(private readonly userRepository: UserRepository) {}
 *
 * const user = await this.userRepository.findById(userId);
 * ```
 *
 * @module user
 */

import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../core/database/prisma.service';

/**
 * 사용자 데이터 접근 리포지토리
 *
 * @description
 * - 모든 조회 메서드에 deletedAt: null 필터를 적용하여 Soft Delete 지원
 * - 생성, 수정, 삭제, 복원 등 CRUD 전체 메서드 제공
 * - Prisma Client를 직접 노출하지 않고 도메인 중심 인터페이스 제공
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ID로 활성 사용자를 조회합니다
   *
   * Soft Delete되지 않은 사용자만 반환합니다.
   *
   * @param id - 사용자 고유 식별자 (UUID)
   * @returns 사용자 엔티티 또는 null
   */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * 이메일로 활성 사용자를 조회합니다
   *
   * 암호화된 이메일 값으로 검색합니다.
   * Soft Delete되지 않은 사용자만 반환합니다.
   *
   * @param email - 암호화된 이메일 문자열
   * @returns 사용자 엔티티 또는 null
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  /**
   * Google ID로 활성 사용자를 조회합니다
   *
   * OAuth 인증 시 사용자 식별에 사용됩니다.
   * Soft Delete되지 않은 사용자만 반환합니다.
   *
   * @param googleId - Google OAuth 고유 식별자
   * @returns 사용자 엔티티 또는 null
   */
  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { googleId, deletedAt: null },
    });
  }

  /**
   * 새로운 사용자를 생성합니다
   *
   * Google OAuth 인증 후 최초 로그인 시 호출됩니다.
   * 이메일은 암호화된 상태로 저장되어야 합니다.
   *
   * @param data - 사용자 생성 데이터
   * @param data.googleId - Google OAuth 고유 식별자
   * @param data.email - 암호화된 이메일 주소
   * @param data.name - 사용자 표시 이름
   * @param data.picture - 프로필 이미지 URL (선택적)
   * @returns 생성된 사용자 엔티티
   */
  async create(data: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * 사용자 정보를 수정합니다
   *
   * updatedAt 필드를 현재 시각으로 갱신합니다.
   *
   * @param id - 사용자 고유 식별자
   * @param data - 수정할 필드 (name, picture)
   * @returns 수정된 사용자 엔티티
   */
  async update(
    id: string,
    data: Partial<{ name: string; picture: string | null }>,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  /**
   * 사용자를 소프트 삭제합니다
   *
   * deletedAt 필드를 현재 시각으로 설정하여 논리적으로 삭제합니다.
   * 실제 데이터는 보존되며, restore() 메서드로 복원할 수 있습니다.
   *
   * @param id - 사용자 고유 식별자
   * @returns 소프트 삭제된 사용자 엔티티
   */
  async softDelete(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 소프트 삭제된 사용자를 복원합니다
   *
   * deletedAt 필드를 null로 설정하여 활성 상태로 되돌립니다.
   *
   * @param id - 사용자 고유 식별자
   * @returns 복원된 사용자 엔티티
   */
  async restore(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  /**
   * 소프트 삭제된 사용자를 ID로 조회합니다
   *
   * deletedAt이 null이 아닌 사용자만 반환합니다.
   * 계정 복원 가능 여부 확인에 사용됩니다.
   *
   * @param id - 사용자 고유 식별자
   * @returns 삭제된 사용자 엔티티 또는 null
   */
  async findDeletedById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: { not: null } },
    });
  }
}
