/**
 * 사용자 프로필 수정 DTO
 *
 * 사용자가 자신의 프로필 정보를 수정할 때 사용되는 데이터 전송 객체입니다.
 * 모든 필드가 선택적이며, class-validator를 통해 입력값 검증을 수행합니다.
 *
 * @example
 * ```typescript
 * const dto: UpdateUserDto = {
 *   name: 'Updated Name',
 *   picture: 'https://example.com/avatar.jpg',
 * };
 * ```
 *
 * @module user/dto
 */

import { IsString, IsOptional } from 'class-validator';

/**
 * 사용자 프로필 업데이트 요청 DTO
 *
 * @description
 * - name: 사용자 표시 이름 (선택적, 문자열)
 * - picture: 프로필 이미지 URL (선택적, 문자열)
 */
export class UpdateUserDto {
  /** 사용자 표시 이름 */
  @IsOptional()
  @IsString()
  name?: string;

  /** 프로필 이미지 URL */
  @IsOptional()
  @IsString()
  picture?: string;
}
