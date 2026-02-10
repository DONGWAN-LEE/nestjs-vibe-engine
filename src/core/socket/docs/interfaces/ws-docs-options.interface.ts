/**
 * WebSocket 문서화 옵션 인터페이스
 *
 * WsDocsModule 설정 및 문서 생성에 필요한 옵션을 정의합니다.
 *
 * @module WsDocsOptionsInterface
 */

/**
 * WebSocket 문서화 모듈 설정 옵션
 */
export interface WsDocsModuleOptions {
  /** 문서 페이지 활성화 여부 */
  enabled: boolean;
  /** 문서 경로 접두사 (기본값: '/ws-docs') */
  path?: string;
  /** API 제목 */
  title?: string;
  /** API 설명 */
  description?: string;
  /** API 버전 */
  version?: string;
  /** WebSocket 서버 URL */
  serverUrl?: string;
}

/**
 * AsyncAPI 유사 스펙 문서의 서버 정보
 */
export interface WsDocsServerInfo {
  /** 서버 URL */
  url: string;
  /** 프로토콜 (ws 또는 wss) */
  protocol: 'ws' | 'wss';
  /** 서버 설명 */
  description: string;
}

/**
 * AsyncAPI 유사 스펙 문서의 전체 구조
 */
export interface WsDocsSpec {
  /** AsyncAPI 호환 버전 */
  asyncapi: string;
  /** 문서 정보 */
  info: {
    /** 제목 */
    title: string;
    /** 설명 */
    description: string;
    /** 버전 */
    version: string;
  };
  /** 서버 정보 */
  servers: Record<string, WsDocsServerInfo>;
  /** 채널 (이벤트) 목록 */
  channels: Record<string, WsDocsChannelItem>;
}

/**
 * AsyncAPI 채널 항목 (이벤트 정의)
 */
export interface WsDocsChannelItem {
  /** 채널 설명 */
  description: string;
  /** 구독 (서버 -> 클라이언트) 정보 */
  subscribe?: WsDocsOperation;
  /** 발행 (클라이언트 -> 서버) 정보 */
  publish?: WsDocsOperation;
}

/**
 * AsyncAPI 오퍼레이션 정의
 */
export interface WsDocsOperation {
  /** 오퍼레이션 설명 */
  summary: string;
  /** 메시지 스키마 */
  message: {
    /** 페이로드 스키마 */
    payload: {
      /** 타입 */
      type: string;
      /** 프로퍼티 목록 */
      properties: Record<string, WsDocsPropertySchema>;
      /** 필수 필드 목록 */
      required?: string[];
    };
  };
}

/**
 * AsyncAPI 프로퍼티 스키마
 */
export interface WsDocsPropertySchema {
  /** 데이터 타입 */
  type: string;
  /** 설명 */
  description: string;
  /** 예시 값 */
  example?: unknown;
}
