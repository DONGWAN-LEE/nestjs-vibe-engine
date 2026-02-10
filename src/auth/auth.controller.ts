/**
 * 인증 컨트롤러
 *
 * Google OAuth 로그인, 토큰 갱신, 로그아웃 엔드포인트를 제공합니다.
 * 모든 응답은 표준 DTO 구조를 따르며,
 * Swagger 문서화를 포함합니다.
 *
 * @module auth
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RefreshTokenDto, LogoutDto } from './dto/login.dto';
import {
  AuthResponseDto,
  TokenRefreshResponseDto,
  LogoutResponseDto,
} from './dto/auth-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenValidationGuard } from './guards/token-validation.guard';
import { GoogleProfile } from './strategies/google.strategy';
import { LoggerService } from '../core/logger/logger.service';

/**
 * Express Request에 Passport 유저 정보를 확장하는 인터페이스
 */
interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    sessionId: string;
    [key: string]: unknown;
  };
}

/**
 * 인증 API 컨트롤러
 *
 * @description
 * 엔드포인트:
 * - GET /auth/google: Google OAuth 로그인 페이지로 리다이렉트
 * - GET /auth/google/callback: Google OAuth 콜백 처리, JWT 토큰 발급
 * - POST /auth/refresh: Refresh Token으로 토큰 페어 갱신
 * - POST /auth/logout: 단일 또는 전체 세션 로그아웃
 */
@Controller('auth')
export class AuthController {
  private readonly logger: LoggerService;

  constructor(
    private readonly authService: AuthService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('AuthController');
  }

  /**
   * Google OAuth 로그인을 시작합니다
   *
   * @description
   * Google OAuth 2.0 인증 페이지로 리다이렉트합니다.
   * Passport의 GoogleStrategy가 리다이렉트를 자동 처리합니다.
   */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // Passport가 Google OAuth 페이지로 자동 리다이렉트
  }

  /**
   * Google OAuth 콜백을 처리합니다
   *
   * @description
   * Google 인증 완료 후 호출되는 콜백 엔드포인트입니다.
   * GoogleStrategy의 validate 메서드에서 검증된 프로필 데이터를
   * AuthService에 전달하여 유저 생성/조회 및 JWT 발급을 수행합니다.
   *
   * @param req - Google OAuth 프로필이 포함된 요청 객체
   * @param res - 응답 객체
   * @returns 유저 정보와 JWT 토큰 페어를 포함하는 AuthResponseDto
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const profile = req.user as GoogleProfile;

    this.logger.info('Google OAuth 콜백 수신', {
      googleId: profile.googleId,
      email: profile.email,
    });

    const result: AuthResponseDto = await this.authService.handleGoogleLogin(profile);

    res.status(HttpStatus.OK).json(result);
  }

  /**
   * Refresh Token을 사용하여 토큰 페어를 갱신합니다
   *
   * @description
   * 만료된 Access Token을 대체하기 위해 유효한 Refresh Token으로
   * 새 토큰 페어를 발급합니다. 기존 Refresh Token은 무효화됩니다.
   * (Refresh Token Rotation)
   *
   * @param dto - Refresh Token을 포함하는 요청 바디
   * @returns 새로 발급된 토큰 페어를 포함하는 TokenRefreshResponseDto
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
  ): Promise<TokenRefreshResponseDto> {
    this.logger.info('토큰 갱신 요청 수신');

    return this.authService.refreshTokens(dto.refreshToken);
  }

  /**
   * 로그아웃을 처리합니다
   *
   * @description
   * 현재 세션 또는 해당 유저의 전체 세션을 무효화합니다.
   * Authorization 헤더의 Bearer 토큰으로 인증된 유저만 접근 가능합니다.
   * allDevices=true 시 모든 디바이스에서 로그아웃됩니다.
   *
   * @param req - JWT 인증된 요청 객체
   * @param dto - 전체 디바이스 로그아웃 여부를 포함하는 요청 바디
   * @returns 로그아웃 처리 결과를 포함하는 LogoutResponseDto
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TokenValidationGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: LogoutDto,
  ): Promise<LogoutResponseDto> {
    const { userId, sessionId } = req.user;

    this.logger.info('로그아웃 요청 수신', {
      userId,
      sessionId,
      allDevices: dto.allDevices || false,
    });

    return this.authService.logout(userId, sessionId, dto.allDevices || false);
  }
}
