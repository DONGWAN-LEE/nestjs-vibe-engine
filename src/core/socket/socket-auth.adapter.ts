/**
 * Socket.io 인증 어댑터
 *
 * WebSocket 핸드셰이크 시 JWT 토큰을 검증하여
 * 인증된 사용자만 연결을 허용합니다.
 * Bearer 접두사 및 원시 토큰 형식을 모두 지원합니다.
 *
 * @module SocketAuthAdapter
 */

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { LoggerService } from '../logger/logger.service';

/**
 * JWT 페이로드 인터페이스
 */
interface JwtPayload {
  /** 사용자 고유 식별자 */
  sub: string;
  /** 세션 고유 식별자 */
  sessionId: string;
  /** 토큰 만료 시간 */
  exp?: number;
  /** 토큰 발급 시간 */
  iat?: number;
}

/**
 * 소켓 인증 에러 코드
 */
const AUTH_ERROR_CODES = {
  TOKEN_NOT_PROVIDED: 'AUTH_003',
  INVALID_TOKEN: 'AUTH_001',
  SESSION_INVALID: 'AUTH_005',
  SERVER_ERROR: 'SRV_001',
} as const;

@Injectable()
export class SocketAuthAdapter {
  constructor(
    private readonly jwtService: JwtService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('SocketAuthAdapter');
  }

  /**
   * 소켓 핸드셰이크 시 JWT 토큰을 검증합니다
   *
   * @description
   * 1. handshake.auth.token에서 토큰 추출
   * 2. "Bearer xxx" 형식과 원시 토큰 형식 모두 지원
   * 3. JWT 검증 후 socket.data에 사용자 정보 설정
   * 4. 실패 시 적절한 에러 코드와 함께 에러 이벤트 전송
   *
   * @param socket - 연결을 시도하는 소켓 인스턴스
   * @returns 인증 성공 여부
   */
  async authenticate(socket: Socket): Promise<boolean> {
    try {
      const rawToken = socket.handshake?.auth?.token as string | undefined;

      if (!rawToken) {
        this.emitAuthError(socket, AUTH_ERROR_CODES.TOKEN_NOT_PROVIDED, 'Token not provided');
        return false;
      }

      const token = this.extractToken(rawToken);

      let payload: JwtPayload;
      try {
        payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      } catch {
        this.logger.warn('Socket authentication failed: invalid or expired token', {
          socketId: socket.id,
        });
        this.emitAuthError(socket, AUTH_ERROR_CODES.INVALID_TOKEN, 'Invalid or expired token');
        return false;
      }

      if (!payload.sub) {
        this.emitAuthError(socket, AUTH_ERROR_CODES.INVALID_TOKEN, 'Invalid token payload');
        return false;
      }

      if (!payload.sessionId) {
        this.emitAuthError(socket, AUTH_ERROR_CODES.SESSION_INVALID, 'Session invalid');
        return false;
      }

      socket.data.userId = payload.sub;
      socket.data.sessionId = payload.sessionId;

      this.logger.info('Socket authenticated successfully', {
        socketId: socket.id,
        userId: payload.sub,
      });

      return true;
    } catch (error) {
      this.logger.error('Unexpected error during socket authentication', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.emitAuthError(socket, AUTH_ERROR_CODES.SERVER_ERROR, 'Internal server error');
      return false;
    }
  }

  /**
   * 토큰 문자열에서 순수 JWT 토큰을 추출합니다
   *
   * @description "Bearer xxx" 형식이면 "Bearer " 접두사를 제거하고,
   * 그렇지 않으면 원시 토큰을 그대로 반환합니다.
   *
   * @param rawToken - 원본 토큰 문자열
   * @returns 추출된 JWT 토큰
   */
  private extractToken(rawToken: string): string {
    const trimmed = rawToken.trim();
    if (trimmed.startsWith('Bearer ')) {
      return trimmed.slice(7);
    }
    return trimmed;
  }

  /**
   * 인증 실패 시 소켓에 에러 이벤트를 전송합니다
   *
   * @param socket - 대상 소켓 인스턴스
   * @param code - 에러 코드 (AUTH_003, AUTH_001, AUTH_005, SRV_001)
   * @param message - 사용자에게 전달할 에러 메시지
   */
  private emitAuthError(socket: Socket, code: string, message: string): void {
    socket.emit('error', {
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
