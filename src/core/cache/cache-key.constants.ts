/**
 * 캐시 키 상수 정의
 *
 * ARCHITECTURE.md Section 6.1 캐시 키 패턴을 정의합니다.
 * 모든 캐시 키는 일관된 네이밍 컨벤션을 따르며,
 * 각 도메인별 키 생성 함수와 TTL 상수를 제공합니다.
 *
 * @example
 * ```typescript
 * const key = CACHE_KEYS.USER_INFO(userId);
 * await cacheService.set(key, userInfo, CACHE_TTL.USER_INFO);
 * ```
 */

/**
 * 캐시 키 생성 함수 모음
 *
 * 각 함수는 도메인별 캐시 키를 생성합니다.
 * 키 형식: `{도메인}:{식별자}` 패턴을 따릅니다.
 */
export const CACHE_KEYS = {
  /**
   * 사용자 정보 캐시 키를 생성합니다
   *
   * @param userId - 사용자 고유 식별자
   * @returns 'user_info:{userId}' 형식의 캐시 키
   */
  USER_INFO: (userId: string) => `user_info:${userId}`,

  /**
   * 사용자 세션 캐시 키를 생성합니다
   *
   * @param userId - 사용자 고유 식별자
   * @returns 'user_session:{userId}' 형식의 캐시 키
   */
  USER_SESSION: (userId: string) => `user_session:${userId}`,

  /**
   * 리프레시 토큰 캐시 키를 생성합니다
   *
   * @param tokenHash - 토큰 해시값
   * @returns 'refresh_token:{tokenHash}' 형식의 캐시 키
   */
  REFRESH_TOKEN: (tokenHash: string) => `refresh_token:${tokenHash}`,

  /**
   * Rate Limit 캐시 키를 생성합니다
   *
   * @param userId - 사용자 고유 식별자
   * @param endpoint - API 엔드포인트 경로
   * @returns 'rate_limit:{userId}:{endpoint}' 형식의 캐시 키
   */
  RATE_LIMIT: (userId: string, endpoint: string) => `rate_limit:${userId}:${endpoint}`,

  /**
   * Socket.io 룸 캐시 키를 생성합니다
   *
   * @param roomId - 룸 고유 식별자
   * @returns 'socket_room:{roomId}' 형식의 캐시 키
   */
  SOCKET_ROOM: (roomId: string) => `socket_room:${roomId}`,

  /**
   * 세션 캐시 키를 생성합니다
   *
   * @param sessionId - 세션 고유 식별자
   * @returns 'session:{sessionId}' 형식의 캐시 키
   */
  SESSION: (sessionId: string) => `session:${sessionId}`,

  /**
   * 무효화된 세션 캐시 키를 생성합니다
   *
   * @param sessionId - 세션 고유 식별자
   * @returns 'session_invalid:{sessionId}' 형식의 캐시 키
   */
  SESSION_INVALID: (sessionId: string) => `session_invalid:${sessionId}`,
} as const;

/**
 * 캐시 TTL(Time-To-Live) 상수 (초 단위)
 *
 * ARCHITECTURE.md Section 6.3 TTL 설정을 따릅니다.
 */
export const CACHE_TTL = {
  /** 사용자 정보: 1시간 */
  USER_INFO: 3600,

  /** 사용자 세션: 1시간 */
  USER_SESSION: 3600,

  /** 리프레시 토큰: 30일 */
  REFRESH_TOKEN: 2592000,

  /** Rate Limit: 1분 */
  RATE_LIMIT: 60,

  /** 세션: 30일 */
  SESSION: 2592000,

  /** 무효화된 세션: 24시간 */
  SESSION_INVALID: 86400,
} as const;
