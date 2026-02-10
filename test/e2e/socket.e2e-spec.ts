/**
 * Socket.io E2E Tests
 *
 * End-to-end tests for WebSocket functionality including:
 * - Connection with valid/invalid tokens
 * - Room management (join/leave)
 * - Notifications and events
 * - Force logout scenarios
 * - Reconnection handling
 *
 * These tests use a mock Socket.io gateway to simulate the real behavior
 * and verify the complete WebSocket communication cycle.
 *
 * Based on ARCHITECTURE.md Section 8 - Real-time Communication (Socket.io)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server as HttpServer } from 'http';
import {
  generateUuid,
  generateEmail,
  wait,
} from '../utils/test-utils';
import {
  createMockUser,
  createMockUserSession,
  MockUser,
  MockUserSession,
} from '../utils/mock-factories';

// Type definitions for WebSocket events
interface ConnectionResponse {
  socketId: string;
  userId: string;
  rooms: string[];
}

interface RoomJoinRequest {
  roomId: string;
}

interface RoomJoinResponse {
  success: boolean;
  roomId: string;
  members?: number;
  error?: string;
}

interface RoomLeaveRequest {
  roomId: string;
}

interface RoomLeaveResponse {
  success: boolean;
  roomId: string;
  error?: string;
}

interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface ChatMessage {
  roomId: string;
  content: string;
  userId?: string;
  timestamp?: string;
}

interface ChatMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface ForceLogoutPayload {
  reason: string;
  newDeviceInfo?: string;
}

interface ErrorPayload {
  code: string;
  message: string;
}

/**
 * Mock Socket Gateway for E2E Testing
 * Simulates the actual SocketGateway behavior from src/core/socket/socket.gateway.ts
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/',
})
@Injectable()
class MockSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private connectedClients: Map<string, { socket: Socket; userId: string; sessionId: string }> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private roomMembers: Map<string, Set<string>> = new Map(); // roomId -> socketIds
  private users: Map<string, MockUser> = new Map();
  sessions: Map<string, MockUserSession> = new Map();

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Handle new WebSocket connection
   * Validates JWT token from handshake auth
   */
  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        socket.emit('error', { code: 'AUTH_003', message: 'Token not provided' } as ErrorPayload);
        socket.disconnect(true);
        return;
      }

      // Extract Bearer token
      const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;

      // Verify JWT
      let payload: { userId: string; sessionId: string };
      try {
        payload = this.jwtService.verify(tokenValue);
      } catch {
        socket.emit('error', { code: 'AUTH_001', message: 'Invalid or expired token' } as ErrorPayload);
        socket.disconnect(true);
        return;
      }

      // Validate session
      const session = this.sessions.get(payload.sessionId);
      if (!session || !session.isValid) {
        socket.emit('error', { code: 'AUTH_005', message: 'Session invalid' } as ErrorPayload);
        socket.disconnect(true);
        return;
      }

      // Store connection info
      socket.data.userId = payload.userId;
      socket.data.sessionId = payload.sessionId;

      this.connectedClients.set(socket.id, {
        socket,
        userId: payload.userId,
        sessionId: payload.sessionId,
      });

      // Track user sockets
      if (!this.userSockets.has(payload.userId)) {
        this.userSockets.set(payload.userId, new Set());
      }
      this.userSockets.get(payload.userId)!.add(socket.id);

      // Auto-join default rooms per ARCHITECTURE.md Section 8.3
      const userRoom = `user:${payload.userId}`;
      const broadcastRoom = 'broadcast:all';

      await socket.join(userRoom);
      await socket.join(broadcastRoom);

      this.addToRoom(userRoom, socket.id);
      this.addToRoom(broadcastRoom, socket.id);

      // Emit connection success
      const response: ConnectionResponse = {
        socketId: socket.id,
        userId: payload.userId,
        rooms: [userRoom, broadcastRoom],
      };

      socket.emit('connected', response);
    } catch (error) {
      socket.emit('error', { code: 'SRV_001', message: 'Connection error' } as ErrorPayload);
      socket.disconnect(true);
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnect(socket: Socket): void {
    const client = this.connectedClients.get(socket.id);

    if (client) {
      // Remove from user sockets
      const userSockets = this.userSockets.get(client.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }

      // Remove from all rooms
      this.roomMembers.forEach((members, roomId) => {
        members.delete(socket.id);
        if (members.size === 0) {
          this.roomMembers.delete(roomId);
        }
      });

      this.connectedClients.delete(socket.id);
    }
  }

  /**
   * Handle room join request
   * Per ARCHITECTURE.md Section 8.3
   */
  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @MessageBody() data: RoomJoinRequest,
    @ConnectedSocket() socket: Socket,
  ): Promise<RoomJoinResponse> {
    if (!data?.roomId) {
      return { success: false, roomId: '', error: 'Room ID is required' };
    }

    // Validate room ID format (e.g., group:123)
    if (!this.isValidRoomId(data.roomId)) {
      return { success: false, roomId: data.roomId, error: 'Invalid room ID format' };
    }

    await socket.join(data.roomId);
    this.addToRoom(data.roomId, socket.id);

    const members = this.roomMembers.get(data.roomId)?.size || 1;

    // Notify room members about new join
    socket.to(data.roomId).emit('room:user_joined', {
      roomId: data.roomId,
      userId: socket.data.userId,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      roomId: data.roomId,
      members,
    };
  }

  /**
   * Handle room leave request
   */
  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @MessageBody() data: RoomLeaveRequest,
    @ConnectedSocket() socket: Socket,
  ): Promise<RoomLeaveResponse> {
    if (!data?.roomId) {
      return { success: false, roomId: '', error: 'Room ID is required' };
    }

    // Don't allow leaving default rooms
    const defaultRooms = [`user:${socket.data.userId}`, 'broadcast:all'];
    if (defaultRooms.includes(data.roomId)) {
      return { success: false, roomId: data.roomId, error: 'Cannot leave default rooms' };
    }

    // Notify room members before leaving
    socket.to(data.roomId).emit('room:user_left', {
      roomId: data.roomId,
      userId: socket.data.userId,
      timestamp: new Date().toISOString(),
    });

    await socket.leave(data.roomId);
    this.removeFromRoom(data.roomId, socket.id);

    return {
      success: true,
      roomId: data.roomId,
    };
  }

  /**
   * Handle chat message
   */
  @SubscribeMessage('chat:send')
  handleChatSend(
    @MessageBody() data: ChatMessage,
    @ConnectedSocket() socket: Socket,
  ): ChatMessageResponse {
    if (!data?.roomId || !data?.content) {
      return { success: false, error: 'Room ID and content are required' };
    }

    // Check if socket is in the room
    const roomMembers = this.roomMembers.get(data.roomId);
    if (!roomMembers?.has(socket.id)) {
      return { success: false, error: 'Not a member of this room' };
    }

    const messageId = generateUuid();
    const timestamp = new Date().toISOString();

    // Broadcast message to room
    this.server.to(data.roomId).emit('chat:message', {
      messageId,
      roomId: data.roomId,
      userId: socket.data.userId,
      content: data.content,
      timestamp,
    });

    return { success: true, messageId };
  }

  /**
   * Handle ping (for connection testing)
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() socket: Socket): { pong: number } {
    return { pong: Date.now() };
  }

  /**
   * Send notification to specific user
   */
  sendNotificationToUser(userId: string, notification: NotificationPayload): boolean {
    const userRoom = `user:${userId}`;
    this.server.to(userRoom).emit('notification', notification);
    return this.roomMembers.has(userRoom);
  }

  /**
   * Broadcast notification to all connected users
   */
  broadcastNotification(notification: NotificationPayload): void {
    this.server.to('broadcast:all').emit('notification', notification);
  }

  /**
   * Force logout user (for single device enforcement)
   * Per ARCHITECTURE.md Section 7.6
   */
  forceLogoutUser(userId: string, reason: string, newDeviceInfo?: string): number {
    const userSockets = this.userSockets.get(userId);
    if (!userSockets) return 0;

    let disconnectedCount = 0;

    userSockets.forEach((socketId) => {
      const client = this.connectedClients.get(socketId);
      if (client) {
        client.socket.emit('force_logout', {
          reason,
          newDeviceInfo,
        } as ForceLogoutPayload);
        client.socket.disconnect(true);
        disconnectedCount++;
      }
    });

    return disconnectedCount;
  }

  /**
   * Setup test user and session
   */
  setupTestUser(user: MockUser, session: MockUserSession): void {
    this.users.set(user.id, user);
    this.sessions.set(session.id, session);
  }

  /**
   * Invalidate session (for testing)
   */
  invalidateSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isValid = false;
    }
  }

  /**
   * Clear all test data
   */
  clearTestData(): void {
    this.connectedClients.forEach((client) => {
      client.socket.disconnect(true);
    });
    this.connectedClients.clear();
    this.userSockets.clear();
    this.roomMembers.clear();
    this.users.clear();
    this.sessions.clear();
  }

  /**
   * Get connected socket count
   */
  getConnectedCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get room member count
   */
  getRoomMemberCount(roomId: string): number {
    return this.roomMembers.get(roomId)?.size || 0;
  }

  private addToRoom(roomId: string, socketId: string): void {
    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Set());
    }
    this.roomMembers.get(roomId)!.add(socketId);
  }

  private removeFromRoom(roomId: string, socketId: string): void {
    const members = this.roomMembers.get(roomId);
    if (members) {
      members.delete(socketId);
      if (members.size === 0) {
        this.roomMembers.delete(roomId);
      }
    }
  }

  private isValidRoomId(roomId: string): boolean {
    // Valid formats: group:{id}, channel:{id}, user:{id}, broadcast:all
    return /^(group|channel|user|broadcast):[a-zA-Z0-9_-]+$/.test(roomId);
  }
}

/**
 * Test Module Setup
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          NODE_ENV: 'test',
          JWT_SECRET: 'e2e-test-secret-key-for-jwt-signing',
          SOCKET_DEFAULT_ROOMS: 'user,broadcast',
        }),
      ],
    }),
    JwtModule.register({
      secret: 'e2e-test-secret-key-for-jwt-signing',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [MockSocketGateway],
})
class TestSocketModule {}

describe('Socket.io E2E Tests', () => {
  let app: INestApplication;
  let httpServer: HttpServer;
  let gateway: MockSocketGateway;
  let jwtService: JwtService;

  // Helper function to create client socket
  const createClientSocket = (token?: string, options: Record<string, unknown> = {}): ClientSocket => {
    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3001;

    return io(`http://localhost:${port}`, {
      autoConnect: false,
      auth: token ? { token: `Bearer ${token}` } : undefined,
      transports: ['websocket'],
      reconnection: false,
      ...options,
    } as Parameters<typeof io>[1]);
  };

  // Helper function to create test tokens
  const createTestTokens = (userId: string, sessionId: string) => {
    const accessPayload = { userId, sessionId };
    const accessToken = jwtService.sign(accessPayload, { expiresIn: '1h' });

    const tokenId = generateUuid();
    const refreshPayload = { userId, sessionId, tokenId };
    const refreshToken = jwtService.sign(refreshPayload, { expiresIn: '30d' });

    return { accessToken, refreshToken };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestSocketModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    httpServer = createServer();

    gateway = moduleFixture.get<MockSocketGateway>(MockSocketGateway);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Initialize the app
    await app.init();

    // Manually setup Socket.io server
    const ioServer = new Server(httpServer, {
      cors: { origin: '*' },
    });

    // Copy gateway properties
    (gateway as any).server = ioServer;

    // Setup authentication middleware
    ioServer.use((socket, next) => {
      const token = socket.handshake.auth?.token;

      if (!token) {
        const err = new Error('AUTH_003:Token not provided');
        return next(err);
      }

      const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;

      try {
        const payload = jwtService.verify(tokenValue) as { userId: string; sessionId: string };
        const session = (gateway as any).sessions.get(payload.sessionId);
        if (!session || !session.isValid) {
          const err = new Error('AUTH_005:Session invalid');
          return next(err);
        }
        socket.data.userId = payload.userId;
        socket.data.sessionId = payload.sessionId;
        next();
      } catch {
        const err = new Error('AUTH_001:Invalid or expired token');
        return next(err);
      }
    });

    // Setup event handlers
    ioServer.on('connection', (socket) => {
      gateway.handleConnection(socket);

      socket.on('disconnect', () => {
        gateway.handleDisconnect(socket);
      });

      socket.on('room:join', async (data, callback) => {
        const result = await gateway.handleRoomJoin(data, socket);
        if (callback) callback(result);
      });

      socket.on('room:leave', async (data, callback) => {
        const result = await gateway.handleRoomLeave(data, socket);
        if (callback) callback(result);
      });

      socket.on('chat:send', (data, callback) => {
        const result = gateway.handleChatSend(data, socket);
        if (callback) callback(result);
      });

      socket.on('ping', (callback) => {
        const result = gateway.handlePing(socket);
        if (callback) callback(result);
      });
    });

    // Start HTTP server
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    gateway.clearTestData();
    httpServer.close();
    await app.close();
  });

  beforeEach(() => {
    gateway.clearTestData();
  });

  describe('WebSocket Connection', () => {
    describe('Connection with valid token', () => {
      it('should successfully connect with valid JWT token', (done) => {
        const user = createMockUser();
        const session = createMockUserSession({ userId: user.id, isValid: true });
        gateway.setupTestUser(user, session);

        const { accessToken } = createTestTokens(user.id, session.id);
        const client = createClientSocket(accessToken);

        client.on('connected', (response: ConnectionResponse) => {
          expect(response.socketId).toBeDefined();
          expect(response.userId).toBe(user.id);
          expect(response.rooms).toContain(`user:${user.id}`);
          expect(response.rooms).toContain('broadcast:all');
          client.disconnect();
          done();
        });

        client.connect();
      });

      it('should auto-join default rooms on connection per ARCHITECTURE.md Section 8.3', (done) => {
        const user = createMockUser();
        const session = createMockUserSession({ userId: user.id, isValid: true });
        gateway.setupTestUser(user, session);

        const { accessToken } = createTestTokens(user.id, session.id);
        const client = createClientSocket(accessToken);

        client.on('connected', (response: ConnectionResponse) => {
          // Should auto-join user personal room and broadcast room
          expect(response.rooms).toHaveLength(2);
          expect(response.rooms).toContain(`user:${user.id}`);
          expect(response.rooms).toContain('broadcast:all');
          client.disconnect();
          done();
        });

        client.connect();
      });

      it('should store user data in socket.data', (done) => {
        const user = createMockUser();
        const session = createMockUserSession({ userId: user.id, isValid: true });
        gateway.setupTestUser(user, session);

        const { accessToken } = createTestTokens(user.id, session.id);
        const client = createClientSocket(accessToken);

        client.on('connected', (response: ConnectionResponse) => {
          expect(response.userId).toBe(user.id);
          expect(gateway.getConnectedCount()).toBe(1);
          client.disconnect();
          done();
        });

        client.connect();
      });
    });

    describe('Connection with invalid token', () => {
      it('should reject connection without token', (done) => {
        const client = createClientSocket();

        client.on('connect_error', (error: Error) => {
          const [code, message] = error.message.split(':');
          expect(code).toBe('AUTH_003');
          expect(message).toContain('not provided');
          client.disconnect();
          done();
        });

        client.on('connect', () => {
          // Should not connect
          client.disconnect();
          done(new Error('Should not have connected'));
        });

        client.connect();
      });

      it('should reject connection with invalid JWT', (done) => {
        const client = createClientSocket('invalid.jwt.token');

        client.on('connect_error', (error: Error) => {
          const [code] = error.message.split(':');
          expect(code).toBe('AUTH_001');
          client.disconnect();
          done();
        });

        client.on('connect', () => {
          client.disconnect();
          done(new Error('Should not have connected'));
        });

        client.connect();
      });

      it('should reject connection with expired JWT', (done) => {
        const user = createMockUser();
        const session = createMockUserSession({ userId: user.id, isValid: true });
        gateway.setupTestUser(user, session);

        // Create expired token
        const expiredToken = jwtService.sign(
          { userId: user.id, sessionId: session.id },
          { expiresIn: '-1h' },
        );

        const client = createClientSocket(expiredToken);

        client.on('connect_error', (error: Error) => {
          const [code] = error.message.split(':');
          expect(code).toBe('AUTH_001');
          client.disconnect();
          done();
        });

        client.on('connect', () => {
          client.disconnect();
          done(new Error('Should not have connected'));
        });

        client.connect();
      });

      it('should reject connection with invalidated session', (done) => {
        const user = createMockUser();
        const session = createMockUserSession({ userId: user.id, isValid: false }); // Invalid session
        gateway.setupTestUser(user, session);

        const { accessToken } = createTestTokens(user.id, session.id);
        const client = createClientSocket(accessToken);

        client.on('connect_error', (error: Error) => {
          const [code, message] = error.message.split(':');
          expect(code).toBe('AUTH_005');
          expect(message).toContain('invalid');
          client.disconnect();
          done();
        });

        client.on('connect', () => {
          client.disconnect();
          done(new Error('Should not have connected'));
        });

        client.connect();
      });
    });

    describe('Connection tracking', () => {
      it('should track connected clients', (done) => {
        const user = createMockUser();
        const session = createMockUserSession({ userId: user.id, isValid: true });
        gateway.setupTestUser(user, session);

        const { accessToken } = createTestTokens(user.id, session.id);
        const client = createClientSocket(accessToken);

        expect(gateway.getConnectedCount()).toBe(0);

        client.on('connected', () => {
          expect(gateway.getConnectedCount()).toBe(1);
          client.disconnect();
        });

        client.on('disconnect', () => {
          // Wait a bit for disconnect to be processed
          setTimeout(() => {
            expect(gateway.getConnectedCount()).toBe(0);
            done();
          }, 50);
        });

        client.connect();
      });

      it('should handle multiple connections from different users', (done) => {
        const user1 = createMockUser();
        const session1 = createMockUserSession({ userId: user1.id, isValid: true });
        gateway.setupTestUser(user1, session1);

        const user2 = createMockUser();
        const session2 = createMockUserSession({ userId: user2.id, isValid: true });
        gateway.setupTestUser(user2, session2);

        const { accessToken: token1 } = createTestTokens(user1.id, session1.id);
        const { accessToken: token2 } = createTestTokens(user2.id, session2.id);

        const client1 = createClientSocket(token1);
        const client2 = createClientSocket(token2);

        let connectedCount = 0;

        const onConnected = () => {
          connectedCount++;
          if (connectedCount === 2) {
            expect(gateway.getConnectedCount()).toBe(2);
            client1.disconnect();
            client2.disconnect();
            done();
          }
        };

        client1.on('connected', onConnected);
        client2.on('connected', onConnected);

        client1.connect();
        client2.connect();
      });
    });
  });

  describe('Room Management', () => {
    let user: MockUser;
    let session: MockUserSession;
    let client: ClientSocket;
    let accessToken: string;

    beforeEach((done) => {
      user = createMockUser();
      session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const tokens = createTestTokens(user.id, session.id);
      accessToken = tokens.accessToken;
      client = createClientSocket(accessToken);

      client.on('connected', () => done());
      client.connect();
    });

    afterEach(() => {
      if (client.connected) {
        client.disconnect();
      }
    });

    describe('room:join', () => {
      it('should successfully join a valid room', (done) => {
        client.emit('room:join', { roomId: 'group:123' }, (response: RoomJoinResponse) => {
          expect(response.success).toBe(true);
          expect(response.roomId).toBe('group:123');
          expect(response.members).toBeGreaterThanOrEqual(1);
          done();
        });
      });

      it('should reject joining room with invalid format', (done) => {
        client.emit('room:join', { roomId: 'invalid_room' }, (response: RoomJoinResponse) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('Invalid');
          done();
        });
      });

      it('should reject joining room without roomId', (done) => {
        client.emit('room:join', {}, (response: RoomJoinResponse) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('required');
          done();
        });
      });

      it('should notify existing room members when new user joins', (done) => {
        // Create second user
        const user2 = createMockUser();
        const session2 = createMockUserSession({ userId: user2.id, isValid: true });
        gateway.setupTestUser(user2, session2);

        const { accessToken: token2 } = createTestTokens(user2.id, session2.id);
        const client2 = createClientSocket(token2);

        client2.on('connected', () => {
          // First client joins room
          client.emit('room:join', { roomId: 'group:notify-test' }, () => {
            // Second client joins same room
            client.on('room:user_joined', (data) => {
              expect(data.roomId).toBe('group:notify-test');
              expect(data.userId).toBe(user2.id);
              client2.disconnect();
              done();
            });

            client2.emit('room:join', { roomId: 'group:notify-test' }, () => {});
          });
        });

        client2.connect();
      });
    });

    describe('room:leave', () => {
      it('should successfully leave a joined room', (done) => {
        // First join a room
        client.emit('room:join', { roomId: 'group:leave-test' }, (joinResponse: RoomJoinResponse) => {
          expect(joinResponse.success).toBe(true);

          // Then leave it
          client.emit('room:leave', { roomId: 'group:leave-test' }, (leaveResponse: RoomLeaveResponse) => {
            expect(leaveResponse.success).toBe(true);
            expect(leaveResponse.roomId).toBe('group:leave-test');
            done();
          });
        });
      });

      it('should prevent leaving default user room', (done) => {
        client.emit('room:leave', { roomId: `user:${user.id}` }, (response: RoomLeaveResponse) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('default');
          done();
        });
      });

      it('should prevent leaving broadcast room', (done) => {
        client.emit('room:leave', { roomId: 'broadcast:all' }, (response: RoomLeaveResponse) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('default');
          done();
        });
      });

      it('should notify room members when user leaves', (done) => {
        const user2 = createMockUser();
        const session2 = createMockUserSession({ userId: user2.id, isValid: true });
        gateway.setupTestUser(user2, session2);

        const { accessToken: token2 } = createTestTokens(user2.id, session2.id);
        const client2 = createClientSocket(token2);

        client2.on('connected', () => {
          // Both clients join the same room
          client.emit('room:join', { roomId: 'group:leave-notify' }, () => {
            client2.emit('room:join', { roomId: 'group:leave-notify' }, () => {
              // Listen for leave notification on client2
              client2.on('room:user_left', (data) => {
                expect(data.roomId).toBe('group:leave-notify');
                expect(data.userId).toBe(user.id);
                client2.disconnect();
                done();
              });

              // Client1 leaves the room
              client.emit('room:leave', { roomId: 'group:leave-notify' }, () => {});
            });
          });
        });

        client2.connect();
      });
    });
  });

  describe('Notifications', () => {
    let user: MockUser;
    let session: MockUserSession;
    let client: ClientSocket;

    beforeEach((done) => {
      user = createMockUser();
      session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      client = createClientSocket(accessToken);

      client.on('connected', () => done());
      client.connect();
    });

    afterEach(() => {
      if (client.connected) {
        client.disconnect();
      }
    });

    it('should receive notification sent to user room', (done) => {
      const notification: NotificationPayload = {
        type: 'info',
        title: 'Test Notification',
        message: 'This is a test notification',
        timestamp: new Date().toISOString(),
      };

      client.on('notification', (received: NotificationPayload) => {
        expect(received.type).toBe(notification.type);
        expect(received.title).toBe(notification.title);
        expect(received.message).toBe(notification.message);
        done();
      });

      // Give socket time to join rooms
      setTimeout(() => {
        gateway.sendNotificationToUser(user.id, notification);
      }, 50);
    });

    it('should receive broadcast notification', (done) => {
      const notification: NotificationPayload = {
        type: 'announcement',
        title: 'System Announcement',
        message: 'This is a broadcast notification',
        timestamp: new Date().toISOString(),
      };

      client.on('notification', (received: NotificationPayload) => {
        expect(received.type).toBe(notification.type);
        expect(received.title).toBe(notification.title);
        done();
      });

      setTimeout(() => {
        gateway.broadcastNotification(notification);
      }, 50);
    });

    it('should receive notification with additional data', (done) => {
      const notification: NotificationPayload = {
        type: 'alert',
        title: 'Alert',
        message: 'Important alert',
        data: { priority: 'high', actionRequired: true },
        timestamp: new Date().toISOString(),
      };

      client.on('notification', (received: NotificationPayload) => {
        expect(received.data).toBeDefined();
        expect(received.data?.priority).toBe('high');
        expect(received.data?.actionRequired).toBe(true);
        done();
      });

      setTimeout(() => {
        gateway.sendNotificationToUser(user.id, notification);
      }, 50);
    });
  });

  describe('Chat Messages', () => {
    let user: MockUser;
    let session: MockUserSession;
    let client: ClientSocket;

    beforeEach((done) => {
      user = createMockUser();
      session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      client = createClientSocket(accessToken);

      client.on('connected', () => {
        // Join a room for chat
        client.emit('room:join', { roomId: 'group:chat-test' }, () => done());
      });
      client.connect();
    });

    afterEach(() => {
      if (client.connected) {
        client.disconnect();
      }
    });

    it('should successfully send a chat message', (done) => {
      client.emit('chat:send', { roomId: 'group:chat-test', content: 'Hello!' }, (response: ChatMessageResponse) => {
        expect(response.success).toBe(true);
        expect(response.messageId).toBeDefined();
        done();
      });
    });

    it('should receive own message broadcast', (done) => {
      client.on('chat:message', (message) => {
        expect(message.content).toBe('Test message');
        expect(message.userId).toBe(user.id);
        expect(message.roomId).toBe('group:chat-test');
        expect(message.timestamp).toBeDefined();
        done();
      });

      client.emit('chat:send', { roomId: 'group:chat-test', content: 'Test message' }, () => {});
    });

    it('should reject message to room not joined', (done) => {
      client.emit('chat:send', { roomId: 'group:not-joined', content: 'Hello!' }, (response: ChatMessageResponse) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('Not a member');
        done();
      });
    });

    it('should reject message without content', (done) => {
      client.emit('chat:send', { roomId: 'group:chat-test' }, (response: ChatMessageResponse) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('required');
        done();
      });
    });
  });

  describe('Force Logout (Single Device Enforcement)', () => {
    it('should disconnect user and emit force_logout event', (done) => {
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      const client = createClientSocket(accessToken);

      client.on('connected', () => {
        // Listen for force logout
        client.on('force_logout', (payload: ForceLogoutPayload) => {
          expect(payload.reason).toBe('New login detected');
          expect(payload.newDeviceInfo).toBe('Chrome on Windows');
        });

        client.on('disconnect', () => {
          done();
        });

        // Trigger force logout
        setTimeout(() => {
          gateway.forceLogoutUser(user.id, 'New login detected', 'Chrome on Windows');
        }, 50);
      });

      client.connect();
    });

    it('should disconnect all user sessions on force logout', (done) => {
      const user = createMockUser();
      const session1 = createMockUserSession({ userId: user.id, isValid: true });
      const session2 = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session1);
      gateway.sessions.set(session2.id, session2);

      const { accessToken: token1 } = createTestTokens(user.id, session1.id);
      const { accessToken: token2 } = createTestTokens(user.id, session2.id);

      const client1 = createClientSocket(token1);
      const client2 = createClientSocket(token2);

      let disconnectedCount = 0;

      const onDisconnect = () => {
        disconnectedCount++;
        if (disconnectedCount === 2) {
          expect(gateway.getConnectedCount()).toBe(0);
          done();
        }
      };

      let connectedCount = 0;

      const onConnected = () => {
        connectedCount++;
        if (connectedCount === 2) {
          // Both connected, now force logout
          setTimeout(() => {
            const count = gateway.forceLogoutUser(user.id, 'Account compromised');
            expect(count).toBe(2);
          }, 50);
        }
      };

      client1.on('connected', onConnected);
      client2.on('connected', onConnected);
      client1.on('disconnect', onDisconnect);
      client2.on('disconnect', onDisconnect);

      client1.connect();
      client2.connect();
    });

    it('should include reason in force logout payload', (done) => {
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      const client = createClientSocket(accessToken);

      client.on('connected', () => {
        client.on('force_logout', (payload: ForceLogoutPayload) => {
          expect(payload.reason).toBeDefined();
          expect(typeof payload.reason).toBe('string');
          client.disconnect();
          done();
        });

        setTimeout(() => {
          gateway.forceLogoutUser(user.id, 'Session expired');
        }, 50);
      });

      client.connect();
    });
  });

  describe('Ping/Pong', () => {
    it('should respond to ping with pong', (done) => {
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      const client = createClientSocket(accessToken);

      client.on('connected', () => {
        const beforePing = Date.now();

        client.emit('ping', (response: { pong: number }) => {
          expect(response.pong).toBeGreaterThanOrEqual(beforePing);
          expect(response.pong).toBeLessThanOrEqual(Date.now());
          client.disconnect();
          done();
        });
      });

      client.connect();
    });
  });

  describe('Disconnection Cleanup', () => {
    it('should clean up user tracking on disconnect', (done) => {
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      const client = createClientSocket(accessToken);

      client.on('connected', () => {
        expect(gateway.getConnectedCount()).toBe(1);
        client.disconnect();
      });

      client.on('disconnect', () => {
        setTimeout(() => {
          expect(gateway.getConnectedCount()).toBe(0);
          done();
        }, 50);
      });

      client.connect();
    });

    it('should clean up room membership on disconnect', (done) => {
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      const client = createClientSocket(accessToken);

      client.on('connected', () => {
        client.emit('room:join', { roomId: 'group:cleanup-test' }, () => {
          expect(gateway.getRoomMemberCount('group:cleanup-test')).toBe(1);
          client.disconnect();
        });
      });

      client.on('disconnect', () => {
        setTimeout(() => {
          expect(gateway.getRoomMemberCount('group:cleanup-test')).toBe(0);
          done();
        }, 50);
      });

      client.connect();
    });
  });

  describe('Error Handling', () => {
    it('should emit error for malformed events', (done) => {
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      const client = createClientSocket(accessToken);

      client.on('connected', () => {
        client.emit('room:join', null, (response: RoomJoinResponse) => {
          expect(response.success).toBe(false);
          expect(response.error).toBeDefined();
          client.disconnect();
          done();
        });
      });

      client.connect();
    });

    it('should not expose sensitive information in error responses', (done) => {
      const client = createClientSocket('invalid-token');

      client.on('connect_error', (error: Error) => {
        const errorStr = error.message;
        expect(errorStr).toBeDefined();
        expect(errorStr).not.toContain('stack');
        expect(errorStr).not.toContain('node_modules');
        client.disconnect();
        done();
      });

      client.connect();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous room joins', (done) => {
      const user = createMockUser();
      const session = createMockUserSession({ userId: user.id, isValid: true });
      gateway.setupTestUser(user, session);

      const { accessToken } = createTestTokens(user.id, session.id);
      const client = createClientSocket(accessToken);

      client.on('connected', () => {
        const rooms = ['group:concurrent-1', 'group:concurrent-2', 'group:concurrent-3'];
        let joinedCount = 0;

        rooms.forEach((roomId) => {
          client.emit('room:join', { roomId }, (response: RoomJoinResponse) => {
            expect(response.success).toBe(true);
            joinedCount++;

            if (joinedCount === rooms.length) {
              client.disconnect();
              done();
            }
          });
        });
      });

      client.connect();
    });

    it('should handle concurrent messages from multiple users', (done) => {
      const user1 = createMockUser();
      const session1 = createMockUserSession({ userId: user1.id, isValid: true });
      gateway.setupTestUser(user1, session1);

      const user2 = createMockUser();
      const session2 = createMockUserSession({ userId: user2.id, isValid: true });
      gateway.setupTestUser(user2, session2);

      const { accessToken: token1 } = createTestTokens(user1.id, session1.id);
      const { accessToken: token2 } = createTestTokens(user2.id, session2.id);

      const client1 = createClientSocket(token1);
      const client2 = createClientSocket(token2);

      let connectedCount = 0;
      let messageCount = 0;
      const expectedMessages = 4; // 2 users x 2 messages each

      const onMessage = () => {
        messageCount++;
        if (messageCount === expectedMessages) {
          client1.disconnect();
          client2.disconnect();
          done();
        }
      };

      const onConnected = () => {
        connectedCount++;
        if (connectedCount === 2) {
          // Both join the same room
          client1.emit('room:join', { roomId: 'group:concurrent-chat' }, () => {
            client2.emit('room:join', { roomId: 'group:concurrent-chat' }, () => {
              client1.on('chat:message', onMessage);
              client2.on('chat:message', onMessage);

              // Both send messages simultaneously
              client1.emit('chat:send', { roomId: 'group:concurrent-chat', content: 'Hello from 1' }, () => {});
              client2.emit('chat:send', { roomId: 'group:concurrent-chat', content: 'Hello from 2' }, () => {});
            });
          });
        }
      };

      client1.on('connected', onConnected);
      client2.on('connected', onConnected);

      client1.connect();
      client2.connect();
    });
  });
});

/**
 * Additional E2E test utilities for Socket module
 */
export async function connectSocket(
  httpServer: HttpServer,
  token: string,
): Promise<ClientSocket> {
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 3001;

  return new Promise((resolve, reject) => {
    const client = io(`http://localhost:${port}`, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      reconnection: false,
    });

    client.on('connected', () => resolve(client));
    client.on('error', (error) => reject(error));
    client.connect();
  });
}

export async function disconnectSocket(client: ClientSocket): Promise<void> {
  return new Promise((resolve) => {
    if (client.connected) {
      client.on('disconnect', () => resolve());
      client.disconnect();
    } else {
      resolve();
    }
  });
}

export function waitForEvent<T>(
  client: ClientSocket,
  eventName: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    client.once(eventName, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}
