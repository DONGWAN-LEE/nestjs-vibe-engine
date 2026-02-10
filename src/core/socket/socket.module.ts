/**
 * Socket.io 모듈
 *
 * WebSocket 실시간 통신 기능을 제공하는 모듈입니다.
 * JWT 기반 핸드셰이크 인증, 룸 관리, 메시지 브로드캐스트를 포함합니다.
 *
 * @module SocketModule
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SocketGateway } from './socket.gateway';
import { SocketAuthAdapter } from './socket-auth.adapter';
import { RoomManagerService } from './room-manager.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [SocketGateway, SocketAuthAdapter, RoomManagerService],
  exports: [SocketGateway, RoomManagerService],
})
export class SocketModule {}
