/**
 * 인증 모듈
 *
 * Google OAuth 2.0과 JWT 기반의 인증 시스템을 구성합니다.
 * Passport 전략, 가드, 서비스를 통합하여
 * 완전한 인증 플로우를 제공합니다.
 *
 * @module auth
 */

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenValidationGuard } from './guards/token-validation.guard';
import { LoggerService } from '../core/logger/logger.service';

/**
 * 인증 기능을 제공하는 NestJS 모듈
 *
 * @description
 * 구성 요소:
 * - PassportModule: JWT를 기본 전략으로 등록
 * - JwtModule: ConfigService에서 JWT 비밀키와 만료 시간을 주입
 * - GoogleStrategy: Google OAuth 2.0 인증 처리
 * - JwtStrategy: JWT 토큰 검증 및 페이로드 추출
 * - TokenValidationGuard: Redis 캐시 기반 세션 유효성 추가 검증
 * - AuthService: 인증 비즈니스 로직
 * - AuthController: 인증 API 엔드포인트
 *
 * @exports AuthService - 다른 모듈에서 인증 기능을 사용할 때
 * @exports JwtModule - 다른 모듈에서 JwtService를 주입받을 때
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.accessExpiresIn', '1h'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    JwtStrategy,
    TokenValidationGuard,
    LoggerService,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
