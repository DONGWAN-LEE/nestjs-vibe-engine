# pp-autoclaude-rnd-be - Claude Code Project Guide

NestJS 10 기반 고성능 Backend Engine. Google OAuth + JWT 인증, MySQL/Prisma ORM, Redis 캐시, Socket.io 실시간 통신을 통합한 프로덕션 레디 API 서버.

- API Prefix: `/api/v1`
- Setup Wizard: `.env` 없으면 포트 4321에서 웹 UI 자동 실행
- Swagger: `http://localhost:3000/api-docs` (prod 환경 제외)

## 기술 스택

| 구분 | 패키지 | 버전 |
|------|--------|------|
| Framework | @nestjs/common, core, platform-express | ^10.4.0 |
| Language | typescript | ^5.7.0 |
| Database | @prisma/client, prisma | ^5.22.0 |
| DB Driver | mysql2 | ^3.16.3 |
| Auth | @nestjs/passport, @nestjs/jwt | ^10.0.3, ^10.2.0 |
| OAuth | passport-google-oauth20 | ^2.0.0 |
| Cache | ioredis | ^5.4.1 |
| WebSocket | socket.io, @nestjs/websockets | ^4.8.0, ^10.4.0 |
| Logging | winston, winston-daily-rotate-file | ^3.17.0, ^5.0.0 |
| API Docs | @nestjs/swagger | ^7.4.0 |
| Security | helmet | ^8.0.0 |
| Validation | class-validator, class-transformer | ^0.14.1, ^0.5.1 |
| Config | @nestjs/config | ^3.3.0 |
| Encryption | (native crypto) AES-256-GCM | - |
| Date | dayjs | ^1.11.13 |
| Scheduler | @nestjs/schedule | ^4.1.0 |
| Health | @nestjs/terminus | ^10.2.3 |

## 아키텍처 규칙 (MUST)

이 프로젝트에서 **절대 위반하면 안 되는** 7개 규칙:

1. **요청당 최대 3쿼리, 캐시 우선** - DB 조회 전 반드시 Redis 캐시 확인. `CACHE_KEYS`/`CACHE_TTL` 상수 사용.
2. **console.log 금지** - 반드시 `LoggerService` 사용. `logger.info()`, `logger.warn()`, `logger.error()`.
3. **N+1 쿼리 금지** - Prisma `include`/`select` 활용, 루프 안에서 DB 호출 금지.
4. **TODO 주석 금지, 무한 루프 금지** - 구현을 완료하거나, 명시적 종료 조건을 설정.
5. **UTC+0 저장, X-Timezone 헤더 변환** - DB에 UTC로 저장, 응답 시 `@Timezone()` 데코레이터로 변환.
6. **Soft Delete만 사용** - `deletedAt` 필드 설정. 물리 삭제(DELETE) 금지. `SOFT_DELETE_MODELS` 배열에 등록.
7. **모든 함수에 JSDoc** - `src/user/user.service.ts`의 JSDoc 패턴을 참조.

## 프로젝트 구조

```
src/
├── main.ts                          # 앱 진입점 (Helmet, CORS, ValidationPipe, Swagger)
├── app.module.ts                    # 루트 모듈 (전역 모듈 + RateLimitMiddleware)
├── auth/                            # Google OAuth + JWT 인증
│   ├── auth.module.ts
│   ├── auth.service.ts              # 토큰 발급/갱신/무효화, 세션 관리
│   ├── auth.controller.ts           # /auth/google, /auth/callback, /auth/refresh, /auth/logout
│   ├── strategies/                  # Passport 전략
│   │   ├── google.strategy.ts       # Google OAuth 2.0
│   │   └── jwt.strategy.ts          # JWT Bearer
│   ├── guards/
│   │   └── token-validation.guard.ts  # Redis 세션 검증 강화 Guard
│   └── dto/
├── user/                            # ** 참조 구현 모듈 **
│   ├── user.module.ts               # Module 패턴 참조
│   ├── user.controller.ts           # Controller 패턴 참조
│   ├── user.service.ts              # Service 패턴 참조 (캐시 전략)
│   ├── user.repository.ts           # Repository 패턴 참조
│   └── dto/                         # DTO 패턴 참조
├── common/                          # 공유 유틸리티
│   ├── interfaces/api-response.interface.ts  # 표준 응답 형식
│   ├── decorators/
│   │   ├── current-user.decorator.ts   # @CurrentUser()
│   │   └── timezone.decorator.ts       # @Timezone()
│   ├── guards/
│   │   ├── jwt-auth.guard.ts           # @UseGuards(JwtAuthGuard)
│   │   └── ws-auth.guard.ts            # WebSocket JWT Guard
│   ├── filters/http-exception.filter.ts  # 전역 에러 → 표준 응답 변환
│   ├── middleware/rate-limit.middleware.ts  # Redis 슬라이딩 윈도우
│   ├── interceptors/cache.interceptor.ts
│   ├── config/                      # 환경 설정 (app, jwt, redis, database)
│   └── utils.ts
├── core/                            # 인프라 모듈 (대부분 @Global)
│   ├── database/
│   │   ├── database.module.ts       # @Global PrismaService
│   │   ├── prisma.service.ts        # Prisma + Soft Delete 미들웨어
│   │   ├── soft-delete.middleware.ts # SOFT_DELETE_MODELS 배열
│   │   └── delete-migration.service.ts
│   ├── logger/
│   │   ├── logger.module.ts         # @Global LoggerService
│   │   ├── logger.service.ts        # Winston 기반
│   │   ├── log-backup.service.ts
│   │   └── transports/             # api, socket, error 전용 transport
│   ├── cache/
│   │   ├── cache.module.ts          # @Global CacheService
│   │   ├── cache.service.ts         # Redis 래퍼 (get/set/del/incr/keys)
│   │   └── cache-key.constants.ts   # CACHE_KEYS, CACHE_TTL 상수
│   ├── encryption/
│   │   ├── encryption.module.ts     # @Global EncryptionService
│   │   └── encryption.service.ts    # AES-256-GCM (이메일 암호화)
│   ├── timezone/
│   │   ├── timezone.module.ts       # @Global TimezoneService
│   │   ├── timezone.service.ts
│   │   └── timezone.interceptor.ts
│   └── socket/
│       ├── socket.module.ts
│       ├── socket.gateway.ts        # WebSocket 이벤트 핸들러
│       ├── socket-auth.adapter.ts   # JWT 핸드셰이크 인증
│       ├── room-manager.service.ts  # 룸 관리
│       └── docs/                    # WS 문서화 시스템
├── health/                          # 헬스체크 (/health)
└── setup/                           # .env Setup Wizard (포트 4321)
```

## 표준 API 응답 형식

모든 API는 `ApiResponse<T>` 인터페이스를 따릅니다 (`src/common/interfaces/api-response.interface.ts`).

```typescript
// 성공 응답
{
  "success": true,
  "data": { /* T */ },
  "meta": { /* 페이지네이션, 타임스탬프 등 (선택) */ }
}

// 실패 응답
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "Invalid authentication credentials",
    "details": { /* 추가 정보 (선택) */ }
  }
}
```

## 에러 코드 체계

| HTTP | 코드 | 의미 |
|------|------|------|
| 400 | REQ_001 | 잘못된 요청 |
| 401 | AUTH_001 | 인증 실패 |
| 403 | PERM_001 | 권한 없음 |
| 404 | NOT_001 | 리소스 없음 |
| 409 | REQ_002 | 충돌 (중복 데이터) |
| 422 | REQ_003 | 처리 불가 엔티티 |
| 429 | RATE_001 | Rate Limit 초과 |
| 500 | SRV_001 | 서버 내부 에러 |

에러 발생 시 반드시 `{ success: false, error: { code, message } }` 형식을 사용하세요:

```typescript
throw new NotFoundException({
  success: false,
  error: { code: 'NOT_001', message: 'User not found' },
});
```

## 핵심 패턴 Quick Reference

| 계층 | 패턴 | 참조 파일 |
|------|------|----------|
| Controller | `@Controller('리소스') + @UseGuards(JwtAuthGuard) + @CurrentUser()` → `{ success: true, data }` 반환 | `src/user/user.controller.ts` |
| Service | `캐시 조회 → DB 폴백 → 캐시 저장` + `NotFoundException` 에러 처리 | `src/user/user.service.ts` |
| Repository | `PrismaService` 주입, `findFirst({ where: { ..., deletedAt: null } })` | `src/user/user.repository.ts` |
| Module | `providers: [Service, Repository, LoggerService]`, `exports: [Service]` | `src/user/user.module.ts` |
| DTO | `class-validator` 데코레이터 (`@IsString`, `@IsOptional`) | `src/user/dto/update-user.dto.ts` |
| 캐시 | `CACHE_KEYS.XXX(id)` + `CACHE_TTL.XXX` 상수 사용 | `src/core/cache/cache-key.constants.ts` |

## 새 기능 추가 Quick Start

1. Prisma 모델 정의 → `prisma/schema.prisma` + `SOFT_DELETE_MODELS` 등록
2. `npx prisma generate && npx prisma db push`
3. Repository 생성 (`src/user/user.repository.ts` 참조)
4. DTO 생성 (Request: class-validator, Response: plain class)
5. Service 생성 (캐시 우선 조회, write-through, 에러 처리)
6. Controller 생성 (Guard, @CurrentUser, 표준 응답)
7. Module 생성 (`providers: [Service, Repository, LoggerService]`)
8. `app.module.ts`에 Module 등록
9. 캐시 키 등록 (`src/core/cache/cache-key.constants.ts`)
10. 테스트 작성 (`test/integration/`)

> 상세 가이드: [docs/FEATURE_GUIDE.md](docs/FEATURE_GUIDE.md)
> 코드 템플릿: [docs/API_PATTERNS.md](docs/API_PATTERNS.md)

## 모듈 전역/로컬 여부

| 모듈 | @Global | 설명 |
|------|---------|------|
| ConfigModule | Yes | 환경 변수 (forRoot) |
| DatabaseModule | Yes | PrismaService |
| LoggerModule | Yes | LoggerService (Winston) |
| EncryptionModule | Yes | EncryptionService (AES-256-GCM) |
| TimezoneModule | Yes | TimezoneService |
| CacheModule | Yes | CacheService (Redis) |
| AuthModule | No | Google OAuth + JWT |
| UserModule | No | 사용자 CRUD |
| HealthModule | No | 헬스체크 |
| SocketModule | No | WebSocket Gateway |

> 전역 모듈은 별도 import 없이 어디서든 주입 가능. 로컬 모듈의 서비스를 쓰려면 해당 모듈을 `imports`에 추가.

## 테스트

```bash
npm test                    # 단위 테스트
npm run test:watch          # Watch 모드
npm run test:cov            # 커버리지
npm run test:e2e            # E2E 테스트
```

테스트 파일 위치: `test/integration/*.integration.spec.ts`

Jest 설정:
- `globalSetup`: `test/utils/global-setup.ts`
- `globalTeardown`: `test/utils/global-teardown.ts`
- `setupFilesAfterEnv`: `test/utils/test-setup.ts`

## 커스텀 에이전트

`.claude/agents/`에 프로젝트 전용 에이전트가 7개 구성되어 있습니다:

| Agent | 역할 |
|-------|------|
| dispatcher | 컨텍스트 분석 → 전문가 에이전트 라우팅 |
| foundation-architect | NestJS 기반, Prisma, DB, 배포 |
| auth-security | Google OAuth, JWT, 보안 |
| cache-specialist | Redis, Rate Limiting, 성능 |
| realtime-engineer | Socket.io, Room, WS 문서화 |
| core-infra | Logger, Timezone, Encryption 횡단 관심사 |
| test-engineer | Jest 테스트, Mock, 커버리지 |

## 주의사항

- **Soft Delete 미들웨어**: `soft-delete.middleware.ts`의 `SOFT_DELETE_MODELS` 배열에 새 모델 추가 필수. 미등록 시 물리 삭제됨.
- **ValidationPipe**: `main.ts`에서 `whitelist: true, forbidNonWhitelisted: true` 전역 적용. DTO에 없는 필드는 자동 제거/거부.
- **RateLimitMiddleware**: `app.module.ts`에서 모든 라우트(`*`)에 전역 적용. 일반 100req/min, Auth 10req/min.
- **LoggerService 초기화**: 생성자에서 `this.logger.setContext('ClassName')` 호출 필수.
- **이메일 암호화**: 이메일은 `EncryptionService.encrypt()`로 암호화 저장, 응답 시 `decrypt()`.
- **HttpExceptionFilter**: `main.ts`가 아닌 `app.module.ts` provider로 등록 또는 throw 시 표준 형식 사용.

## 참조 문서

- [ARCHITECTURE.md](ARCHITECTURE.md) - 전체 설계 문서 (2,310줄)
- [docs/FEATURE_GUIDE.md](docs/FEATURE_GUIDE.md) - 기능 추가 단계별 가이드
- [docs/API_PATTERNS.md](docs/API_PATTERNS.md) - 복사 가능한 코드 템플릿
