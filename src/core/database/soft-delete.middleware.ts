/**
 * Soft Delete Prisma 미들웨어
 *
 * Prisma Client에 적용하여 전역적으로 Soft Delete를 처리합니다.
 * - findMany/findFirst/findUnique 조회 시 deletedAt: null 조건 자동 적용
 * - delete/deleteMany 호출 시 deletedAt = NOW()로 자동 전환
 *
 * ARCHITECTURE.md Section 5.3 - Soft Delete 전략 기반 구현
 *
 * @example
 * ```typescript
 * const prisma = new PrismaClient();
 * applySoftDeleteMiddleware(prisma);
 * ```
 *
 * @module core/database
 */

import { Prisma } from '@prisma/client';

/** Soft Delete가 적용되는 모델 목록 */
const SOFT_DELETE_MODELS: string[] = ['User', 'UserSession'];

/**
 * Prisma Client에 Soft Delete 미들웨어를 적용합니다
 *
 * @description
 * 1. 조회 작업(findFirst, findMany, findUnique, findUniqueOrThrow, findFirstOrThrow, count):
 *    deletedAt: null 조건을 자동으로 주입하여 삭제된 데이터를 제외합니다.
 *    where 절에 이미 deletedAt 조건이 있는 경우 사용자 지정 조건을 유지합니다.
 *
 * 2. 삭제 작업(delete, deleteMany):
 *    실제 삭제 대신 deletedAt을 현재 시각으로 설정하는 update로 전환합니다.
 *
 * @param prisma - Prisma Client 인스턴스 (타입 안전하게 $use 메서드 사용)
 */
export function applySoftDeleteMiddleware(
  prisma: { $use: (middleware: Prisma.Middleware) => void },
): void {
  prisma.$use(async (params: Prisma.MiddlewareParams, next) => {
    if (!params.model || !SOFT_DELETE_MODELS.includes(params.model)) {
      return next(params);
    }

    const readActions = [
      'findFirst',
      'findMany',
      'findUnique',
      'findUniqueOrThrow',
      'findFirstOrThrow',
      'count',
    ];

    if (readActions.includes(params.action)) {
      if (!params.args) {
        params.args = {};
      }
      if (!params.args.where) {
        params.args.where = {};
      }

      if (params.args.where.deletedAt === undefined) {
        params.args.where.deletedAt = null;
      }
    }

    if (params.action === 'delete') {
      params.action = 'update';
      params.args['data'] = { deletedAt: new Date() };
    }

    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      if (!params.args) {
        params.args = {};
      }
      params.args['data'] = { deletedAt: new Date() };
    }

    return next(params);
  });
}
