/**
 * 사용자 프로필 응답 DTO
 *
 * API 응답에서 사용자 정보를 반환할 때 사용되는 데이터 전송 객체입니다.
 * 민감한 정보(암호화된 이메일 등)를 제외하고 클라이언트에 전달 가능한 형태로 구성됩니다.
 *
 * @example
 * ```typescript
 * const profile: UserProfileResponseDto = {
 *   id: 'uuid-string',
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   picture: 'https://example.com/avatar.jpg',
 *   createdAt: '2026-01-01T00:00:00.000Z',
 *   updatedAt: '2026-02-01T00:00:00.000Z',
 * };
 * ```
 *
 * @module user/dto
 */

/**
 * 사용자 프로필 응답 DTO
 *
 * @description
 * 클라이언트에 반환되는 사용자 프로필 정보를 정의합니다.
 * 이메일은 복호화된 상태로 반환되며, 타임스탬프는 ISO 8601 문자열로 변환됩니다.
 */
export class UserProfileResponseDto {
  /** 사용자 고유 식별자 (UUID v4) */
  id: string;

  /** 사용자 이메일 주소 (복호화된 평문) */
  email: string;

  /** 사용자 표시 이름 */
  name: string;

  /** 프로필 이미지 URL (선택적) */
  picture?: string;

  /** 계정 생성 시각 (ISO 8601) */
  createdAt: string;

  /** 프로필 최종 수정 시각 (ISO 8601) */
  updatedAt: string;
}
