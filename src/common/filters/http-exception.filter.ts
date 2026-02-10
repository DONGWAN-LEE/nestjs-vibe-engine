/**
 * 전역 HTTP 예외 필터
 *
 * 모든 예외를 표준 API 응답 형식으로 변환하여 반환합니다.
 * HttpException, ValidationPipe 에러, 예상치 못한 런타임 에러를 모두 처리합니다.
 *
 * ARCHITECTURE.md Section 9.3 에러 코드 체계 기반 구현:
 * - 400: REQ_001 (잘못된 요청)
 * - 401: AUTH_001 (인증 실패)
 * - 403: PERM_001 (권한 없음)
 * - 404: NOT_001 (리소스 없음)
 * - 429: RATE_001 (Rate Limit 초과)
 * - 500: SRV_001 (서버 에러)
 *
 * @example
 * ```typescript
 * // main.ts 또는 app.module.ts에서 전역 등록
 * app.useGlobalFilters(new HttpExceptionFilter(loggerService));
 * ```
 *
 * @module common/filters
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { LoggerService } from '../../core/logger/logger.service';

/**
 * 표준 에러 응답 인터페이스
 */
interface ErrorResponseBody {
  /** 요청 처리 성공 여부 (항상 false) */
  success: false;
  /** 에러 상세 정보 */
  error: {
    /** 애플리케이션 고유 에러 코드 */
    code: string;
    /** 사람이 읽을 수 있는 에러 메시지 */
    message: string;
    /** 에러에 대한 추가 상세 정보 (선택적) */
    details?: Record<string, unknown>;
  };
}

/**
 * 전역 예외 필터
 *
 * @description
 * 모든 예외를 캐치하여 통일된 에러 응답 형식으로 변환합니다.
 *
 * 처리 순서:
 * 1. 이미 표준 형식인 예외 응답은 그대로 전달
 * 2. NestJS 기본 형식의 HttpException은 표준 형식으로 변환
 * 3. 알 수 없는 예외는 SRV_001 코드의 500 에러로 변환
 *
 * 프로덕션 환경에서는 서버 에러의 상세 정보가 노출되지 않습니다.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.logger.setContext('HttpExceptionFilter');
  }

  /**
   * 예외를 처리하고 표준 에러 응답을 반환합니다
   *
   * @param exception - 발생한 예외 객체
   * @param host - 실행 컨텍스트의 ArgumentsHost
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: ErrorResponseBody = {
      success: false,
      error: {
        code: 'SRV_001',
        message: 'Internal server error',
      },
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;

        if (
          'success' in responseObj &&
          responseObj.success === false &&
          'error' in responseObj
        ) {
          errorResponse = exceptionResponse as ErrorResponseBody;
        } else if ('message' in responseObj) {
          const rawMessage = responseObj.message;
          let formattedMessage: string;

          if (Array.isArray(rawMessage)) {
            formattedMessage = rawMessage.join(', ');
          } else if (typeof rawMessage === 'string') {
            formattedMessage = rawMessage;
          } else {
            formattedMessage = String(rawMessage);
          }

          errorResponse = {
            success: false,
            error: {
              code: this.getErrorCode(status),
              message: formattedMessage,
            },
          };
        }
      } else if (typeof exceptionResponse === 'string') {
        errorResponse = {
          success: false,
          error: {
            code: this.getErrorCode(status),
            message: exceptionResponse,
          },
        };
      }

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error('Server error occurred', {
          statusCode: status,
          path: request.url,
          method: request.method,
          errorCode: errorResponse.error.code,
          message: errorResponse.error.message,
          stack: exception.stack,
        });
      } else {
        this.logger.warn('Client error occurred', {
          statusCode: status,
          path: request.url,
          method: request.method,
          errorCode: errorResponse.error.code,
          message: errorResponse.error.message,
        });
      }
    } else {
      const errorMessage =
        exception instanceof Error ? exception.message : 'Unknown error';
      const errorStack =
        exception instanceof Error ? exception.stack : undefined;

      this.logger.error('Unhandled exception occurred', {
        statusCode: status,
        path: request.url,
        method: request.method,
        errorCode: 'SRV_001',
        message: errorMessage,
        stack: errorStack,
      });

      errorResponse = {
        success: false,
        error: {
          code: 'SRV_001',
          message: 'Internal server error',
        },
      };
    }

    response.status(status).json(errorResponse);
  }

  /**
   * HTTP 상태 코드에 대응하는 애플리케이션 에러 코드를 반환합니다
   *
   * ARCHITECTURE.md Section 9.3 에러 코드 체계를 따릅니다.
   *
   * @param status - HTTP 상태 코드
   * @returns 애플리케이션 고유 에러 코드 문자열
   */
  private getErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'REQ_001';
      case HttpStatus.UNAUTHORIZED:
        return 'AUTH_001';
      case HttpStatus.FORBIDDEN:
        return 'PERM_001';
      case HttpStatus.NOT_FOUND:
        return 'NOT_001';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_001';
      case HttpStatus.CONFLICT:
        return 'REQ_002';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'REQ_003';
      default:
        return 'SRV_001';
    }
  }
}
