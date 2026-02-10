# API Patterns - Copy-Paste Templates

실제 프로젝트 코드에서 추출한 복사 붙여넣기 가능한 템플릿.
새 기능 추가 시 이 파일의 템플릿을 복사하고, `{Resource}`/`{resource}` 를 실제 이름으로 교체하세요.

> 참조 구현: `src/user/` 모듈 전체

---

## 1. Controller 템플릿

> 참조: `src/user/user.controller.ts`

```typescript
/**
 * {Resource} 컨트롤러
 *
 * {Resource} 도메인의 REST API 엔드포인트를 제공합니다.
 *
 * @module {resource}
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { {Resource}Service } from './{resource}.service';
import { Create{Resource}Dto } from './dto/create-{resource}.dto';
import { Update{Resource}Dto } from './dto/update-{resource}.dto';
import { {Resource}ResponseDto } from './dto/{resource}-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoggerService } from '../core/logger/logger.service';
import { ApiResponse } from '../common/interfaces/api-response.interface';

/**
 * JWT 페이로드에서 추출되는 사용자 정보
 */
interface JwtPayloadUser {
  id: string;
  email: string;
}

@Controller('{resources}')  // 복수형 사용
export class {Resource}Controller {
  private readonly logger: LoggerService;

  constructor(
    private readonly {resource}Service: {Resource}Service,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('{Resource}Controller');
  }

  /**
   * {Resource} 목록을 조회합니다
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<ApiResponse<{Resource}ResponseDto[]>> {
    this.logger.info('{Resource} list requested', { userId: user.id });

    const items = await this.{resource}Service.findAll(user.id);

    return {
      success: true,
      data: items,
    };
  }

  /**
   * {Resource}를 ID로 조회합니다
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<ApiResponse<{Resource}ResponseDto>> {
    this.logger.info('{Resource} requested', { id, userId: user.id });

    const item = await this.{resource}Service.findById(id);

    return {
      success: true,
      data: item,
    };
  }

  /**
   * 새 {Resource}를 생성합니다
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: Create{Resource}Dto,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<ApiResponse<{Resource}ResponseDto>> {
    this.logger.info('{Resource} creation requested', { userId: user.id });

    const created = await this.{resource}Service.create(user.id, dto);

    return {
      success: true,
      data: created,
    };
  }

  /**
   * {Resource}를 수정합니다
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: Update{Resource}Dto,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<ApiResponse<{Resource}ResponseDto>> {
    this.logger.info('{Resource} update requested', { id, userId: user.id });

    const updated = await this.{resource}Service.update(id, dto);

    return {
      success: true,
      data: updated,
    };
  }

  /**
   * {Resource}를 삭제합니다 (Soft Delete)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<ApiResponse<{ message: string }>> {
    this.logger.info('{Resource} deletion requested', { id, userId: user.id });

    await this.{resource}Service.softDelete(id);

    return {
      success: true,
      data: { message: '{Resource} successfully deleted' },
    };
  }
}
```

### Guard 적용 3패턴

```typescript
// 패턴 1: JWT 인증만
@UseGuards(JwtAuthGuard)
async getProfile() { }

// 패턴 2: JWT + Redis 세션 검증
@UseGuards(JwtAuthGuard, TokenValidationGuard)
async logout() { }

// 패턴 3: Google OAuth (AuthController 전용)
@UseGuards(AuthGuard('google'))
async googleLogin() { }
```

---

## 2. Service 템플릿

> 참조: `src/user/user.service.ts`

```typescript
/**
 * {Resource} 서비스
 *
 * {Resource} 도메인의 비즈니스 로직을 처리합니다.
 * 캐시 우선 조회, Soft Delete, 에러 처리를 포함합니다.
 *
 * @module {resource}
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { {Resource} } from '@prisma/client';
import { {Resource}Repository } from './{resource}.repository';
import { CacheService } from '../core/cache/cache.service';
import { LoggerService } from '../core/logger/logger.service';
import { CACHE_KEYS, CACHE_TTL } from '../core/cache/cache-key.constants';
import { Create{Resource}Dto } from './dto/create-{resource}.dto';
import { Update{Resource}Dto } from './dto/update-{resource}.dto';

@Injectable()
export class {Resource}Service {
  private readonly logger: LoggerService;

  constructor(
    private readonly {resource}Repository: {Resource}Repository,
    private readonly cacheService: CacheService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('{Resource}Service');
  }

  /**
   * ID로 {Resource}를 조회합니다 (캐시 우선)
   *
   * 1. Redis 캐시 확인
   * 2. 캐시 미스 시 DB 조회
   * 3. DB 결과를 캐시에 저장
   */
  async findById(id: string): Promise<{Resource} | null> {
    const cacheKey = CACHE_KEYS.{RESOURCE}_INFO(id);
    const cached = await this.cacheService.get<{Resource}>(cacheKey);

    if (cached) {
      this.logger.debug('{Resource} found in cache', { id });
      return cached;
    }

    const item = await this.{resource}Repository.findById(id);

    if (item) {
      await this.cacheService.set(cacheKey, item, CACHE_TTL.{RESOURCE}_INFO);
    }

    return item;
  }

  /**
   * 새 {Resource}를 생성합니다
   */
  async create(userId: string, dto: Create{Resource}Dto): Promise<{Resource}> {
    const item = await this.{resource}Repository.create({
      ...dto,
      userId,
    });

    // Write-through: 생성 후 캐시에 즉시 저장
    const cacheKey = CACHE_KEYS.{RESOURCE}_INFO(item.id);
    await this.cacheService.set(cacheKey, item, CACHE_TTL.{RESOURCE}_INFO);

    this.logger.info('{Resource} created', { id: item.id, userId });
    return item;
  }

  /**
   * {Resource}를 수정합니다 (Write-through 캐시)
   */
  async update(id: string, dto: Update{Resource}Dto): Promise<{Resource}> {
    const existing = await this.{resource}Repository.findById(id);

    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_001', message: '{Resource} not found' },
      });
    }

    const updated = await this.{resource}Repository.update(id, dto);

    // Write-through: 기존 캐시 삭제 → 새 데이터로 갱신
    const cacheKey = CACHE_KEYS.{RESOURCE}_INFO(id);
    await this.cacheService.del(cacheKey);
    await this.cacheService.set(cacheKey, updated, CACHE_TTL.{RESOURCE}_INFO);

    this.logger.info('{Resource} updated', { id, fields: Object.keys(dto) });
    return updated;
  }

  /**
   * {Resource}를 소프트 삭제합니다
   */
  async softDelete(id: string): Promise<{Resource}> {
    const existing = await this.{resource}Repository.findById(id);

    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_001', message: '{Resource} not found' },
      });
    }

    const deleted = await this.{resource}Repository.softDelete(id);

    // 캐시 무효화
    const cacheKey = CACHE_KEYS.{RESOURCE}_INFO(id);
    await this.cacheService.del(cacheKey);

    this.logger.info('{Resource} soft deleted', { id });
    return deleted;
  }
}
```

---

## 3. Repository 템플릿

> 참조: `src/user/user.repository.ts`

```typescript
/**
 * {Resource} 리포지토리
 *
 * Prisma 기반의 {Resource} 데이터 접근 계층입니다.
 *
 * @module {resource}
 */

import { Injectable } from '@nestjs/common';
import { {Resource} } from '@prisma/client';
import { PrismaService } from '../core/database/prisma.service';

@Injectable()
export class {Resource}Repository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ID로 활성 {Resource}를 조회합니다
   */
  async findById(id: string): Promise<{Resource} | null> {
    return this.prisma.{resource}.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * 사용자의 활성 {Resource} 목록을 조회합니다
   */
  async findByUserId(userId: string): Promise<{Resource}[]> {
    return this.prisma.{resource}.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 새 {Resource}를 생성합니다
   */
  async create(data: {
    userId: string;
    // ... 추가 필드
  }): Promise<{Resource}> {
    return this.prisma.{resource}.create({ data });
  }

  /**
   * {Resource}를 수정합니다
   */
  async update(
    id: string,
    data: Partial<{ /* 수정 가능 필드 */ }>,
  ): Promise<{Resource}> {
    return this.prisma.{resource}.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  /**
   * {Resource}를 소프트 삭제합니다
   */
  async softDelete(id: string): Promise<{Resource}> {
    return this.prisma.{resource}.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 소프트 삭제된 {Resource}를 복원합니다
   */
  async restore(id: string): Promise<{Resource}> {
    return this.prisma.{resource}.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  /**
   * 소프트 삭제된 {Resource}를 조회합니다
   */
  async findDeletedById(id: string): Promise<{Resource} | null> {
    return this.prisma.{resource}.findFirst({
      where: { id, deletedAt: { not: null } },
    });
  }
}
```

---

## 4. Module 템플릿

> 참조: `src/user/user.module.ts`

```typescript
/**
 * {Resource} 모듈
 *
 * @module {resource}
 */

import { Module } from '@nestjs/common';
import { {Resource}Controller } from './{resource}.controller';
import { {Resource}Service } from './{resource}.service';
import { {Resource}Repository } from './{resource}.repository';
import { LoggerService } from '../core/logger/logger.service';

@Module({
  controllers: [{Resource}Controller],
  providers: [{Resource}Service, {Resource}Repository, LoggerService],
  exports: [{Resource}Service],
})
export class {Resource}Module {}
```

### 외부 모듈 의존성이 있는 경우

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';  // 로컬 모듈 import 필요
// 전역 모듈(PrismaService, CacheService 등)은 import 불필요

@Module({
  imports: [AuthModule],  // 로컬 모듈만 imports에 추가
  controllers: [{Resource}Controller],
  providers: [{Resource}Service, {Resource}Repository, LoggerService],
  exports: [{Resource}Service],
})
export class {Resource}Module {}
```

---

## 5. DTO 템플릿

### Request DTO (class-validator)

> 참조: `src/user/dto/update-user.dto.ts`

```typescript
/**
 * {Resource} 생성 DTO
 *
 * @module {resource}/dto
 */

import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsEmail,
  IsUUID,
  IsEnum,
  IsArray,
  IsUrl,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class Create{Resource}Dto {
  /** 필수 문자열 필드 */
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  /** 선택적 문자열 필드 */
  @IsOptional()
  @IsString()
  description?: string;

  /** 선택적 불리언 필드 */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class Update{Resource}Dto {
  /** 모든 필드를 선택적으로 */
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

### class-validator 자주 쓰는 데코레이터

| 데코레이터 | 용도 |
|-----------|------|
| `@IsString()` | 문자열 검증 |
| `@IsNotEmpty()` | 빈 값 금지 |
| `@IsOptional()` | 선택적 필드 |
| `@IsBoolean()` | 불리언 검증 |
| `@IsNumber()` | 숫자 검증 |
| `@IsEmail()` | 이메일 형식 |
| `@IsUUID()` | UUID 형식 |
| `@IsEnum(MyEnum)` | Enum 검증 |
| `@IsArray()` | 배열 검증 |
| `@IsUrl()` | URL 형식 |
| `@MinLength(n)` | 최소 길이 |
| `@MaxLength(n)` | 최대 길이 |
| `@Min(n)` | 최소값 |
| `@Max(n)` | 최대값 |

### Response DTO

> 참조: `src/user/dto/user-response.dto.ts`

```typescript
/**
 * {Resource} 응답 DTO
 *
 * @module {resource}/dto
 */

export class {Resource}ResponseDto {
  /** 고유 식별자 */
  id: string;

  /** 제목 */
  title: string;

  /** 설명 */
  description?: string;

  /** 생성 시각 (ISO 8601) */
  createdAt: string;

  /** 수정 시각 (ISO 8601) */
  updatedAt: string;
}
```

---

## 6. Prisma 모델 템플릿

> 참조: `prisma/schema.prisma`

```prisma
model {Resource} {
  id          String    @id @default(uuid())
  userId      String
  title       String
  description String?   @db.Text
  isPublic    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?                    // Soft Delete 필수

  // Relations
  user        User      @relation(fields: [userId], references: [id])

  // Indexes
  @@index([userId])
  @@index([deletedAt])                     // Soft Delete 인덱스 필수
}
```

### Soft Delete 등록 (필수!)

`src/core/database/soft-delete.middleware.ts`에서 `SOFT_DELETE_MODELS` 배열에 모델명을 추가:

```typescript
const SOFT_DELETE_MODELS: string[] = ['User', 'UserSession', '{Resource}'];
//                                                            ^^^^^^^^^^^ 추가
```

### User 모델에 Relation 추가 (필요 시)

```prisma
model User {
  // ... 기존 필드
  {resources}  {Resource}[]     // Relation 추가
}
```

---

## 7. 캐시 키 등록 템플릿

> 참조: `src/core/cache/cache-key.constants.ts`

### CACHE_KEYS에 추가

```typescript
export const CACHE_KEYS = {
  // ... 기존 키들

  /**
   * {Resource} 정보 캐시 키
   * @param {resource}Id - {Resource} 고유 식별자
   */
  {RESOURCE}_INFO: ({resource}Id: string) => `{resource}_info:${{{resource}Id}}`,

  /**
   * 사용자별 {Resource} 목록 캐시 키
   * @param userId - 사용자 고유 식별자
   */
  {RESOURCE}_LIST: (userId: string) => `{resource}_list:${userId}`,
} as const;
```

### CACHE_TTL에 추가

```typescript
export const CACHE_TTL = {
  // ... 기존 TTL

  /** {Resource} 정보: 1시간 */
  {RESOURCE}_INFO: 3600,

  /** {Resource} 목록: 5분 */
  {RESOURCE}_LIST: 300,
} as const;
```

---

## 8. Guard 템플릿

> 참조: `src/auth/guards/token-validation.guard.ts`

```typescript
/**
 * {Resource} 접근 권한 가드
 *
 * @module {resource}/guards
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { LoggerService } from '../../core/logger/logger.service';

@Injectable()
export class {Resource}OwnerGuard implements CanActivate {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.logger.setContext('{Resource}OwnerGuard');
  }

  /**
   * 리소스 소유자 검증
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceId = request.params.id;

    if (!user?.id) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'PERM_001', message: 'Access denied' },
      });
    }

    // 리소스 소유권 검증 로직 구현
    // ...

    return true;
  }
}
```

---

## 9. Decorator 템플릿

> 참조: `src/common/decorators/current-user.decorator.ts`

### Param Decorator

```typescript
/**
 * {파라미터명} 데코레이터
 *
 * @example
 * @Get()
 * handler(@{DecoratorName}() value: string) { }
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const {DecoratorName} = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();

    // 헤더에서 추출 (Timezone 패턴)
    const headerValue = request.headers['x-{header-name}'] as string;
    return headerValue || 'default-value';

    // 또는 request.user에서 추출 (CurrentUser 패턴)
    // const user = request.user;
    // return data ? (user as Record<string, unknown>)[data] : user;
  },
);
```

---

## 10. WebSocket 이벤트 템플릿

> 참조: `src/core/socket/socket.gateway.ts`

### @SubscribeMessage 핸들러

```typescript
/**
 * {event:name} 이벤트를 처리합니다
 */
@SubscribeMessage('{event:name}')
async handle{EventName}(
  @MessageBody() data: { /* 페이로드 */ },
  @ConnectedSocket() socket: Socket,
): Promise<{ success: boolean; error?: string }> {
  const userId = socket.data.userId as string;

  // 검증
  if (!data.roomId) {
    return { success: false, error: 'roomId is required' };
  }

  // 비즈니스 로직
  // ...

  // 다른 클라이언트에게 브로드캐스트
  socket.to(data.roomId).emit('{event:result}', {
    userId,
    timestamp: new Date().toISOString(),
    // ...data
  });

  this.logger.info('{EventName} processed', { userId, roomId: data.roomId });

  return { success: true };
}
```

### Server-to-Client 이벤트 전송

```typescript
/**
 * 특정 사용자에게 이벤트를 전송합니다
 */
send{EventName}ToUser(userId: string, payload: {EventPayload}): void {
  const userRoom = `user:${userId}`;
  this.server.to(userRoom).emit('{event:name}', {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 전체 사용자에게 브로드캐스트합니다
 */
broadcast{EventName}(payload: {EventPayload}): void {
  this.server.to('broadcast:all').emit('{event:name}', {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}
```

### 현재 등록된 WebSocket 이벤트

| 이벤트 | 방향 | 페이로드 |
|--------|------|---------|
| `room:join` | Client→Server | `{ roomId }` |
| `room:leave` | Client→Server | `{ roomId }` |
| `chat:send` | Client→Server | `{ roomId, content }` |
| `ping` | Client→Server | (없음) |
| `room:user_joined` | Server→Client | `{ roomId, userId, socketId, timestamp }` |
| `room:user_left` | Server→Client | `{ roomId, userId, socketId, timestamp }` |
| `chat:message` | Server→Client | `{ messageId, roomId, userId, content, timestamp }` |
| `notification` | Server→Client | `{ type, title, message, data?, timestamp }` |
| `force_logout` | Server→Client | `{ reason, newDeviceInfo?, timestamp }` |
| `connected` | Server→Client | `{ socketId, userId, rooms }` |

---

## 11. Logger 사용 가이드

> 참조: `src/core/logger/logger.service.ts`

### 초기화 (필수)

```typescript
@Injectable()
export class MyService {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.logger.setContext('MyService');  // 클래스명과 동일하게
  }
}
```

### 로그 레벨별 사용

```typescript
// 일반 정보 (비즈니스 이벤트)
this.logger.info('User created', { userId: user.id, email: profile.email });

// 디버그 (캐시 히트, 내부 상태)
this.logger.debug('Cache hit', { key: cacheKey });

// 경고 (예상된 실패, rate limit 등)
this.logger.warn('Rate limit exceeded', { identifier, endpoint, currentCount });

// 에러 (예외, 장애)
this.logger.error('Failed to connect to Redis', {
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
});
```

### 메타데이터 컨벤션

```typescript
// 사용자 관련
{ userId: string, email?: string }

// 리소스 관련
{ id: string, fields?: string[] }

// 에러 관련
{ error: string, stack?: string, statusCode?: number }

// 캐시 관련
{ key: string, ttl?: number }

// Rate Limit 관련
{ identifier: string, endpoint: string, currentCount: number, limit: number }
```

---

## 12. 테스트 템플릿

### 통합 테스트 기본 구조

> 참조: `test/integration/user.integration.spec.ts`

```typescript
/**
 * {Resource} 통합 테스트
 */

import { Test, TestingModule } from '@nestjs/testing';
import { {Resource}Service } from '../../src/{resource}/{resource}.service';
import { {Resource}Repository } from '../../src/{resource}/{resource}.repository';
import { CacheService } from '../../src/core/cache/cache.service';
import { LoggerService } from '../../src/core/logger/logger.service';

describe('{Resource}Service', () => {
  let service: {Resource}Service;
  let repository: jest.Mocked<{Resource}Repository>;
  let cacheService: jest.Mocked<CacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {Resource}Service,
        {
          provide: {Resource}Repository,
          useValue: {
            findById: jest.fn(),
            findByUserId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<{Resource}Service>({Resource}Service);
    repository = module.get({Resource}Repository);
    cacheService = module.get(CacheService);
  });

  describe('findById', () => {
    it('should return cached data if available', async () => {
      const mockData = { id: 'test-id', title: 'Test' };
      cacheService.get.mockResolvedValue(mockData);

      const result = await service.findById('test-id');

      expect(result).toEqual(mockData);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache on cache miss', async () => {
      const mockData = { id: 'test-id', title: 'Test' };
      cacheService.get.mockResolvedValue(null);
      repository.findById.mockResolvedValue(mockData as any);

      const result = await service.findById('test-id');

      expect(result).toEqual(mockData);
      expect(repository.findById).toHaveBeenCalledWith('test-id');
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should throw NotFoundException if not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.softDelete('non-existent'))
        .rejects.toThrow();
    });

    it('should delete and invalidate cache', async () => {
      repository.findById.mockResolvedValue({ id: 'test-id' } as any);
      repository.softDelete.mockResolvedValue({ id: 'test-id' } as any);

      await service.softDelete('test-id');

      expect(repository.softDelete).toHaveBeenCalledWith('test-id');
      expect(cacheService.del).toHaveBeenCalled();
    });
  });
});
```

### Mock Factory 패턴

```typescript
/**
 * LoggerService Mock (모든 테스트에서 재사용)
 */
const createMockLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  verbose: jest.fn(),
});

/**
 * CacheService Mock
 */
const createMockCacheService = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(false),
  incr: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  isConnected: jest.fn().mockReturnValue(true),
});

/**
 * PrismaService Mock
 */
const createMockPrismaService = () => ({
  {resource}: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});
```

---

## 부록: 에러 throw 패턴

프로젝트 전체에서 일관된 에러 응답을 위해 반드시 이 형식을 사용하세요:

```typescript
// 404 Not Found
throw new NotFoundException({
  success: false,
  error: { code: 'NOT_001', message: '{Resource} not found' },
});

// 400 Bad Request
throw new BadRequestException({
  success: false,
  error: { code: 'REQ_001', message: 'Invalid input data' },
});

// 401 Unauthorized
throw new UnauthorizedException({
  success: false,
  error: { code: 'AUTH_001', message: 'Invalid authentication credentials' },
});

// 403 Forbidden
throw new ForbiddenException({
  success: false,
  error: { code: 'PERM_001', message: 'Insufficient permissions' },
});

// 409 Conflict
throw new ConflictException({
  success: false,
  error: { code: 'REQ_002', message: 'Resource already exists' },
});
```

---

## 부록: app.module.ts 등록

새 모듈을 생성한 후 반드시 `src/app.module.ts`의 `imports` 배열에 추가:

```typescript
import { {Resource}Module } from './{resource}/{resource}.module';

@Module({
  imports: [
    // ... 기존 모듈들
    {Resource}Module,  // 추가
  ],
})
export class AppModule implements NestModule { }
```
