/**
 * 인증 서비스
 *
 * Google OAuth 로그인, JWT 토큰 발급/갱신, 세션 관리를 처리합니다.
 * Refresh Token Rotation과 탈취 감지 전략을 구현하며,
 * Redis 캐시를 통한 고속 세션 검증을 지원합니다.
 *
 * @module auth
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../core/database/prisma.service';
import { EncryptionService } from '../core/encryption/encryption.service';
import { LoggerService } from '../core/logger/logger.service';
import { sha256Hash, constantTimeCompare, generateSecureRandomString } from '../common/utils';
import { GoogleProfile } from './strategies/google.strategy';
import {
  AuthResponseDto,
  TokenRefreshResponseDto,
  LogoutResponseDto,
} from './dto/auth-response.dto';

/** Access Token 만료 시간 (초) */
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 3600;

/** Refresh Token 만료 시간 (초) */
const REFRESH_TOKEN_EXPIRES_IN_SECONDS = 2592000;

/** 세션 무효화 캐시 키 접두사 */
const SESSION_INVALID_PREFIX = 'session_invalid';

/** 유저 정보 캐시 키 접두사 */
const USER_INFO_PREFIX = 'user_info';

/** 유저 정보 캐시 TTL (초) */
const USER_INFO_CACHE_TTL = 3600;

/**
 * 내부 토큰 생성 결과 인터페이스
 */
interface GeneratedTokens {
  /** JWT Access Token */
  accessToken: string;

  /** JWT Refresh Token */
  refreshToken: string;

  /** Refresh Token Rotation 추적용 고유 식별자 */
  tokenId: string;
}

/**
 * CacheService 인터페이스
 *
 * @description
 * Redis 캐시 서비스와의 의존성을 분리합니다.
 * CacheModule 구현 전까지 선택적(optional) 주입으로 처리합니다.
 */
interface CacheServiceInterface {
  /** 캐시에서 값을 조회합니다 */
  get(key: string): Promise<string | null>;

  /** 캐시에 값을 저장합니다 */
  set(key: string, value: string, ttl?: number): Promise<void>;

  /** 캐시에서 키를 삭제합니다 */
  del(key: string): Promise<void>;

  /** 키의 존재 여부를 확인합니다 */
  exists(key: string): Promise<boolean>;
}

/**
 * 인증 핵심 서비스
 *
 * @description
 * 주요 기능:
 * - Google OAuth 프로필을 기반으로 유저 생성/조회 및 JWT 발급
 * - Refresh Token Rotation을 통한 토큰 갱신
 * - 탈취 감지 시 전체 세션 무효화
 * - Redis 캐시 기반 고속 세션 검증 (DB 폴백 포함)
 * - 단일/전체 디바이스 로그아웃
 */
@Injectable()
export class AuthService {
  private readonly logger: LoggerService;
  private readonly maxDevicesPerUser: number;
  private cacheService: CacheServiceInterface | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('AuthService');
    this.maxDevicesPerUser = this.configService.get<number>('jwt.maxDevicesPerUser', 1);
  }

  /**
   * CacheService를 지연 주입합니다
   *
   * @description
   * CacheModule이 아직 구현되지 않은 경우 null로 유지되며,
   * 모든 캐시 연산은 graceful하게 스킵됩니다.
   *
   * @param cache - Redis 캐시 서비스 인스턴스
   */
  setCacheService(cache: CacheServiceInterface): void {
    this.cacheService = cache;
  }

  /**
   * Google OAuth 로그인을 처리합니다
   *
   * @description
   * 처리 순서:
   * 1. googleId로 기존 유저 검색
   * 2. 미존재 시 email 중복 확인 후 유저 생성
   * 3. 기존 세션 무효화 (MAX_DEVICES_PER_USER=1)
   * 4. 새 세션 생성 및 JWT 토큰 페어 발급
   * 5. Refresh Token의 SHA-256 해시를 DB에 저장
   * 6. 유저 정보를 Redis에 캐싱
   *
   * @param profile - Google OAuth에서 검증된 사용자 프로필
   * @returns 유저 정보, 토큰 페어, 신규 가입 여부를 포함하는 응답
   */
  async handleGoogleLogin(profile: GoogleProfile): Promise<AuthResponseDto> {
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    let isNewUser = false;

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (existingByEmail) {
        this.logger.warn('이메일이 이미 다른 계정에 등록되어 있습니다', {
          email: profile.email,
          existingUserId: existingByEmail.id,
          newGoogleId: profile.googleId,
        });
        throw new UnauthorizedException(
          'Email is already registered with a different account',
        );
      }

      user = await this.prisma.user.create({
        data: {
          googleId: profile.googleId,
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
        },
      });

      isNewUser = true;

      this.logger.info('신규 유저가 생성되었습니다', {
        userId: user.id,
        email: profile.email,
      });
    } else {
      const updateData: Record<string, string> = {};
      if (profile.name !== user.name) {
        updateData.name = profile.name;
      }
      if (profile.picture !== user.picture) {
        updateData.picture = profile.picture || '';
      }

      if (Object.keys(updateData).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    }

    await this.invalidateExistingSessions(user.id);

    const session = await this.createSession(user.id);

    const tokens = this.generateTokens(user.id, session.id);

    const refreshTokenHash = sha256Hash(tokens.refreshToken);
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshToken: refreshTokenHash },
    });

    await this.cacheUserInfo(user.id, {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      sessionId: session.id,
    });

    this.logger.info('Google OAuth 로그인 성공', {
      userId: user.id,
      sessionId: session.id,
      isNewUser,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture || undefined,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
        refreshExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
        tokenType: 'Bearer',
      },
      isNewUser,
    };
  }

  /**
   * Refresh Token을 사용하여 새 토큰 페어를 발급합니다
   *
   * @description
   * 처리 순서:
   * 1. Refresh Token의 JWT 서명을 검증합니다
   * 2. 페이로드에서 sessionId를 추출하여 DB 세션을 조회합니다
   * 3. 저장된 해시와 현재 토큰의 해시를 상수 시간 비교합니다
   * 4. 해시 불일치 시 탈취로 판단, 해당 유저의 전체 세션을 무효화합니다
   * 5. 일치 시 새 토큰 페어를 발급하고 해시를 갱신합니다
   *
   * @param refreshToken - 기존에 발급된 Refresh Token
   * @returns 새로 발급된 토큰 페어
   * @throws UnauthorizedException 토큰이 유효하지 않거나 탈취가 감지된 경우
   */
  async refreshTokens(refreshToken: string): Promise<TokenRefreshResponseDto> {
    let payload: { userId: string; sessionId: string; tokenId: string };

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch (error) {
      this.logger.warn('Refresh Token JWT 검증 실패', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || !session.isValid || session.deletedAt !== null) {
      this.logger.warn('유효하지 않은 세션으로 토큰 갱신 시도', {
        sessionId: payload.sessionId,
        userId: payload.userId,
      });
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (new Date() > session.expiresAt) {
      this.logger.warn('만료된 세션으로 토큰 갱신 시도', {
        sessionId: payload.sessionId,
        expiresAt: session.expiresAt.toISOString(),
      });

      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { isValid: false },
      });

      throw new UnauthorizedException('Session has expired');
    }

    const currentTokenHash = sha256Hash(refreshToken);
    const hashesMatch = constantTimeCompare(currentTokenHash, session.refreshToken);

    if (!hashesMatch) {
      this.logger.error('Refresh Token 탈취 감지 - 전체 세션 무효화', {
        userId: payload.userId,
        sessionId: payload.sessionId,
      });

      await this.invalidateAllUserSessions(payload.userId);

      throw new UnauthorizedException(
        'Token reuse detected. All sessions have been invalidated for security.',
      );
    }

    const newTokens = this.generateTokens(payload.userId, session.id);
    const newRefreshTokenHash = sha256Hash(newTokens.refreshToken);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshTokenHash,
        updatedAt: new Date(),
      },
    });

    this.logger.info('토큰 갱신 성공', {
      userId: payload.userId,
      sessionId: session.id,
    });

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      accessExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    };
  }

  /**
   * 세션의 유효성을 검증합니다
   *
   * @description
   * 검증 순서:
   * 1. Redis 캐시에서 session_invalid:{sessionId} 존재 여부 확인
   * 2. 존재하면 즉시 null 반환 (무효화된 세션)
   * 3. Redis 캐시에서 user_info:{userId} 조회
   * 4. 캐시 히트 시 세션 정보 포함하여 반환
   * 5. 캐시 미스 또는 캐시 장애 시 DB에서 직접 조회
   *
   * @param userId - 검증할 유저의 UUID
   * @param sessionId - 검증할 세션의 UUID
   * @returns 유효한 세션 정보 또는 null
   */
  async validateSession(
    userId: string,
    sessionId: string,
  ): Promise<Record<string, unknown> | null> {
    const isInvalidated = await this.isSessionInvalidatedInCache(sessionId);
    if (isInvalidated) {
      return null;
    }

    const cachedUser = await this.getCachedUserInfo(userId);
    if (cachedUser) {
      return {
        userId: cachedUser.id,
        sessionId,
        email: cachedUser.email,
        name: cachedUser.name,
        picture: cachedUser.picture,
      };
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (
      !session ||
      !session.isValid ||
      session.deletedAt !== null ||
      session.userId !== userId
    ) {
      return null;
    }

    if (new Date() > session.expiresAt) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { isValid: false },
      });
      return null;
    }

    await this.cacheUserInfo(userId, {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      picture: session.user.picture,
      sessionId: session.id,
    });

    return {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      name: session.user.name,
      picture: session.user.picture,
    };
  }

  /**
   * 로그아웃을 처리합니다
   *
   * @description
   * allDevices=true 시 해당 유저의 모든 세션을 무효화하며,
   * false 시 현재 세션만 무효화합니다.
   * 무효화된 세션은 Redis에 session_invalid 플래그가 설정됩니다.
   *
   * @param userId - 로그아웃할 유저의 UUID
   * @param sessionId - 현재 세션의 UUID
   * @param allDevices - 전체 디바이스 로그아웃 여부
   * @returns 로그아웃 처리 결과
   */
  async logout(
    userId: string,
    sessionId: string,
    allDevices: boolean,
  ): Promise<LogoutResponseDto> {
    let sessionsInvalidated: number;

    if (allDevices) {
      sessionsInvalidated = await this.invalidateAllUserSessions(userId);

      this.logger.info('전체 디바이스 로그아웃 처리', {
        userId,
        sessionsInvalidated,
      });
    } else {
      await this.invalidateSingleSession(sessionId);
      sessionsInvalidated = 1;

      this.logger.info('단일 세션 로그아웃 처리', {
        userId,
        sessionId,
      });
    }

    await this.clearCachedUserInfo(userId);

    return {
      message: allDevices
        ? 'All sessions have been invalidated'
        : 'Session has been invalidated',
      sessionsInvalidated,
    };
  }

  /**
   * JWT Access Token과 Refresh Token 페어를 생성합니다
   *
   * @param userId - 유저 고유 식별자
   * @param sessionId - 세션 고유 식별자
   * @returns Access Token, Refresh Token, tokenId를 포함하는 객체
   */
  private generateTokens(userId: string, sessionId: string): GeneratedTokens {
    const tokenId = generateSecureRandomString(32);

    const accessToken = this.jwtService.sign(
      { userId, sessionId },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      },
    );

    const refreshToken = this.jwtService.sign(
      { userId, sessionId, tokenId },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
      },
    );

    return { accessToken, refreshToken, tokenId };
  }

  /**
   * 유저의 기존 세션을 무효화합니다 (동시 접속 제한)
   *
   * @description
   * MAX_DEVICES_PER_USER 설정에 따라 유효한 세션 수를 초과하는
   * 기존 세션을 모두 무효화합니다. 기본값 1은 단일 디바이스만 허용하며,
   * 0으로 설정하면 동시 접속 제한 없이 무제한 허용합니다.
   *
   * @param userId - 세션을 무효화할 유저의 UUID
   */
  private async invalidateExistingSessions(userId: string): Promise<void> {
    const activeSessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        isValid: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (this.maxDevicesPerUser > 0 && activeSessions.length >= this.maxDevicesPerUser) {
      const sessionIdsToInvalidate = activeSessions.map((s) => s.id);

      await this.prisma.userSession.updateMany({
        where: { id: { in: sessionIdsToInvalidate } },
        data: { isValid: false },
      });

      for (const sid of sessionIdsToInvalidate) {
        await this.markSessionInvalidInCache(sid);
      }

      this.logger.info('기존 세션 무효화 완료 (동시 접속 제한)', {
        userId,
        invalidatedCount: sessionIdsToInvalidate.length,
      });
    }
  }

  /**
   * 새 세션 레코드를 생성합니다
   *
   * @param userId - 세션을 생성할 유저의 UUID
   * @returns 생성된 세션 레코드
   */
  private async createSession(
    userId: string,
  ): Promise<{ id: string; userId: string }> {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + REFRESH_TOKEN_EXPIRES_IN_SECONDS);

    const session = await this.prisma.userSession.create({
      data: {
        userId,
        refreshToken: '',
        isValid: true,
        expiresAt,
      },
    });

    return { id: session.id, userId: session.userId };
  }

  /**
   * 유저의 모든 세션을 무효화합니다
   *
   * @param userId - 전체 세션을 무효화할 유저의 UUID
   * @returns 무효화된 세션 수
   */
  private async invalidateAllUserSessions(userId: string): Promise<number> {
    const activeSessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        isValid: true,
        deletedAt: null,
      },
    });

    if (activeSessions.length === 0) {
      return 0;
    }

    await this.prisma.userSession.updateMany({
      where: {
        userId,
        isValid: true,
        deletedAt: null,
      },
      data: { isValid: false },
    });

    for (const session of activeSessions) {
      await this.markSessionInvalidInCache(session.id);
    }

    return activeSessions.length;
  }

  /**
   * 단일 세션을 무효화합니다
   *
   * @param sessionId - 무효화할 세션의 UUID
   */
  private async invalidateSingleSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isValid: false },
    });

    await this.markSessionInvalidInCache(sessionId);
  }

  /**
   * Redis 캐시에 세션 무효화 플래그를 설정합니다
   *
   * @param sessionId - 무효화할 세션의 UUID
   */
  private async markSessionInvalidInCache(sessionId: string): Promise<void> {
    if (!this.cacheService) {
      return;
    }

    try {
      await this.cacheService.set(
        `${SESSION_INVALID_PREFIX}:${sessionId}`,
        'true',
        REFRESH_TOKEN_EXPIRES_IN_SECONDS,
      );
    } catch (error) {
      this.logger.warn('세션 무효화 캐시 설정 실패', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Redis 캐시에서 세션 무효화 여부를 확인합니다
   *
   * @param sessionId - 확인할 세션의 UUID
   * @returns 세션이 무효화되었으면 true, 캐시 장애 시 false (DB 폴백으로 처리)
   */
  private async isSessionInvalidatedInCache(sessionId: string): Promise<boolean> {
    if (!this.cacheService) {
      return false;
    }

    try {
      return await this.cacheService.exists(`${SESSION_INVALID_PREFIX}:${sessionId}`);
    } catch (error) {
      this.logger.warn('세션 무효화 캐시 조회 실패 - DB 폴백으로 진행', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * 유저 정보를 Redis에 캐싱합니다
   *
   * @param userId - 캐싱할 유저의 UUID
   * @param userInfo - 캐싱할 유저 정보 객체
   */
  private async cacheUserInfo(
    userId: string,
    userInfo: Record<string, unknown>,
  ): Promise<void> {
    if (!this.cacheService) {
      return;
    }

    try {
      await this.cacheService.set(
        `${USER_INFO_PREFIX}:${userId}`,
        JSON.stringify(userInfo),
        USER_INFO_CACHE_TTL,
      );
    } catch (error) {
      this.logger.warn('유저 정보 캐시 저장 실패', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Redis에서 캐싱된 유저 정보를 조회합니다
   *
   * @param userId - 조회할 유저의 UUID
   * @returns 캐싱된 유저 정보 또는 null
   */
  private async getCachedUserInfo(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.cacheService) {
      return null;
    }

    try {
      const cached = await this.cacheService.get(`${USER_INFO_PREFIX}:${userId}`);
      if (cached) {
        return JSON.parse(cached) as Record<string, unknown>;
      }
      return null;
    } catch (error) {
      this.logger.warn('유저 정보 캐시 조회 실패', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Redis에서 유저 정보 캐시를 삭제합니다
   *
   * @param userId - 캐시를 삭제할 유저의 UUID
   */
  private async clearCachedUserInfo(userId: string): Promise<void> {
    if (!this.cacheService) {
      return;
    }

    try {
      await this.cacheService.del(`${USER_INFO_PREFIX}:${userId}`);
    } catch (error) {
      this.logger.warn('유저 정보 캐시 삭제 실패', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
