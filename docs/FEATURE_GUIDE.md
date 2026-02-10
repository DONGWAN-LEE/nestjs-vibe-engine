# Feature Guide - 새 기능 추가 단계별 가이드

새 기능을 추가할 때 이 가이드를 따르세요. `src/user/` 모듈이 참조 구현입니다.
코드 템플릿은 [docs/API_PATTERNS.md](API_PATTERNS.md)에서 복사하세요.

---

## 1. 새 REST API 모듈 추가 (9 Steps)

### Step 1: Prisma 모델 정의

1. `prisma/schema.prisma`에 모델 추가
2. `src/core/database/soft-delete.middleware.ts`의 `SOFT_DELETE_MODELS` 배열에 모델명 등록

```prisma
// prisma/schema.prisma
model Task {
  id          String    @id @default(uuid())
  userId      String
  title       String
  description String?   @db.Text
  status      String    @default("pending")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?                    // Soft Delete 필수

  user        User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([deletedAt])                     // Soft Delete 인덱스 필수
}
```

```typescript
// src/core/database/soft-delete.middleware.ts
const SOFT_DELETE_MODELS: string[] = ['User', 'UserSession', 'Task'];
//                                                           ^^^^^^ 추가
```

마이그레이션 실행:
```bash
npx prisma generate
npx prisma db push          # 개발 환경
# npx prisma migrate dev    # 마이그레이션 히스토리 관리 시
```

> **주의**: `SOFT_DELETE_MODELS`에 등록하지 않으면 `delete` 호출 시 물리 삭제됩니다!

---

### Step 2: Repository 생성

> 참조: `src/user/user.repository.ts`

파일: `src/task/task.repository.ts`

핵심 패턴:
- `PrismaService` 주입
- 모든 조회에 `deletedAt: null` 필터
- CRUD + `softDelete` + `restore` + `findDeletedById` 메서드

```typescript
@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Task | null> {
    return this.prisma.task.findFirst({
      where: { id, deletedAt: null },
    });
  }
  // ... (API_PATTERNS.md의 Repository 템플릿 참조)
}
```

---

### Step 3: DTO 생성

> 참조: `src/user/dto/update-user.dto.ts`, `src/user/dto/user-response.dto.ts`

파일:
- `src/task/dto/create-task.dto.ts` - Request DTO (class-validator)
- `src/task/dto/update-task.dto.ts` - Request DTO (class-validator)
- `src/task/dto/task-response.dto.ts` - Response DTO (plain class)

핵심 패턴:
- Request DTO: `class-validator` 데코레이터 필수 (`@IsString`, `@IsOptional` 등)
- Response DTO: 타임스탬프는 ISO 8601 문자열 (`string` 타입)
- `ValidationPipe`가 전역 적용 (`whitelist: true, forbidNonWhitelisted: true`)

```typescript
// create-task.dto.ts
export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// task-response.dto.ts
export class TaskResponseDto {
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}
```

---

### Step 4: Service 생성

> 참조: `src/user/user.service.ts`

파일: `src/task/task.service.ts`

핵심 패턴:
- **캐시 우선 조회** (Cache-Aside): 캐시 확인 → DB 폴백 → 캐시 저장
- **Write-Through**: 수정/생성 후 캐시 갱신
- **캐시 무효화**: 삭제 시 캐시 삭제
- **에러 처리**: `NotFoundException({ success: false, error: { code, message } })`
- **LoggerService**: 생성자에서 `setContext()` 호출

```typescript
@Injectable()
export class TaskService {
  private readonly logger: LoggerService;

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly cacheService: CacheService,
    logger: LoggerService,
  ) {
    this.logger = logger;
    this.logger.setContext('TaskService');
  }

  // 캐시 우선 조회 패턴
  async findById(id: string): Promise<Task | null> {
    const cacheKey = CACHE_KEYS.TASK_INFO(id);
    const cached = await this.cacheService.get<Task>(cacheKey);
    if (cached) return cached;

    const task = await this.taskRepository.findById(id);
    if (task) {
      await this.cacheService.set(cacheKey, task, CACHE_TTL.TASK_INFO);
    }
    return task;
  }

  // Write-through 패턴
  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const existing = await this.taskRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_001', message: 'Task not found' },
      });
    }

    const updated = await this.taskRepository.update(id, dto);

    const cacheKey = CACHE_KEYS.TASK_INFO(id);
    await this.cacheService.del(cacheKey);
    await this.cacheService.set(cacheKey, updated, CACHE_TTL.TASK_INFO);

    return updated;
  }
}
```

---

### Step 5: Controller 생성

> 참조: `src/user/user.controller.ts`

파일: `src/task/task.controller.ts`

핵심 패턴:
- `@Controller('tasks')` (복수형)
- `@UseGuards(JwtAuthGuard)` 인증
- `@CurrentUser()` 데코레이터로 사용자 정보 추출
- 반환값: `Promise<ApiResponse<T>>` 형식, `{ success: true, data }` 구조
- JSDoc 주석 필수

---

### Step 6: Module 생성

> 참조: `src/user/user.module.ts`

파일: `src/task/task.module.ts`

```typescript
@Module({
  controllers: [TaskController],
  providers: [TaskService, TaskRepository, LoggerService],
  exports: [TaskService],  // 다른 모듈에서 사용할 경우
})
export class TaskModule {}
```

> 전역 모듈(PrismaService, CacheService, EncryptionService, TimezoneService)은 `imports`에 추가 불필요.
> 로컬 모듈(AuthModule, UserModule 등)의 서비스가 필요하면 해당 모듈을 `imports`에 추가.

---

### Step 7: app.module.ts 등록

`src/app.module.ts`의 `imports` 배열에 추가:

```typescript
import { TaskModule } from './task/task.module';

@Module({
  imports: [
    // ... 기존 모듈
    TaskModule,  // 추가
  ],
})
```

---

### Step 8: 캐시 키 등록

`src/core/cache/cache-key.constants.ts`에 추가:

```typescript
export const CACHE_KEYS = {
  // ... 기존 키
  TASK_INFO: (taskId: string) => `task_info:${taskId}`,
  TASK_LIST: (userId: string) => `task_list:${userId}`,
} as const;

export const CACHE_TTL = {
  // ... 기존 TTL
  TASK_INFO: 3600,     // 1시간
  TASK_LIST: 300,      // 5분
} as const;
```

---

### Step 9: 테스트 작성

파일: `test/integration/task.integration.spec.ts`

핵심 패턴:
- `Test.createTestingModule`으로 테스트 모듈 구성
- Repository, CacheService, LoggerService를 Mock
- 캐시 히트/미스 시나리오 테스트
- 에러 케이스 (NotFoundException) 테스트
- Soft Delete + 캐시 무효화 테스트

> 테스트 템플릿: [API_PATTERNS.md - 12. 테스트 템플릿](API_PATTERNS.md#12-테스트-템플릿) 참조

---

### 완료 체크리스트

새 REST API 모듈을 추가한 후 아래 항목을 모두 확인하세요:

- [ ] `prisma/schema.prisma`에 모델 정의 + `deletedAt` 필드
- [ ] `SOFT_DELETE_MODELS` 배열에 모델명 등록
- [ ] `npx prisma generate` 실행
- [ ] Repository: 모든 조회에 `deletedAt: null` 필터
- [ ] DTO: class-validator 데코레이터, Response는 ISO 8601 문자열
- [ ] Service: 캐시 우선 조회 + Write-through + 에러 처리
- [ ] Controller: `@UseGuards(JwtAuthGuard)`, `{ success: true, data }` 응답
- [ ] Module: `providers`에 `LoggerService` 포함
- [ ] `app.module.ts`에 Module 등록
- [ ] `cache-key.constants.ts`에 CACHE_KEYS + CACHE_TTL 추가
- [ ] 모든 함수에 JSDoc 작성
- [ ] `console.log` 사용 없음 → `LoggerService` 사용

---

## 2. 새 WebSocket 이벤트 추가 (4 Steps)

### Step 1: 페이로드 인터페이스 정의

`src/core/socket/socket.gateway.ts`에 인터페이스 추가 (또는 별도 파일):

```typescript
interface {EventName}Payload {
  roomId: string;
  // 추가 필드
}
```

### Step 2: @SubscribeMessage 핸들러 작성

`socket.gateway.ts`에 메서드 추가:

```typescript
@SubscribeMessage('{namespace}:{action}')
async handle{Action}(
  @MessageBody() data: {EventName}Payload,
  @ConnectedSocket() socket: Socket,
): Promise<{ success: boolean; error?: string }> {
  const userId = socket.data.userId as string;

  // 1. 입력 검증
  // 2. 비즈니스 로직
  // 3. 브로드캐스트 (socket.to(roomId).emit)
  // 4. 로깅

  return { success: true };
}
```

이벤트 이름 규칙: `{namespace}:{action}` (예: `room:join`, `chat:send`, `task:update`)

### Step 3: Server-to-Client 이벤트 전송 메서드

필요 시 gateway에 전송 메서드 추가:

```typescript
send{EventName}ToUser(userId: string, payload: any): void {
  this.server.to(`user:${userId}`).emit('{event:name}', {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}
```

### Step 4: WS 문서화 (선택)

`src/core/socket/docs/decorators/ws-event.decorator.ts`의 `@WsEvent` 데코레이터를 사용하여 문서화:

```typescript
@WsEvent({
  name: '{namespace}:{action}',
  description: '이벤트 설명',
  payload: { /* 페이로드 스키마 */ },
  response: { /* 응답 스키마 */ },
})
```

### WebSocket 이벤트 체크리스트

- [ ] 페이로드 인터페이스에 JSDoc
- [ ] 입력 검증 (roomId 유효성 등)
- [ ] `socket.data.userId`로 사용자 식별
- [ ] `LoggerService`로 로깅
- [ ] Room 멤버십 확인 (`roomManager.isInRoom`)
- [ ] 타임스탬프: `new Date().toISOString()`

---

## 3. 새 Guard 추가

> 참조: `src/auth/guards/token-validation.guard.ts`

파일 위치 규칙:
- 전역 Guard → `src/common/guards/`
- 도메인 전용 Guard → `src/{domain}/guards/`

```typescript
@Injectable()
export class MyGuard implements CanActivate {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.logger.setContext('MyGuard');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // 검증 로직
    // 실패 시: throw new ForbiddenException({ success: false, error: { code: 'PERM_001', message: '...' } })
    return true;
  }
}
```

사용: `@UseGuards(JwtAuthGuard, MyGuard)` - JwtAuthGuard 다음에 체이닝

---

## 4. 새 Middleware 추가

> 참조: `src/common/middleware/rate-limit.middleware.ts`

```typescript
@Injectable()
export class MyMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('MyMiddleware');
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // 미들웨어 로직
    next();
  }
}
```

등록 (`app.module.ts`):

```typescript
configure(consumer: MiddlewareConsumer): void {
  consumer.apply(RateLimitMiddleware).forRoutes('*');
  consumer.apply(MyMiddleware).forRoutes('tasks');  // 특정 라우트
}
```

---

## 5. 새 Decorator 추가

> 참조: `src/common/decorators/current-user.decorator.ts`, `timezone.decorator.ts`

파일 위치: `src/common/decorators/`

```typescript
export const MyDecorator = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // 추출 로직
    return value;
  },
);
```

---

## 6. 새 Interceptor 추가

> 참조: `src/common/interceptors/cache.interceptor.ts`

```typescript
@Injectable()
export class MyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Before handler
    return next.handle().pipe(
      map(data => {
        // After handler - 응답 변환
        return data;
      }),
    );
  }
}
```

---

## 공통 주의사항

### LoggerService 초기화
모든 Injectable 클래스에서 생성자에서 반드시 호출:
```typescript
constructor(logger: LoggerService) {
  this.logger = logger;
  this.logger.setContext('ClassName');  // 클래스명과 동일
}
```

### 에러 응답 형식
반드시 표준 형식을 사용:
```typescript
throw new XxxException({
  success: false,
  error: { code: 'XXX_NNN', message: 'Human-readable message' },
});
```

에러 코드 매핑: `REQ_001`(400), `AUTH_001`(401), `PERM_001`(403), `NOT_001`(404), `REQ_002`(409), `RATE_001`(429), `SRV_001`(500)

### 캐시 전략
- **조회**: Cache-Aside (캐시 → DB → 캐시 저장)
- **생성/수정**: Write-Through (DB 저장 → 캐시 갱신)
- **삭제**: Cache Invalidation (DB 삭제 → 캐시 삭제)
- **장애**: 캐시 실패 시 DB 직접 조회 (graceful degradation)

### 파일 구조 규칙
```
src/{resource}/
  ├── {resource}.module.ts
  ├── {resource}.controller.ts
  ├── {resource}.service.ts
  ├── {resource}.repository.ts
  └── dto/
      ├── create-{resource}.dto.ts
      ├── update-{resource}.dto.ts
      └── {resource}-response.dto.ts
```
