/**
 * Google OAuth 2.0 Passport 전략
 *
 * Google OAuth 2.0을 통한 사용자 인증을 처리합니다.
 * ConfigService에서 Google OAuth 클라이언트 정보를 주입받아
 * Passport 전략으로 등록합니다.
 *
 * @module auth/strategies
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { LoggerService } from '../../core/logger/logger.service';

/**
 * Google OAuth 프로필 정보 인터페이스
 *
 * @description
 * Google OAuth 인증 완료 후 추출되는 사용자 프로필 데이터 구조입니다.
 */
export interface GoogleProfile {
  /** Google 고유 사용자 식별자 */
  googleId: string;

  /** 사용자 이메일 주소 */
  email: string;

  /** 사용자 표시 이름 */
  name: string;

  /** Google 프로필 사진 URL */
  picture: string | undefined;

  /** 이메일 인증 여부 */
  emailVerified: boolean;

  /** Google OAuth Access Token (1회성 사용) */
  accessToken: string;
}

/**
 * Passport Google OAuth 2.0 전략 구현
 *
 * @description
 * - Google OAuth 2.0 인증 플로우를 처리합니다
 * - 인증 완료 후 GoogleProfile 형태로 사용자 정보를 반환합니다
 * - scope: email, profile 정보를 요청합니다
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger: LoggerService;

  constructor(
    configService: ConfigService,
    logger: LoggerService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
    this.logger = logger;
    this.logger.setContext('GoogleStrategy');
  }

  /**
   * Google OAuth 인증 완료 후 프로필 데이터를 검증하고 변환합니다
   *
   * @param accessToken - Google OAuth Access Token
   * @param _refreshToken - Google OAuth Refresh Token (사용하지 않음)
   * @param profile - Google에서 전달된 사용자 프로필
   * @param done - Passport 콜백 함수
   */
  validate(
    accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const emails = profile.emails;
    const photos = profile.photos;

    if (!emails || emails.length === 0) {
      this.logger.warn('Google OAuth 프로필에 이메일 정보가 없습니다', {
        googleId: profile.id,
      });
      done(new Error('Google profile does not contain email'), undefined);
      return;
    }

    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email: emails[0].value,
      name: profile.displayName || emails[0].value.split('@')[0],
      picture: photos && photos.length > 0 ? photos[0].value : undefined,
      emailVerified: emails[0].verified === true || (emails[0] as Record<string, unknown>).verified === 'true',
      accessToken,
    };

    this.logger.info('Google OAuth 프로필 검증 완료', {
      googleId: googleProfile.googleId,
      email: googleProfile.email,
    });

    done(null, googleProfile);
  }
}
