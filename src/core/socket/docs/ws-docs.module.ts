/**
 * WebSocket 문서화 모듈
 *
 * WS_DOCS_ENABLED 환경 변수에 따라 동적으로 활성화되는 모듈입니다.
 * 활성화 시 WebSocket API 문서 엔드포인트(/ws-docs)를 제공합니다.
 * 비활성화 시 빈 모듈로 등록되어 런타임 오버헤드가 없습니다.
 *
 * @module WsDocsModule
 */

import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { WsDocsController } from './ws-docs.controller';
import { WsDocsService, WS_DOCS_OPTIONS } from './ws-docs.service';
import { WsDocsModuleOptions } from './interfaces/ws-docs-options.interface';
import { LoggerService } from '../../logger/logger.service';

@Module({})
export class WsDocsModule {
  /**
   * 환경 설정에 따라 문서화 모듈을 동적으로 등록합니다
   *
   * @description
   * WS_DOCS_ENABLED 환경 변수가 'true'이면 문서 컨트롤러와 서비스를 활성화합니다.
   * 프로덕션 환경에서는 보안을 위해 비활성화할 수 있습니다.
   * 옵션을 직접 전달하거나 ConfigService에서 자동으로 읽습니다.
   *
   * @param options - 문서화 모듈 옵션 (선택적, 없으면 환경 변수 사용)
   * @returns 동적 모듈 설정
   */
  static register(options?: Partial<WsDocsModuleOptions>): DynamicModule {
    return {
      module: WsDocsModule,
      imports: [ConfigModule, DiscoveryModule],
      controllers: [WsDocsController],
      providers: [
        {
          provide: WS_DOCS_OPTIONS,
          useFactory: (configService: ConfigService): WsDocsModuleOptions => {
            const enabled =
              options?.enabled ??
              configService.get<string>('WS_DOCS_ENABLED', 'false') === 'true';

            return {
              enabled,
              path: options?.path ?? '/ws-docs',
              title: options?.title ?? configService.get<string>(
                'WS_DOCS_TITLE',
                'NestJS Engine WebSocket API',
              ),
              description: options?.description ?? configService.get<string>(
                'WS_DOCS_DESCRIPTION',
                'NestJS Backend Engine WebSocket API Documentation',
              ),
              version: options?.version ?? configService.get<string>(
                'WS_DOCS_VERSION',
                '1.0.0',
              ),
              serverUrl: options?.serverUrl ?? configService.get<string>(
                'WS_SERVER_URL',
                'ws://localhost:3000',
              ),
            };
          },
          inject: [ConfigService],
        },
        WsDocsService,
        LoggerService,
      ],
      exports: [WsDocsService],
    };
  }

  /**
   * 환경 변수를 확인하여 조건부로 모듈을 등록합니다
   *
   * @description WS_DOCS_ENABLED가 'true'일 때만 전체 모듈을 로드합니다.
   * 'false'이면 빈 모듈을 반환하여 불필요한 리소스 사용을 방지합니다.
   *
   * @returns 동적 모듈 설정
   */
  static forRoot(): DynamicModule {
    return {
      module: WsDocsModule,
      imports: [ConfigModule, DiscoveryModule],
      controllers: [WsDocsController],
      providers: [
        {
          provide: WS_DOCS_OPTIONS,
          useFactory: (configService: ConfigService): WsDocsModuleOptions => {
            const enabled =
              configService.get<string>('WS_DOCS_ENABLED', 'false') === 'true';

            return {
              enabled,
              title: configService.get<string>(
                'WS_DOCS_TITLE',
                'NestJS Engine WebSocket API',
              ),
              description: configService.get<string>(
                'WS_DOCS_DESCRIPTION',
                'NestJS Backend Engine WebSocket API Documentation',
              ),
              version: configService.get<string>('WS_DOCS_VERSION', '1.0.0'),
              serverUrl: configService.get<string>(
                'WS_SERVER_URL',
                'ws://localhost:3000',
              ),
            };
          },
          inject: [ConfigService],
        },
        WsDocsService,
        LoggerService,
      ],
      exports: [WsDocsService],
    };
  }
}
