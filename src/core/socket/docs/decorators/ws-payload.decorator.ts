/**
 * WebSocket 페이로드 데코레이터
 *
 * WebSocket 이벤트 핸들러의 요청 페이로드 스키마를 문서화합니다.
 * WsDocsService가 이 메타데이터를 읽어 요청 형식 문서를 생성합니다.
 *
 * @module WsPayloadDecorator
 *
 * @example
 * ```typescript
 * @WsPayload({
 *   fields: [
 *     { name: 'roomId', type: 'string', required: true, description: '대상 룸 ID' },
 *     { name: 'content', type: 'string', required: true, description: '메시지 내용' },
 *   ],
 * })
 * @SubscribeMessage('chat:send')
 * handleChatSend(data: ChatSendPayload): ChatSendResponse { ... }
 * ```
 */

import { SetMetadata } from '@nestjs/common';
import { WsPayloadOptions } from '../interfaces/ws-event-metadata.interface';

/**
 * WsPayload 데코레이터 메타데이터 키
 */
export const WS_PAYLOAD_METADATA_KEY = 'ws:payload:metadata';

/**
 * WebSocket 페이로드 문서화 데코레이터
 *
 * @description 이벤트 핸들러 메서드에 요청 페이로드 스키마 정보를 부착합니다.
 * 각 필드의 이름, 타입, 필수 여부, 설명을 정의할 수 있습니다.
 *
 * @param options - 페이로드 스키마 옵션
 * @returns 메서드 데코레이터
 */
export function WsPayload(options: WsPayloadOptions): MethodDecorator {
  return SetMetadata(WS_PAYLOAD_METADATA_KEY, {
    fields: options.fields,
  });
}
