/**
 * WebSocket 문서화 컨트롤러
 *
 * WebSocket API 문서를 HTTP 엔드포인트로 제공합니다.
 * HTML 페이지, JSON 스펙, 이벤트 목록 조회를 지원합니다.
 *
 * @module WsDocsController
 */

import { Controller, Get, Header } from '@nestjs/common';
import { WsDocsService } from './ws-docs.service';
import { WsEventMetadata } from './interfaces/ws-event-metadata.interface';
import { WsDocsSpec } from './interfaces/ws-docs-options.interface';

@Controller('ws-docs')
export class WsDocsController {
  constructor(private readonly wsDocsService: WsDocsService) {}

  /**
   * WebSocket API 문서를 HTML 페이지로 반환합니다
   *
   * @description 브라우저에서 접근 가능한 대화형 문서 페이지를 제공합니다.
   * 이벤트 목록, 페이로드/응답 스키마, 연결 예시를 포함합니다.
   *
   * @returns 렌더링된 HTML 문서
   */
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDocsPage(): string {
    return this.wsDocsService.getHtml();
  }

  /**
   * WebSocket API의 AsyncAPI 유사 스펙을 JSON으로 반환합니다
   *
   * @description 프로그래밍 방식으로 사용할 수 있는
   * 구조화된 API 스펙 문서를 제공합니다.
   *
   * @returns AsyncAPI 유사 스펙 JSON 객체
   */
  @Get('spec')
  getSpec(): WsDocsSpec {
    return this.wsDocsService.getSpec();
  }

  /**
   * 등록된 WebSocket 이벤트 목록을 반환합니다
   *
   * @description 모든 이벤트의 이름, 설명, 방향, 인증 요구사항,
   * 페이로드/응답 스키마를 포함하는 목록을 제공합니다.
   *
   * @returns 이벤트 메타데이터 배열
   */
  @Get('events')
  getEvents(): WsEventMetadata[] {
    return this.wsDocsService.getEvents();
  }
}
