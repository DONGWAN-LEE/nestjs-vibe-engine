/**
 * 룸 매니저 서비스
 *
 * WebSocket 룸의 멤버십을 추적하고 관리합니다.
 * 룸 ID 유효성 검증, 기본 룸 판별, 멤버 추적 기능을 제공합니다.
 *
 * @module RoomManagerService
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

/**
 * 유효한 룸 ID 형식을 정의하는 정규식
 *
 * @description 허용되는 접두사: group, channel, user, broadcast
 * 접두사 뒤에 콜론(:)과 영숫자/언더스코어/하이픈 조합이 옵니다.
 * 예: "group:team-alpha", "user:abc123", "broadcast:all"
 */
const ROOM_ID_PATTERN = /^(group|channel|user|broadcast):[a-zA-Z0-9_-]+$/;

@Injectable()
export class RoomManagerService {
  /** 룸별 소켓 ID 집합을 관리하는 맵 */
  private readonly roomMembers: Map<string, Set<string>> = new Map();

  constructor(private readonly logger: LoggerService) {
    this.logger.setContext('RoomManagerService');
  }

  /**
   * 소켓을 지정된 룸에 추가합니다
   *
   * @param roomId - 대상 룸의 식별자
   * @param socketId - 추가할 소켓의 식별자
   */
  addToRoom(roomId: string, socketId: string): void {
    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Set());
    }

    const members = this.roomMembers.get(roomId)!;
    members.add(socketId);

    this.logger.debug('Socket added to room', {
      roomId,
      socketId,
      memberCount: members.size,
    });
  }

  /**
   * 소켓을 지정된 룸에서 제거합니다
   *
   * @description 룸에 멤버가 없으면 룸 자체를 삭제합니다.
   *
   * @param roomId - 대상 룸의 식별자
   * @param socketId - 제거할 소켓의 식별자
   */
  removeFromRoom(roomId: string, socketId: string): void {
    const members = this.roomMembers.get(roomId);
    if (!members) {
      return;
    }

    members.delete(socketId);

    if (members.size === 0) {
      this.roomMembers.delete(roomId);
    }

    this.logger.debug('Socket removed from room', {
      roomId,
      socketId,
      remainingMembers: members.size,
    });
  }

  /**
   * 룸의 멤버 목록을 반환합니다
   *
   * @param roomId - 조회할 룸의 식별자
   * @returns 룸에 속한 소켓 ID의 집합 (룸이 없으면 빈 Set)
   */
  getRoomMembers(roomId: string): Set<string> {
    return this.roomMembers.get(roomId) ?? new Set();
  }

  /**
   * 룸의 현재 멤버 수를 반환합니다
   *
   * @param roomId - 조회할 룸의 식별자
   * @returns 룸의 멤버 수
   */
  getRoomMemberCount(roomId: string): number {
    return this.roomMembers.get(roomId)?.size ?? 0;
  }

  /**
   * 특정 소켓이 룸에 속해 있는지 확인합니다
   *
   * @param roomId - 확인할 룸의 식별자
   * @param socketId - 확인할 소켓의 식별자
   * @returns 룸 소속 여부
   */
  isInRoom(roomId: string, socketId: string): boolean {
    return this.roomMembers.get(roomId)?.has(socketId) ?? false;
  }

  /**
   * 소켓을 모든 룸에서 제거합니다
   *
   * @description 소켓 연결 해제 시 호출되며,
   * 해당 소켓이 속한 모든 룸에서 제거합니다.
   * 빈 룸은 자동으로 삭제됩니다.
   *
   * @param socketId - 제거할 소켓의 식별자
   */
  removeFromAllRooms(socketId: string): void {
    const roomsToDelete: string[] = [];

    for (const [roomId, members] of this.roomMembers) {
      if (members.has(socketId)) {
        members.delete(socketId);
        if (members.size === 0) {
          roomsToDelete.push(roomId);
        }
      }
    }

    for (const roomId of roomsToDelete) {
      this.roomMembers.delete(roomId);
    }

    this.logger.debug('Socket removed from all rooms', {
      socketId,
      cleanedRooms: roomsToDelete.length,
    });
  }

  /**
   * 룸 ID가 유효한 형식인지 검증합니다
   *
   * @description 허용 형식: (group|channel|user|broadcast):[a-zA-Z0-9_-]+
   *
   * @param roomId - 검증할 룸 ID
   * @returns 유효 여부
   */
  isValidRoomId(roomId: string): boolean {
    return ROOM_ID_PATTERN.test(roomId);
  }

  /**
   * 룸이 사용자의 기본 룸인지 확인합니다
   *
   * @description 기본 룸은 `user:{userId}`와 `broadcast:all`이며,
   * 사용자가 임의로 떠날 수 없습니다.
   *
   * @param roomId - 확인할 룸 ID
   * @param userId - 사용자 식별자
   * @returns 기본 룸 여부
   */
  isDefaultRoom(roomId: string, userId: string): boolean {
    return roomId === `user:${userId}` || roomId === 'broadcast:all';
  }
}
