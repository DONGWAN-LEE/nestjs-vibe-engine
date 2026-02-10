/**
 * WebSocket 문서화 서비스
 *
 * 게이트웨이 클래스의 데코레이터 메타데이터를 스캔하여
 * AsyncAPI 유사 스펙 문서를 자동 생성합니다.
 * 이벤트 목록, 페이로드/응답 스키마, HTML 문서를 제공합니다.
 *
 * @module WsDocsService
 */

import { Injectable, Inject, Optional } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from '../../logger/logger.service';
import { WS_EVENT_METADATA_KEY } from './decorators/ws-event.decorator';
import { WS_PAYLOAD_METADATA_KEY } from './decorators/ws-payload.decorator';
import { WS_RESPONSE_METADATA_KEY } from './decorators/ws-response.decorator';
import {
  WsEventMetadata,
  WsPayloadField,
  WsResponseField,
} from './interfaces/ws-event-metadata.interface';
import {
  WsDocsSpec,
  WsDocsChannelItem,
  WsDocsPropertySchema,
  WsDocsModuleOptions,
} from './interfaces/ws-docs-options.interface';

/**
 * WsDocsModule 옵션 주입 토큰
 */
export const WS_DOCS_OPTIONS = 'WS_DOCS_OPTIONS';

@Injectable()
export class WsDocsService {
  private readonly events: WsEventMetadata[] = [];
  private spec: WsDocsSpec | null = null;
  private htmlCache: string | null = null;

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @Optional() @Inject(WS_DOCS_OPTIONS) private readonly options?: WsDocsModuleOptions,
  ) {
    this.logger.setContext('WsDocsService');
    this.scanMetadata();
  }

  /**
   * 등록된 게이트웨이에서 WsEvent 메타데이터를 스캔합니다
   *
   * @description DiscoveryService를 사용하여 모든 프로바이더를 순회하며,
   * WS_EVENT_METADATA_KEY가 부착된 메서드의 메타데이터를 수집합니다.
   * WS_PAYLOAD_METADATA_KEY, WS_RESPONSE_METADATA_KEY도 함께 수집합니다.
   */
  private scanMetadata(): void {
    try {
      const providers = this.discoveryService.getProviders();

      for (const wrapper of providers) {
        const instance = wrapper.instance;
        if (!instance || typeof instance !== 'object') {
          continue;
        }

        const prototype = Object.getPrototypeOf(instance);
        if (!prototype) {
          continue;
        }

        const methodNames = this.metadataScanner.getAllMethodNames(prototype);

        for (const methodName of methodNames) {
          const eventMeta = this.reflector.get(
            WS_EVENT_METADATA_KEY,
            prototype[methodName],
          );

          if (!eventMeta) {
            continue;
          }

          const payloadMeta = this.reflector.get(
            WS_PAYLOAD_METADATA_KEY,
            prototype[methodName],
          );

          const responseMeta = this.reflector.get(
            WS_RESPONSE_METADATA_KEY,
            prototype[methodName],
          );

          const metadata: WsEventMetadata = {
            eventName: eventMeta.name,
            description: eventMeta.description,
            direction: eventMeta.direction,
            requiresAuth: eventMeta.requiresAuth,
            namespace: '/',
            category: eventMeta.category,
            example: eventMeta.example,
            payload: payloadMeta?.fields ?? [],
            response: responseMeta?.fields ?? [],
          };

          this.events.push(metadata);
        }
      }

      this.logger.info('WebSocket event metadata scanned', {
        eventCount: this.events.length,
      });
    } catch (error) {
      this.logger.error('Failed to scan WebSocket metadata', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 등록된 이벤트 목록을 반환합니다
   *
   * @returns 스캔된 WebSocket 이벤트 메타데이터 배열
   */
  getEvents(): WsEventMetadata[] {
    return [...this.events];
  }

  /**
   * AsyncAPI 유사 스펙 문서를 생성하여 반환합니다
   *
   * @description 스캔된 메타데이터를 기반으로 AsyncAPI 호환 JSON 스펙을 생성합니다.
   * 결과는 캐싱되어 반복 호출 시 재사용됩니다.
   *
   * @returns AsyncAPI 유사 스펙 객체
   */
  getSpec(): WsDocsSpec {
    if (this.spec) {
      return this.spec;
    }

    const serverUrl = this.options?.serverUrl
      ?? this.configService.get<string>('WS_SERVER_URL', 'ws://localhost:3000');

    this.spec = {
      asyncapi: '2.6.0',
      info: {
        title: this.options?.title ?? 'NestJS Engine WebSocket API',
        description: this.options?.description ?? 'NestJS Backend Engine WebSocket API Documentation',
        version: this.options?.version ?? '1.0.0',
      },
      servers: {
        development: {
          url: serverUrl,
          protocol: serverUrl.startsWith('wss') ? 'wss' : 'ws',
          description: 'WebSocket Server',
        },
      },
      channels: this.buildChannels(),
    };

    return this.spec;
  }

  /**
   * HTML 문서 페이지를 생성하여 반환합니다
   *
   * @description templates/ws-docs.html 템플릿을 로드하고,
   * 스캔된 이벤트 데이터를 주입하여 완성된 HTML을 반환합니다.
   * 결과는 캐싱되어 반복 호출 시 재사용됩니다.
   *
   * @returns 렌더링된 HTML 문자열
   */
  getHtml(): string {
    if (this.htmlCache) {
      return this.htmlCache;
    }

    try {
      const templatePath = path.join(__dirname, 'templates', 'ws-docs.html');
      let template = fs.readFileSync(templatePath, 'utf-8');

      const spec = this.getSpec();
      const eventsJson = JSON.stringify(this.events, null, 2);
      const specJson = JSON.stringify(spec, null, 2);

      template = template
        .replace('{{TITLE}}', spec.info.title)
        .replace('{{DESCRIPTION}}', spec.info.description)
        .replace('{{VERSION}}', spec.info.version)
        .replace('{{EVENTS_JSON}}', eventsJson)
        .replace('{{SPEC_JSON}}', specJson);

      this.htmlCache = template;
      return this.htmlCache;
    } catch (error) {
      this.logger.error('Failed to render WebSocket docs HTML', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.buildFallbackHtml();
    }
  }

  /**
   * 이벤트 메타데이터를 AsyncAPI 채널 구조로 변환합니다
   *
   * @returns 이벤트별 채널 정의 맵
   */
  private buildChannels(): Record<string, WsDocsChannelItem> {
    const channels: Record<string, WsDocsChannelItem> = {};

    for (const event of this.events) {
      const channelItem: WsDocsChannelItem = {
        description: event.description,
      };

      const properties: Record<string, WsDocsPropertySchema> = {};
      const requiredFields: string[] = [];

      if (event.direction === 'client-to-server' || event.direction === 'bidirectional') {
        for (const field of event.payload) {
          properties[field.name] = {
            type: field.type,
            description: field.description,
            example: field.example,
          };
          if (field.required) {
            requiredFields.push(field.name);
          }
        }

        channelItem.publish = {
          summary: event.description,
          message: {
            payload: {
              type: 'object',
              properties,
              required: requiredFields.length > 0 ? requiredFields : undefined,
            },
          },
        };
      }

      if (event.direction === 'server-to-client' || event.direction === 'bidirectional') {
        const responseProperties: Record<string, WsDocsPropertySchema> = {};

        for (const field of event.response) {
          responseProperties[field.name] = {
            type: field.type,
            description: field.description,
            example: field.example,
          };
        }

        channelItem.subscribe = {
          summary: event.description,
          message: {
            payload: {
              type: 'object',
              properties: responseProperties,
            },
          },
        };
      }

      channels[event.eventName] = channelItem;
    }

    return channels;
  }

  /**
   * HTML 템플릿 로드 실패 시 사용되는 대체 HTML을 생성합니다
   *
   * @returns 기본 폴백 HTML 문자열
   */
  private buildFallbackHtml(): string {
    const spec = this.getSpec();
    const eventRows = this.events
      .map(
        (event) =>
          `<tr>
            <td><code>${event.eventName}</code></td>
            <td>${event.description}</td>
            <td>${event.direction}</td>
            <td>${event.requiresAuth ? 'Yes' : 'No'}</td>
            <td>${event.category}</td>
          </tr>`,
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${spec.info.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>${spec.info.title}</h1>
  <p>${spec.info.description} (v${spec.info.version})</p>
  <table>
    <thead>
      <tr><th>Event</th><th>Description</th><th>Direction</th><th>Auth</th><th>Category</th></tr>
    </thead>
    <tbody>${eventRows}</tbody>
  </table>
</body>
</html>`;
  }
}
