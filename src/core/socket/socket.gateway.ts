/**
 * WebSocket 게이트웨이
 *
 * Socket.io 기반 실시간 통신 게이트웨이입니다.
 * JWT 인증, 룸 관리, 채팅 메시지 브로드캐스트,
 * 알림 전송, 강제 로그아웃 기능을 제공합니다.
 *
 * @module SocketGateway
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as crypto from 'crypto';
import { SocketAuthAdapter } from './socket-auth.adapter';
import { RoomManagerService } from './room-manager.service';
import { LoggerService } from '../logger/logger.service';

/**
 * 채팅 메시지 전송 요청 페이로드
 */
interface ChatSendPayload {
  /** 대상 룸 식별자 */
  roomId: string;
  /** 메시지 내용 */
  content: string;
}

/**
 * 알림 페이로드 인터페이스
 */
interface NotificationPayload {
  /** 알림 유형 */
  type: string;
  /** 알림 제목 */
  title: string;
  /** 알림 메시지 본문 */
  message: string;
  /** 추가 데이터 */
  data?: Record<string, unknown>;
}

/**
 * 강제 로그아웃 시 새 디바이스 정보
 */
interface DeviceInfo {
  /** 디바이스 유형 */
  deviceType?: string;
  /** 브라우저 정보 */
  browser?: string;
  /** IP 주소 */
  ip?: string;
}

/**
 * 연결된 클라이언트 추적 정보
 */
interface ConnectedClient {
  /** 소켓 ID */
  socketId: string;
  /** 사용자 ID */
  userId: string;
  /** 세션 ID */
  sessionId: string;
  /** 연결 시각 (ISO 문자열) */
  connectedAt: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
@Injectable()
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  /** 연결된 클라이언트 맵 (socketId -> ConnectedClient) */
  private readonly connectedClients: Map<string, ConnectedClient> = new Map();

  /** 사용자별 소켓 ID 맵 (userId -> Set<socketId>) */
  private readonly userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private readonly socketAuthAdapter: SocketAuthAdapter,
    private readonly roomManager: RoomManagerService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('SocketGateway');
  }

  /**
   * 클라이언트 연결 처리
   *
   * @description
   * 1. JWT 토큰으로 핸드셰이크 인증 수행
   * 2. 인증 실패 시 소켓 연결 해제
   * 3. 기본 룸(user:{userId}, broadcast:all) 자동 참가
   * 4. 연결된 클라이언트 정보 추적
   * 5. 'connected' 이벤트로 클라이언트에 연결 정보 전송
   *
   * @param socket - 연결된 소켓 인스턴스
   */
  async handleConnection(socket: Socket): Promise<void> {
    const authenticated = await this.socketAuthAdapter.authenticate(socket);

    if (!authenticated) {
      this.logger.warn('Socket connection rejected: authentication failed', {
        socketId: socket.id,
      });
      socket.disconnect(true);
      return;
    }

    const userId = socket.data.userId as string;
    const sessionId = socket.data.sessionId as string;

    const userRoom = `user:${userId}`;
    const broadcastRoom = 'broadcast:all';

    await socket.join(userRoom);
    await socket.join(broadcastRoom);

    this.roomManager.addToRoom(userRoom, socket.id);
    this.roomManager.addToRoom(broadcastRoom, socket.id);

    this.connectedClients.set(socket.id, {
      socketId: socket.id,
      userId,
      sessionId,
      connectedAt: new Date().toISOString(),
    });

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);

    const rooms = [userRoom, broadcastRoom];

    socket.emit('connected', {
      socketId: socket.id,
      userId,
      rooms,
    });

    this.logger.info('Socket connected', {
      socketId: socket.id,
      userId,
      rooms,
    });
  }

  /**
   * 클라이언트 연결 해제 처리
   *
   * @description
   * 1. 연결된 클라이언트 추적 정보 제거
   * 2. 사용자별 소켓 맵에서 제거
   * 3. 모든 룸에서 소켓 제거
   *
   * @param socket - 연결 해제된 소켓 인스턴스
   */
  handleDisconnect(socket: Socket): void {
    const clientInfo = this.connectedClients.get(socket.id);

    if (clientInfo) {
      const userSocketSet = this.userSockets.get(clientInfo.userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(clientInfo.userId);
        }
      }
    }

    this.connectedClients.delete(socket.id);
    this.roomManager.removeFromAllRooms(socket.id);

    this.logger.info('Socket disconnected', {
      socketId: socket.id,
      userId: clientInfo?.userId,
    });
  }

  /**
   * 룸 참가 요청을 처리합니다
   *
   * @description
   * 1. 룸 ID 형식 검증 (group|channel|user|broadcast):[a-zA-Z0-9_-]+
   * 2. Socket.io 룸 및 RoomManager에 참가
   * 3. 기존 룸 멤버에게 'room:user_joined' 이벤트 전송
   * 4. 참가 결과 반환 (성공 여부, 룸 ID, 멤버 수)
   *
   * @param data - 룸 참가 요청 데이터 (roomId 포함)
   * @param socket - 요청 소켓 인스턴스
   * @returns 참가 결과 객체
   */
  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ): Promise<{ success: boolean; roomId: string; members: number; error?: string }> {
    const { roomId } = data;
    const userId = socket.data.userId as string;

    if (!this.roomManager.isValidRoomId(roomId)) {
      this.logger.warn('Invalid room ID format', { roomId, socketId: socket.id });
      return {
        success: false,
        roomId,
        members: 0,
        error: 'Invalid room ID format. Expected: (group|channel|user|broadcast):[a-zA-Z0-9_-]+',
      };
    }

    await socket.join(roomId);
    this.roomManager.addToRoom(roomId, socket.id);

    const memberCount = this.roomManager.getRoomMemberCount(roomId);

    socket.to(roomId).emit('room:user_joined', {
      roomId,
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('User joined room', {
      roomId,
      userId,
      socketId: socket.id,
      memberCount,
    });

    return {
      success: true,
      roomId,
      members: memberCount,
    };
  }

  /**
   * 룸 퇴장 요청을 처리합니다
   *
   * @description
   * 1. 기본 룸(user:{userId}, broadcast:all) 퇴장 방지
   * 2. Socket.io 룸 및 RoomManager에서 제거
   * 3. 남은 룸 멤버에게 'room:user_left' 이벤트 전송
   * 4. 퇴장 결과 반환
   *
   * @param data - 룸 퇴장 요청 데이터 (roomId 포함)
   * @param socket - 요청 소켓 인스턴스
   * @returns 퇴장 결과 객체
   */
  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ): Promise<{ success: boolean; roomId: string; error?: string }> {
    const { roomId } = data;
    const userId = socket.data.userId as string;

    if (this.roomManager.isDefaultRoom(roomId, userId)) {
      this.logger.warn('Attempted to leave default room', {
        roomId,
        userId,
        socketId: socket.id,
      });
      return {
        success: false,
        roomId,
        error: 'Cannot leave default rooms (user room and broadcast)',
      };
    }

    await socket.leave(roomId);
    this.roomManager.removeFromRoom(roomId, socket.id);

    socket.to(roomId).emit('room:user_left', {
      roomId,
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('User left room', {
      roomId,
      userId,
      socketId: socket.id,
    });

    return {
      success: true,
      roomId,
    };
  }

  /**
   * 채팅 메시지 전송을 처리합니다
   *
   * @description
   * 1. 발신자의 룸 멤버십 검증
   * 2. 고유 메시지 ID 생성
   * 3. 룸 내 모든 멤버에게 'chat:message' 이벤트 브로드캐스트
   * 4. 전송 결과 반환 (성공 여부, 메시지 ID)
   *
   * @param data - 채팅 메시지 데이터 (roomId, content 포함)
   * @param socket - 요청 소켓 인스턴스
   * @returns 전송 결과 객체
   */
  @SubscribeMessage('chat:send')
  handleChatSend(
    @MessageBody() data: ChatSendPayload,
    @ConnectedSocket() socket: Socket,
  ): { success: boolean; messageId?: string; error?: string } {
    const { roomId, content } = data;
    const userId = socket.data.userId as string;

    if (!this.roomManager.isInRoom(roomId, socket.id)) {
      this.logger.warn('Chat send failed: not a room member', {
        roomId,
        userId,
        socketId: socket.id,
      });
      return {
        success: false,
        error: 'Not a member of this room',
      };
    }

    const messageId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    socket.to(roomId).emit('chat:message', {
      messageId,
      roomId,
      userId,
      content,
      timestamp,
    });

    this.logger.debug('Chat message sent', {
      messageId,
      roomId,
      userId,
    });

    return {
      success: true,
      messageId,
    };
  }

  /**
   * Ping 요청을 처리합니다
   *
   * @description 연결 상태 확인을 위한 heartbeat 응답을 반환합니다.
   *
   * @returns 현재 서버 타임스탬프가 포함된 pong 응답
   */
  @SubscribeMessage('ping')
  handlePing(): { pong: number } {
    return { pong: Date.now() };
  }

  /**
   * 특정 사용자에게 알림을 전송합니다
   *
   * @description user:{userId} 룸에 'notification' 이벤트를 전송하여
   * 해당 사용자의 모든 연결된 소켓에 알림을 전달합니다.
   *
   * @param userId - 대상 사용자 식별자
   * @param notification - 알림 페이로드
   */
  sendNotificationToUser(userId: string, notification: NotificationPayload): void {
    const userRoom = `user:${userId}`;

    this.server.to(userRoom).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('Notification sent to user', {
      userId,
      type: notification.type,
    });
  }

  /**
   * 모든 연결된 사용자에게 알림을 브로드캐스트합니다
   *
   * @description broadcast:all 룸에 'notification' 이벤트를 전송하여
   * 모든 연결된 클라이언트에 알림을 전달합니다.
   *
   * @param notification - 알림 페이로드
   */
  broadcastNotification(notification: NotificationPayload): void {
    this.server.to('broadcast:all').emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('Broadcast notification sent', {
      type: notification.type,
    });
  }

  /**
   * 특정 사용자를 강제 로그아웃합니다
   *
   * @description
   * 1. user:{userId} 룸에 'force_logout' 이벤트 전송
   * 2. 로그아웃 사유와 새 디바이스 정보 포함
   * 3. 이벤트 전송 후 해당 사용자의 모든 소켓 연결 해제
   *
   * @param userId - 강제 로그아웃 대상 사용자 식별자
   * @param reason - 로그아웃 사유
   * @param newDeviceInfo - 새 디바이스 정보 (선택)
   */
  forceLogoutUser(userId: string, reason: string, newDeviceInfo?: DeviceInfo): void {
    const userRoom = `user:${userId}`;

    this.server.to(userRoom).emit('force_logout', {
      reason,
      newDeviceInfo: newDeviceInfo ?? null,
      timestamp: new Date().toISOString(),
    });

    const userSocketIds = this.userSockets.get(userId);
    if (userSocketIds) {
      for (const socketId of userSocketIds) {
        const targetSocket = this.server.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.disconnect(true);
        }
      }
    }

    this.logger.info('User force logged out', {
      userId,
      reason,
      disconnectedSockets: userSocketIds?.size ?? 0,
    });
  }
}
