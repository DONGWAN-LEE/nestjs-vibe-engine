/**
 * API 응답 표준 인터페이스
 *
 * 모든 API 엔드포인트의 응답 형식을 통일합니다.
 * 성공/실패 여부, 데이터, 에러 정보, 메타데이터를 포함합니다.
 *
 * @template T - 응답 데이터의 타입
 *
 * @example
 * ```typescript
 * // 성공 응답
 * const response: ApiResponse<User> = {
 *   success: true,
 *   data: { id: '1', name: 'John' },
 *   meta: { timestamp: '2025-01-15 09:00:00' },
 * };
 *
 * // 실패 응답
 * const errorResponse: ApiResponse = {
 *   success: false,
 *   error: {
 *     code: 'AUTH_001',
 *     message: '인증 토큰이 만료되었습니다',
 *     details: { expiredAt: '2025-01-15 08:00:00' },
 *   },
 * };
 * ```
 */
export interface ApiResponse<T = any> {
  /** 요청 처리 성공 여부 */
  success: boolean;

  /** 성공 시 반환되는 응답 데이터 */
  data?: T;

  /** 실패 시 반환되는 에러 정보 */
  error?: {
    /** 애플리케이션 고유 에러 코드 (예: 'AUTH_001', 'DB_CONN_FAIL') */
    code: string;

    /** 사람이 읽을 수 있는 에러 메시지 */
    message: string;

    /** 에러에 대한 추가 상세 정보 */
    details?: Record<string, unknown>;
  };

  /** 페이지네이션, 타임스탬프 등 추가 메타 정보 */
  meta?: Record<string, unknown>;
}
