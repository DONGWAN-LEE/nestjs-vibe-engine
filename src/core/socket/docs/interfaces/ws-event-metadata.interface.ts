/**
 * WebSocket 이벤트 메타데이터 인터페이스
 *
 * WsEvent, WsPayload, WsResponse 데코레이터를 통해 수집되는
 * 이벤트 문서화 메타데이터의 타입을 정의합니다.
 *
 * @module WsEventMetadataInterface
 */

/**
 * 이벤트 방향 (클라이언트 -> 서버, 서버 -> 클라이언트, 양방향)
 */
export type WsEventDirection = 'client-to-server' | 'server-to-client' | 'bidirectional';

/**
 * 페이로드 필드 정의
 */
export interface WsPayloadField {
  /** 필드 이름 */
  name: string;
  /** 필드 타입 (예: string, number, boolean, object) */
  type: string;
  /** 필수 여부 */
  required: boolean;
  /** 필드 설명 */
  description: string;
  /** 예시 값 */
  example?: unknown;
}

/**
 * 응답 필드 정의
 */
export interface WsResponseField {
  /** 필드 이름 */
  name: string;
  /** 필드 타입 */
  type: string;
  /** 필드 설명 */
  description: string;
  /** 예시 값 */
  example?: unknown;
}

/**
 * WebSocket 이벤트 메타데이터
 *
 * @description 하나의 WebSocket 이벤트에 대한 전체 문서화 정보를 포함합니다.
 */
export interface WsEventMetadata {
  /** 이벤트 이름 (예: 'chat:send', 'room:join') */
  eventName: string;
  /** 이벤트 설명 */
  description: string;
  /** 이벤트 방향 */
  direction: WsEventDirection;
  /** 인증 필요 여부 */
  requiresAuth: boolean;
  /** 요청 페이로드 필드 목록 */
  payload: WsPayloadField[];
  /** 응답 필드 목록 */
  response: WsResponseField[];
  /** 이벤트가 속한 네임스페이스 */
  namespace: string;
  /** 이벤트 카테고리 (예: 'chat', 'room', 'system') */
  category: string;
  /** 사용 예시 코드 */
  example?: string;
}

/**
 * WebSocket 이벤트 데코레이터 옵션
 */
export interface WsEventOptions {
  /** 이벤트 이름 */
  name: string;
  /** 이벤트 설명 */
  description: string;
  /** 이벤트 방향 */
  direction?: WsEventDirection;
  /** 인증 필요 여부 (기본값: true) */
  requiresAuth?: boolean;
  /** 이벤트 카테고리 */
  category?: string;
  /** 사용 예시 코드 */
  example?: string;
}

/**
 * WebSocket 페이로드 데코레이터 옵션
 */
export interface WsPayloadOptions {
  /** 페이로드 필드 목록 */
  fields: WsPayloadField[];
}

/**
 * WebSocket 응답 데코레이터 옵션
 */
export interface WsResponseOptions {
  /** 응답 필드 목록 */
  fields: WsResponseField[];
}
