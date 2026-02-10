/**
 * 사용자 컨트롤러
 *
 * 사용자 프로필 관련 REST API 엔드포인트를 제공합니다.
 * 모든 엔드포인트는 JWT 인증이 필요하며,
 * 표준 API 응답 형식 { success, data } 을 따릅니다.
 *
 * ARCHITECTURE.md Section 9 - API 응답 형식 기반 구현
 *
 * @example
 * ```
 * GET  /api/v1/users/me       - 내 프로필 조회
 * PATCH /api/v1/users/me      - 내 프로필 수정
 * DELETE /api/v1/users/me     - 내 계정 삭제 (Soft Delete)
 * POST /api/v1/users/restore  - 삭제된 계정 복원
 * ```
 *
 * @module user
 */

import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoggerService } from '../core/logger/logger.service';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { UserProfileResponseDto } from './dto/user-response.dto';

/**
 * JWT 페이로드에서 추출되는 사용자 정보 인터페이스
 */
interface JwtPayloadUser {
  /** 사용자 고유 식별자 */
  id: string;
  /** 사용자 이메일 */
  email: string;
}

/**
 * 계정 복원 요청 DTO
 */
interface RestoreRequestBody {
  /** 복원할 사용자의 고유 식별자 */
  userId: string;
}

@Controller('users')
export class UserController {
  private readonly logger: LoggerService;

  constructor(
    private readonly userService: UserService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('UserController');
  }

  /**
   * 현재 인증된 사용자의 프로필을 조회합니다
   *
   * JWT 토큰에서 추출된 userId로 프로필 정보를 반환합니다.
   * 암호화된 이메일은 복호화되어 반환됩니다.
   *
   * @param user - JWT 페이로드에서 추출된 사용자 정보
   * @returns 표준 API 응답 형식의 사용자 프로필
   *
   * @example
   * GET /api/v1/users/me
   * Authorization: Bearer {accessToken}
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "id": "uuid",
   *     "email": "user@example.com",
   *     "name": "John Doe",
   *     "picture": "https://...",
   *     "createdAt": "2026-01-01T00:00:00.000Z",
   *     "updatedAt": "2026-02-01T00:00:00.000Z"
   *   }
   * }
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<ApiResponse<UserProfileResponseDto>> {
    this.logger.info('Profile requested', { userId: user.id });

    const profile = await this.userService.getProfile(user.id);

    return {
      success: true,
      data: profile,
    };
  }

  /**
   * 현재 인증된 사용자의 프로필을 수정합니다
   *
   * 수정 가능한 필드: name, picture
   * name 필드는 빈 문자열이나 공백만으로 구성된 값을 허용하지 않으며,
   * 앞뒤 공백은 자동으로 제거됩니다.
   *
   * @param user - JWT 페이로드에서 추출된 사용자 정보
   * @param dto - 수정할 프로필 데이터
   * @returns 표준 API 응답 형식의 수정된 사용자 프로필
   * @throws BadRequestException name이 빈 문자열이나 공백인 경우
   *
   * @example
   * PATCH /api/v1/users/me
   * Authorization: Bearer {accessToken}
   * Content-Type: application/json
   *
   * { "name": "Updated Name" }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": { ...updatedProfile }
   * }
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMyProfile(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateUserDto,
  ): Promise<ApiResponse<UserProfileResponseDto>> {
    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();

      if (trimmedName.length === 0) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'REQ_001',
            message: 'Name cannot be empty or whitespace only',
          },
        });
      }

      dto.name = trimmedName;
    }

    this.logger.info('Profile update requested', {
      userId: user.id,
      fields: Object.keys(dto),
    });

    await this.userService.update(user.id, dto);
    const updatedProfile = await this.userService.getProfile(user.id);

    return {
      success: true,
      data: updatedProfile,
    };
  }

  /**
   * 현재 인증된 사용자의 계정을 삭제합니다 (Soft Delete)
   *
   * 삭제 프로세스:
   * 1. 사용자 레코드의 deletedAt 필드 설정
   * 2. 해당 사용자의 모든 활성 세션 무효화
   * 3. 사용자 정보 캐시 삭제
   *
   * @param user - JWT 페이로드에서 추출된 사용자 정보
   * @returns 삭제 성공 메시지
   *
   * @example
   * DELETE /api/v1/users/me
   * Authorization: Bearer {accessToken}
   *
   * Response:
   * {
   *   "success": true,
   *   "data": { "message": "Account successfully deleted" }
   * }
   */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteMyAccount(
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<ApiResponse<{ message: string }>> {
    this.logger.info('Account deletion requested', { userId: user.id });

    await this.userService.softDelete(user.id);

    return {
      success: true,
      data: {
        message: 'Account successfully deleted',
      },
    };
  }

  /**
   * 소프트 삭제된 계정을 복원합니다
   *
   * 삭제된 사용자의 deletedAt 필드를 null로 설정하여
   * 계정을 재활성화합니다.
   *
   * @param body - 복원할 사용자 ID를 포함한 요청 본문
   * @returns 복원된 사용자 정보와 성공 메시지
   * @throws BadRequestException userId가 누락된 경우
   *
   * @example
   * POST /api/v1/users/restore
   * Content-Type: application/json
   *
   * { "userId": "uuid-string" }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "id": "uuid",
   *     "email": "user@example.com",
   *     "name": "John Doe",
   *     "message": "Account successfully restored"
   *   }
   * }
   */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  async restoreAccount(
    @Body() body: RestoreRequestBody,
  ): Promise<ApiResponse<UserProfileResponseDto & { message: string }>> {
    if (!body.userId) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REQ_001',
          message: 'userId is required',
        },
      });
    }

    this.logger.info('Account restoration requested', { userId: body.userId });

    await this.userService.restore(body.userId);
    const profile = await this.userService.getProfile(body.userId);

    return {
      success: true,
      data: {
        ...profile,
        message: 'Account successfully restored',
      },
    };
  }
}
