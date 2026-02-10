/**
 * WebSocket 이벤트 데코레이터
 *
 * WebSocket 이벤트 핸들러에 문서화 메타데이터를 부착합니다.
 * WsDocsService가 런타임에 이 메타데이터를 스캔하여 문서를 생성합니다.
 *
 * @module WsEventDecorator
 *
 * @example
 * ```typescript
 * @WsEvent({
 *   name: 'chat:send',
 *   description: '채팅 메시지를 전송합니다',
 *   direction: 'client-to-server',
 *   category: 'chat',
 * })
 * @SubscribeMessage('chat:send')
 * handleChatSend(data: ChatSendPayload): ChatSendResponse { ... }
 * ```
 */

import { SetMetadata } from '@nestjs/common';
import { WsEventOptions } from '../interfaces/ws-event-metadata.interface';

/**
 * WsEvent 데코레이터 메타데이터 키
 */
export const WS_EVENT_METADATA_KEY = 'ws:event:metadata';

/**
 * WebSocket 이벤트 문서화 데코레이터
 *
 * @description 이벤트 핸들러 메서드에 문서화 정보를 부착합니다.
 * 이 메타데이터는 WsDocsService에 의해 수집되어
 * AsyncAPI 유사 스펙 문서 생성에 사용됩니다.
 *
 * @param options - 이벤트 문서화 옵션
 * @returns 메서드 데코레이터
 */
export function WsEvent(options: WsEventOptions): MethodDecorator {
  const metadata = {
    name: options.name,
    description: options.description,
    direction: options.direction ?? 'client-to-server',
    requiresAuth: options.requiresAuth ?? true,
    category: options.category ?? 'general',
    example: options.example,
  };

  return SetMetadata(WS_EVENT_METADATA_KEY, metadata);
}
