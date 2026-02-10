/**
 * WebSocket 인증 가드
 *
 * Socket.io 연결 시 handshake.auth.token에서 JWT를 추출하여 검증합니다.
 * 검증 성공 시 socket.data에 userId, sessionId를 설정합니다.
 *
 * @module common/guards
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { LoggerService } from '../../core/logger/logger.service';

/**
 * WebSocket JWT 인증 가드
 *
 * @description
 * - socket.handshake.auth.token에서 Bearer 토큰을 추출합니다
 * - JWT 서명 검증 및 만료 확인을 수행합니다
 * - 유효한 토큰의 경우 socket.data에 userId, sessionId를 주입합니다
 * - 유효하지 않은 토큰의 경우 WsException을 발생시킵니다
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger: LoggerService;

  constructor(
    private readonly jwtService: JwtService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('WsAuthGuard');
  }

  /**
   * WebSocket 연결의 JWT 토큰을 검증합니다
   *
   * @param context - NestJS 실행 컨텍스트 (WebSocket)
   * @returns 토큰이 유효하면 true
   * @throws WsException 토큰이 없거나 유효하지 않은 경우
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const authToken = client.handshake?.auth?.token;

    if (!authToken) {
      this.logger.warn('WebSocket 연결에 인증 토큰이 없습니다', {
        socketId: client.id,
      });
      throw new WsException('Authentication token is required');
    }

    const token = this.extractToken(authToken);

    if (!token) {
      this.logger.warn('WebSocket 인증 토큰 형식이 올바르지 않습니다', {
        socketId: client.id,
      });
      throw new WsException('Invalid token format');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      if (!payload.userId || !payload.sessionId) {
        this.logger.warn('JWT 페이로드에 필수 필드가 누락되었습니다', {
          socketId: client.id,
        });
        throw new WsException('Invalid token payload');
      }

      client.data.userId = payload.userId;
      client.data.sessionId = payload.sessionId;

      this.logger.debug('WebSocket JWT 검증 성공', {
        socketId: client.id,
        userId: payload.userId,
      });

      return true;
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }

      this.logger.warn('WebSocket JWT 검증 실패', {
        socketId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new WsException('Unauthorized');
    }
  }

  /**
   * Bearer 접두사를 제거하고 순수 토큰 문자열을 추출합니다
   *
   * @param rawToken - "Bearer {token}" 또는 순수 토큰 문자열
   * @returns 추출된 토큰 문자열, 유효하지 않으면 null
   */
  private extractToken(rawToken: string): string | null {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const parts = rawToken.split(' ');

    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }

    if (parts.length === 1) {
      return parts[0];
    }

    return null;
  }
}
