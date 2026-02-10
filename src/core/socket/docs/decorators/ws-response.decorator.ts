/**
 * WebSocket 응답 데코레이터
 *
 * WebSocket 이벤트 핸들러의 응답 스키마를 문서화합니다.
 * WsDocsService가 이 메타데이터를 읽어 응답 형식 문서를 생성합니다.
 *
 * @module WsResponseDecorator
 *
 * @example
 * ```typescript
 * @WsResponse({
 *   fields: [
 *     { name: 'success', type: 'boolean', description: '성공 여부' },
 *     { name: 'messageId', type: 'string', description: '생성된 메시지 ID' },
 *   ],
 * })
 * @SubscribeMessage('chat:send')
 * handleChatSend(data: ChatSendPayload): ChatSendResponse { ... }
 * ```
 */

import { SetMetadata } from '@nestjs/common';
import { WsResponseOptions } from '../interfaces/ws-event-metadata.interface';

/**
 * WsResponse 데코레이터 메타데이터 키
 */
export const WS_RESPONSE_METADATA_KEY = 'ws:response:metadata';

/**
 * WebSocket 응답 문서화 데코레이터
 *
 * @description 이벤트 핸들러 메서드에 응답 스키마 정보를 부착합니다.
 * 각 필드의 이름, 타입, 설명, 예시값을 정의할 수 있습니다.
 *
 * @param options - 응답 스키마 옵션
 * @returns 메서드 데코레이터
 */
export function WsResponse(options: WsResponseOptions): MethodDecorator {
  return SetMetadata(WS_RESPONSE_METADATA_KEY, {
    fields: options.fields,
  });
}
