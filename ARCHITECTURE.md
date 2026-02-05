# NestJS Backend Engine 아키텍처 설계 지침서

## 1. 프로젝트 개요

### 1.1 목적
- 다양한 서비스(게임, 채팅, 협업 도구 등)의 기반이 되는 **범용 Backend Engine** 개발
- 1000명+ 동시 접속자를 처리할 수 있는 고성능, 저부하 시스템

### 1.2 기술 스택
| 구분 | 기술 |
|------|------|
| Framework | NestJS |
| Database | MySQL (Primary), Redis (Cache/NoSQL) |
| ORM | Prisma |
| 실시간 통신 | Socket.io + Redis Adapter |
| 인증 | Google OAuth + JWT |
| API 방식 | RESTful API + WebSocket |

### 1.3 핵심 설계 원칙
1. **쿼리 최소화**: 클라이언트 요청당 최대 3개 쿼리 이내
2. **캐시 우선**: 자주 조회되는 데이터는 Redis 캐시 활용
3. **수평 확장**: LB를 통한 다중 서버 운영 지원
4. **직관적 코드**: 초보 개발자도 이해할 수 있는 명확한 구조
5. **무한 루프 금지**: 모든 반복문에 종료 조건 명시

---

## 2. 프로젝트 구조 (Feature-based)

```
src/
├── main.ts
├── app.module.ts
├── common/                     # 공통 모듈
│   ├── config/                 # 환경 설정
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   ├── jwt.config.ts
│   │   └── sharding.config.ts
│   ├── decorators/             # 커스텀 데코레이터
│   ├── filters/                # Exception Filters
│   │   └── http-exception.filter.ts
│   ├── guards/                 # Auth Guards
│   │   ├── jwt-auth.guard.ts
│   │   └── ws-auth.guard.ts
│   ├── interceptors/           # Interceptors
│   │   └── cache.interceptor.ts
│   ├── middleware/             # Middleware
│   │   └── rate-limit.middleware.ts
│   ├── interfaces/             # 공통 인터페이스
│   └── utils/                  # 유틸리티 함수
│
├── core/                       # 핵심 인프라 모듈
│   ├── database/               # 데이터베이스 모듈
│   │   ├── database.module.ts
│   │   ├── prisma.service.ts
│   │   ├── soft-delete.middleware.ts
│   │   ├── delete-migration.service.ts  # Soft Delete → Delete DB 이관
│   │   └── sharding/
│   │       ├── shard-manager.service.ts
│   │       └── shard-resolver.service.ts
│   ├── cache/                  # 캐시 모듈
│   │   ├── cache.module.ts
│   │   ├── cache.service.ts
│   │   └── cache-key.constants.ts
│   ├── logger/                 # 로깅 모듈
│   │   ├── logger.module.ts
│   │   ├── logger.service.ts
│   │   ├── log-backup.service.ts       # 1개월 지난 로그 백업
│   │   └── transports/
│   │       ├── api.transport.ts
│   │       ├── socket.transport.ts
│   │       └── error.transport.ts
│   ├── timezone/               # 타임존 모듈
│   │   ├── timezone.module.ts
│   │   ├── timezone.service.ts
│   │   └── timezone.interceptor.ts     # Response 시간 변환
│   ├── encryption/             # 암호화 모듈
│   │   ├── encryption.module.ts
│   │   └── encryption.service.ts
│   ├── upload/                 # 파일 업로드 모듈
│   │   ├── upload.module.ts
│   │   ├── upload.service.ts
│   │   ├── strategies/
│   │   │   ├── local.strategy.ts
│   │   │   └── s3.strategy.ts
│   │   └── upload.config.ts
│   ├── mail/                   # 이메일 모듈
│   │   ├── mail.module.ts
│   │   ├── mail.service.ts
│   │   └── templates/
│   ├── i18n/                   # 다국어 모듈 (확장 가능 구조)
│   │   ├── i18n.module.ts
│   │   ├── i18n.service.ts
│   │   └── locales/
│   │       ├── ko.json
│   │       └── en.json
│   └── socket/                 # Socket.io 모듈
│       ├── socket.module.ts
│       ├── socket.gateway.ts
│       ├── socket-auth.adapter.ts
│       ├── room-manager.service.ts
│       └── docs/                       # WebSocket 문서화
│           ├── ws-docs.module.ts
│           ├── ws-docs.controller.ts
│           ├── ws-docs.service.ts
│           ├── decorators/
│           │   ├── ws-event.decorator.ts
│           │   ├── ws-payload.decorator.ts
│           │   └── ws-response.decorator.ts
│           ├── interfaces/
│           │   ├── ws-event-metadata.interface.ts
│           │   └── ws-docs-options.interface.ts
│           └── templates/
│               └── ws-docs.html         # 문서 UI 템플릿
│
├── auth/                       # 인증 모듈
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   ├── google.strategy.ts
│   │   └── jwt.strategy.ts
│   ├── guards/
│   │   └── token-validation.guard.ts
│   └── dto/
│
├── user/                       # 유저 모듈
│   ├── user.module.ts
│   ├── user.controller.ts
│   ├── user.service.ts
│   ├── user.repository.ts
│   └── dto/
│
└── health/                     # 헬스체크 모듈
    ├── health.module.ts
    └── health.controller.ts

prisma/
├── schema.prisma
└── migrations/

scripts/
├── init-project.ts         # CLI 초기화 스크립트
├── generate-migration-sql.ts # 마이그레이션 SQL 생성
└── log-backup.ts           # 로그 백업 스크립트

.claude/                      # Claude 개발 히스토리 (git 제외)
├── context/                  # 개발 컨텍스트 저장
│   └── YYYY-MM-DD_description.md
├── prompts/                  # 프롬프트 히스토리
│   └── YYYY-MM-DD_description.md
└── plans/                    # 설계 문서

config/
├── .env.example            # 환경 변수 템플릿
├── .env.local
├── .env.dev
└── .env.prod

# .gitignore에 추가 필수
# .claude/                  # Claude 개발 히스토리
# .env.*                    # 환경 설정 (example 제외)
# logs/                     # 로그 파일

# Docker & PM2
├── Dockerfile
├── docker-compose.yml      # 개발 환경 (MySQL, Redis)
├── docker-compose.prod.yml # 프로덕션용
└── ecosystem.config.js     # PM2 설정
```

### 2.2 기술 요구사항

| 항목 | 버전/설정 |
|------|----------|
| Node.js | 22+ |
| TypeScript | NestJS 기본 설정 |
| Package Manager | npm 또는 yarn |

---

## 3. 환경 설정 (.env)

### 3.1 환경 파일 구조
```env
# .env.{environment}

# App
NODE_ENV=local|dev|prod
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=mysql://user:pass@host:3306/db
DB_POOL_MIN=5
DB_POOL_MAX=30              # 환경별 조절

# Sharding
SHARDING_ENABLED=false      # true/false
SHARD_COUNT=4               # Sharding 활성화 시 샤드 수
SHARD_1_URL=mysql://...
SHARD_2_URL=mysql://...
# ...

# Redis
REDIS_MODE=direct|cluster   # local/dev: direct, prod: cluster
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
# Cluster 모드 시
REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

# Rate Limiting (환경별 설정 가능)
RATE_LIMIT_TTL=60000        # ms
RATE_LIMIT_MAX=100          # 요청 수

# Security
MAX_DEVICES_PER_USER=1      # 동시 접속 디바이스 수
TOKEN_ROTATION_ENABLED=true

# CORS (환경별 설정)
CORS_ORIGINS=http://localhost:3000,https://example.com  # 쉼표 구분, *는 모두 허용

# Body Size (엔드포인트별 설정 가능)
BODY_SIZE_LIMIT=1mb         # 기본값
BODY_SIZE_LIMIT_UPLOAD=50mb # 파일 업로드용

# Timezone
DEFAULT_TIMEZONE=Asia/Seoul # 기본 타임존 (클라이언트 미지정 시)

# Logging
LOG_DIR=./logs              # 로그 디렉토리 (공유 스토리지 경로 가능)
LOG_BACKUP_DIR=./logs/backup # 1개월 지난 로그 백업 디렉토리
LOG_MAX_SIZE=50m            # 로그 파일 최대 크기 (50MB)
LOG_MAX_FILES=30d           # 로그 보관 기간

# Delete Database (Soft Delete 데이터 이관용)
DELETE_DB_ENABLED=true
DELETE_DB_URL=mysql://user:pass@host:3306/deleted_data
DELETE_RETENTION_DAYS=365   # Delete DB 보관 기간 (일)
DELETE_MIGRATION_CRON=0 3 * * * # 매일 03시 실행 (내부 Cron 사용 시)
DELETE_MIGRATION_MODE=internal  # internal(NestJS Cron) | external(Lambda 등)

# Encryption
ENCRYPTION_KEY=your-32-byte-key # 민감 데이터 암호화 키

# Swagger
SWAGGER_ENABLED=true        # local/dev: true, prod: false
SWAGGER_PATH=/api-docs

# WebSocket Documentation
WS_DOCS_ENABLED=true        # local/dev: true, prod: false
WS_DOCS_PATH=/ws-docs       # 문서 접근 경로
WS_DOCS_TITLE=WebSocket API
WS_DOCS_VERSION=1.0.0

# 기능 활성화/비활성화
DB_ENABLED=true             # MySQL 사용 여부
REDIS_ENABLED=true          # Redis 사용 여부

# Socket 기본 Room 설정
SOCKET_DEFAULT_ROOMS=user,broadcast  # 자동 참여 Room (user:{userId}, broadcast:all)

# 에러 알림 설정
ERROR_ALERT_ENABLED=true
ERROR_ALERT_TYPE=slack      # slack | email
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
SLACK_CHANNEL=#alerts

# 이메일 설정 (SMTP)
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=
EMAIL_SMTP_FROM=noreply@example.com
EMAIL_ALERT_TO=admin@example.com

# 파일 업로드 설정
UPLOAD_DRIVER=local         # local | s3
UPLOAD_LOCAL_PATH=./uploads
UPLOAD_MAX_SIZE=10mb
# S3 설정 (UPLOAD_DRIVER=s3 일 때)
AWS_S3_BUCKET=
AWS_S3_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# i18n 설정
I18N_DEFAULT_LANG=ko        # 기본 언어
I18N_FALLBACK_LANG=en       # 폴백 언어
```

---

## 4. 로깅 시스템

### 4.1 로그 파일 구조

```
logs/
├── api/                        # REST API 로그
│   ├── api-2025-02-05.log
│   ├── api-2025-02-05.1.log    # 50MB 초과 시 롤링
│   └── ...
├── socket/                     # Socket.io 로그
│   ├── socket-2025-02-05.log
│   └── ...
├── error/                      # 에러 전용 로그
│   ├── error-2025-02-05.log
│   └── ...
└── backup/                     # 1개월 지난 로그 백업
    ├── 2025-01/
    │   ├── api-2025-01-05.log
    │   └── ...
    └── ...
```

### 4.2 로그 정책

| 항목 | 설정 |
|------|------|
| 콘솔 출력 | **금지** (파일만 기록) |
| 파일 크기 제한 | 50MB (초과 시 롤링) |
| 파일 분리 | 날짜별 + 타입별 (api, socket, error) |
| 백업 | 1개월 지난 파일 → backup/{년-월}/ 이동 |
| 스토리지 | 환경 설정으로 공유 스토리지 경로 지정 가능 |

### 4.3 로그 내용

```typescript
// API 로그 포맷
{
  timestamp: "2025-02-05 14:30:00",
  level: "info",
  method: "POST",
  url: "/api/v1/users",
  statusCode: 200,
  duration: "45ms",
  userId: "uuid",
  requestBody: { ... },      // 민감 정보 마스킹
  responseBody: { ... },
  ip: "192.168.1.1",
  userAgent: "..."
}

// Socket 로그 포맷
{
  timestamp: "2025-02-05 14:30:00",
  level: "info",
  event: "chat:send",
  userId: "uuid",
  socketId: "...",
  room: "group:123",
  payload: { ... }
}

// Error 로그 포맷
{
  timestamp: "2025-02-05 14:30:00",
  level: "error",
  message: "Database connection failed",
  stack: "...",
  context: { ... }
}
```

### 4.4 로그 백업 스케줄

```
┌─────────────────────────────────────────────────────────────┐
│                    Log Backup Process                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Cron: 매일 00:00]                                          │
│     │                                                        │
│     ├─ 1개월 이상 된 로그 파일 검색                          │
│     │                                                        │
│     └─ backup/{년-월}/ 디렉토리로 이동                       │
│        예: logs/api/api-2025-01-05.log                       │
│          → logs/backup/2025-01/api-2025-01-05.log            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 데이터베이스 설계

### 5.1 Sharding 전략

```
┌─────────────────────────────────────────────────────────────┐
│                    Shard Manager                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  shardingEnabled: boolean (from config)              │    │
│  │                                                      │    │
│  │  if (disabled) → Single DB Connection                │    │
│  │  if (enabled)  → Shard Resolver                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
      [Shard 0]       [Shard 1]       [Shard N]
      User ID % N=0   User ID % N=1   User ID % N=N
```

**Shard 결정 로직**:
```
shardIndex = hash(userId) % SHARD_COUNT
```

**Cross-Shard 최소화 원칙**:
- 유저 관련 모든 데이터는 동일 Shard에 저장
- 유저 간 관계 데이터 모델링 시 데이터 비정규화 고려
- 불가피한 Cross-Shard는 Application 레벨 Join

### 5.2 핵심 테이블 구조 (Prisma Schema 예시)

```prisma
// 공통 Timestamp 필드 (모든 테이블에 적용)
// - createdAt: 생성 시간 (UTC+0)
// - updatedAt: 수정 시간 (UTC+0)
// - deletedAt: 삭제 시간 (Soft Delete, UTC+0)

model User {
  id            String    @id @default(uuid())
  googleId      String    @unique
  email         String    @unique           // 암호화 저장
  name          String
  picture       String?

  // Timestamps (UTC+0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?                   // Soft Delete

  // Relations
  sessions      UserSession[]

  @@index([googleId])
  @@index([email])
  @@index([deletedAt])                      // Soft Delete 필터링용
}

model UserSession {
  id            String    @id @default(uuid())
  userId        String
  refreshToken  String    @unique
  deviceInfo    String?
  ipAddress     String?
  isValid       Boolean   @default(true)

  // Timestamps (UTC+0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?
  expiresAt     DateTime

  user          User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([refreshToken])
  @@index([deletedAt])
}
```

### 5.3 Soft Delete 전략

```
┌─────────────────────────────────────────────────────────────┐
│                    Soft Delete Lifecycle                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. [삭제 요청]                                              │
│     └─ deletedAt = NOW() 설정                                │
│     └─ 관련 캐시 삭제                                        │
│                                                              │
│  2. [일반 조회]                                              │
│     └─ WHERE deletedAt IS NULL 자동 적용                     │
│     └─ Prisma Middleware로 전역 처리                         │
│                                                              │
│  3. [1개월 경과] (Cron 또는 외부 배치)                       │
│     └─ deletedAt + 30일 < NOW() 인 레코드 검색               │
│     └─ Delete DB의 동일 구조 테이블로 이동                   │
│     └─ 원본 테이블에서 Hard Delete                           │
│                                                              │
│  4. [Delete DB 보관]                                         │
│     └─ 설정된 보관 기간(DELETE_RETENTION_DAYS) 동안 유지     │
│     └─ 보관 기간 초과 시 완전 삭제                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Delete 데이터 이관 방식**:
| 방식 | 설명 | 환경 설정 |
|------|------|-----------|
| Internal (NestJS Cron) | 서버 내부 스케줄러 | DELETE_MIGRATION_MODE=internal |
| External (Lambda 등) | AWS Lambda, Step Functions | DELETE_MIGRATION_MODE=external |

### 5.4 Timestamp 처리

**저장 원칙**:
- 모든 시간 데이터는 **UTC+0**으로 저장
- Response 시 클라이언트 타임존으로 변환

**타임존 결정 순서**:
1. `X-Timezone` 헤더 (예: `Asia/Seoul`)
2. 환경 설정 `DEFAULT_TIMEZONE`
3. 기본값: `Asia/Seoul`

**Response 포맷**: `YYYY-MM-DD HH:mm:ss`

```typescript
// Request Header
{
  'X-Timezone': 'Asia/Seoul'    // 선택적
}

// Response 예시 (타임존 변환 적용)
{
  "createdAt": "2025-02-05 23:30:00",  // Asia/Seoul 기준
  "updatedAt": "2025-02-06 09:15:00"
}

// Interceptor에서 자동 변환
// UTC → 클라이언트 타임존
```

### 5.5 민감 데이터 암호화

| 필드 | 암호화 방식 | 비고 |
|------|------------|------|
| email | AES-256-GCM | 검색 가능 (해시 인덱스) |
| 전화번호 | AES-256-GCM | 선택적 필드 |
| 기타 민감 정보 | AES-256-GCM | 서비스별 정의 |

```typescript
// 암호화 유틸리티 구조
class EncryptionService {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
  hashForSearch(plainText: string): string;  // 검색용 해시
}
```

### 5.6 Prisma 마이그레이션 전략

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration Workflow                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [최초 설정] (DB 비어있음)                                   │
│     └─ npx prisma migrate dev                                │
│        └─ 스키마 생성 + 마이그레이션 파일 생성               │
│                                                              │
│  [이후 스키마 변경] (DB에 데이터 존재)                       │
│     1. schema.prisma 수정                                    │
│     2. npm run migration:generate                            │
│        └─ SQL 파일 생성 (prisma/migrations/pending/)         │
│     3. 생성된 SQL 검토 및 직접 DB에 실행                     │
│     4. npx prisma generate                                   │
│        └─ Prisma Client 재생성                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**마이그레이션 명령어**:
```bash
# 최초 마이그레이션 (빈 DB)
npm run migrate:init

# SQL 생성 (데이터 있는 DB)
npm run migrate:generate
# → prisma/migrations/pending/YYYY-MM-DD_description.sql 생성

# Prisma Client 재생성
npm run prisma:generate
```

### 5.7 쿼리 최적화 원칙 (3쿼리 제한)

| 시나리오 | 허용 쿼리 |
|----------|-----------|
| 단순 조회 | 1. 캐시 확인 → 2. DB 조회 (캐시 미스 시) |
| 유저 + 관계 데이터 | 1. 유저 조회 (JOIN 또는 include) |
| 복합 조회 | 1. 메인 데이터 → 2. 관계 데이터 → 3. 집계 |

**금지 사항**:
- N+1 쿼리 패턴
- 루프 내 쿼리 실행
- 불필요한 SELECT *

---

## 6. 캐시 전략 (Redis)

### 6.1 캐시 키 네이밍 컨벤션

```
{prefix}:{entity}:{identifier}

예시:
- user_info:{userId}          # 유저 정보
- user_session:{userId}       # 유저 세션 목록
- refresh_token:{tokenHash}   # Refresh Token 유효성
- rate_limit:{userId}:{endpoint}  # Rate Limiting
- socket_room:{roomId}        # Socket Room 정보
```

**키 충돌 방지 규칙**:
- 각 도메인별 고유 prefix 사용
- 환경별 prefix 추가 고려 (dev:, prod:)

### 6.2 캐시 생명주기

```
┌─────────────────────────────────────────────────────────────┐
│                    Cache Flow                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Request] → 캐시 확인 ──Yes──→ 캐시 데이터 반환             │
│                 │                                            │
│                 No                                           │
│                 ▼                                            │
│         DB에서 조회 → 캐시 저장 (TTL 설정) → 데이터 반환     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [DB Write] → DB 저장 완료 → 관련 캐시 삭제                  │
│              (Write-Behind)    (Invalidation)                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 TTL 설정 가이드

| 데이터 유형 | TTL | 근거 |
|------------|-----|------|
| 유저 정보 | 1시간 | 거의 변경 안됨 |
| 세션 정보 | Access Token 만료 시간과 동기화 | 보안 |
| Rate Limit | 1분 | Sliding Window |
| 정적 설정 | 24시간 | 거의 불변 |

### 6.4 Redis 연결 설정

```typescript
// Local/Dev: Direct 연결
{
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
}

// Production: AWS Cluster
{
  clusterMode: true,
  nodes: process.env.REDIS_CLUSTER_NODES.split(','),
  password: process.env.REDIS_PASSWORD,
}
```

---

## 7. 인증 시스템

### 7.1 인증 Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Google OAuth + JWT Flow                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Client → /auth/google → Google OAuth 페이지             │
│                                                              │
│  2. Google 인증 완료 → /auth/google/callback                 │
│     │                                                        │
│     ├─ 신규 유저: DB에 유저 생성                             │
│     │   └─ 서비스별 추가 필드 설정 가능                      │
│     │                                                        │
│     └─ 기존 유저: 유저 정보 조회                             │
│                                                              │
│  3. 동시 접속 체크 (MAX_DEVICES_PER_USER=1)                  │
│     │                                                        │
│     ├─ 기존 세션 존재: 기존 세션 강제 로그아웃               │
│     │                                                        │
│     └─ 새 세션 생성                                          │
│                                                              │
│  4. Token 발급                                               │
│     ├─ Access Token (1시간)                                  │
│     │   └─ Payload: { userId, sessionId, iat, exp }          │
│     │                                                        │
│     └─ Refresh Token (30일)                                  │
│         └─ DB에 저장 + Redis 캐시                            │
│                                                              │
│  5. Redis에 유저 정보 캐시                                   │
│     └─ Key: user_info:{userId}                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Token 검증 Flow (모든 API 요청)

```
┌─────────────────────────────────────────────────────────────┐
│                    Token Validation Flow                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. JWT Guard: Access Token 서명 검증                        │
│     └─ 실패 시: 401 Unauthorized                             │
│                                                              │
│  2. Token에서 userId, sessionId 추출                         │
│                                                              │
│  3. Redis 캐시 확인: user_info:{userId}                      │
│     │                                                        │
│     ├─ 캐시 존재: Token의 정보와 비교                        │
│     │   ├─ 일치: 요청 진행                                   │
│     │   └─ 불일치: 강제 로그아웃 (401)                       │
│     │                                                        │
│     └─ 캐시 없음:                                            │
│         └─ DB에서 유저 조회                                  │
│             ├─ 유저 존재 & 일치: 캐시 저장 → 요청 진행       │
│             └─ 불일치/미존재: 강제 로그아웃 (401)            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Token 탈취 감지 전략 (복합 적용)

#### A. Refresh Token Rotation
```
┌─────────────────────────────────────────────────────────────┐
│  [Token Refresh 요청]                                        │
│     │                                                        │
│     ├─ Refresh Token 유효성 확인 (DB + Redis)                │
│     │                                                        │
│     ├─ 유효:                                                 │
│     │   ├─ 기존 Refresh Token 무효화                         │
│     │   ├─ 새 Access + Refresh Token 발급                    │
│     │   └─ 새 Refresh Token DB/Redis 저장                    │
│     │                                                        │
│     └─ 이미 사용된 Token (탈취 의심):                        │
│         ├─ 해당 유저의 모든 세션 무효화                      │
│         ├─ 모든 Refresh Token 삭제                           │
│         └─ 강제 재로그인 요구                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### B. 동시 접속 제한 (1개 디바이스)
- 새 로그인 시 기존 세션 강제 종료
- Socket 연결된 경우 disconnect 이벤트 전송

#### C. 이상 행동 감지
- 급격한 IP 변경 감지 (선택적 구현)
- 비정상 요청 패턴 (Rate Limiting과 연계)

### 7.4 JWT Payload 구조

```typescript
// Access Token
{
  userId: string,      // 유저 UUID
  sessionId: string,   // 세션 UUID
  iat: number,         // 발급 시간
  exp: number,         // 만료 시간 (1시간)
}

// Refresh Token
{
  userId: string,
  sessionId: string,
  tokenId: string,     // Rotation 추적용
  iat: number,
  exp: number,         // 만료 시간 (30일)
}
```

---

## 8. Socket.io 설계

### 8.1 Multi-Server 환경 구성

```
┌─────────────────────────────────────────────────────────────┐
│                    Socket.io + Redis Adapter                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│           ┌─────────────────────────────┐                   │
│           │      Load Balancer          │                   │
│           └─────────────────────────────┘                   │
│                 │         │         │                        │
│           ┌─────┴───┐ ┌───┴───┐ ┌───┴─────┐                 │
│           │Server 1 │ │Server2│ │Server 3 │                 │
│           │Socket.io│ │Socket.io│ │Socket.io│               │
│           └────┬────┘ └───┬───┘ └────┬────┘                 │
│                │          │          │                       │
│           ┌────┴──────────┴──────────┴────┐                 │
│           │       Redis Adapter            │                 │
│           │  (이벤트 Pub/Sub 공유)         │                 │
│           └───────────────────────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Socket 인증 (Handshake)

```typescript
// Client 연결 시
socket.handshake.auth = {
  token: 'Bearer {accessToken}'
}

// Server 검증
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  // 1. JWT 검증
  // 2. Redis에서 세션 유효성 확인
  // 3. 유저 정보 socket.data에 저장

  if (valid) {
    socket.data.userId = decoded.userId;
    socket.data.sessionId = decoded.sessionId;
    next();
  } else {
    next(new Error('Unauthorized'));
  }
});
```

### 8.3 Room 관리 전략 (동적 생성)

```typescript
// Room 네이밍 컨벤션
{
  user: `user:${userId}`,           // 개인 알림용
  group: `group:${groupId}`,        // 그룹/채팅방
  game: `game:${gameId}`,           // 게임 세션
  broadcast: `broadcast:${topic}`,  // 전체 공지
  custom: `${service}:${type}:${id}` // 서비스별 커스텀
}

// Room 참여/퇴장
socket.join(`user:${userId}`);      // 연결 시 자동 참여
socket.join(`group:${groupId}`);    // 그룹 참여 요청 시
socket.leave(`group:${groupId}`);   // 그룹 퇴장 시
```

### 8.4 이벤트 유형

| 이벤트 방향 | 유형 | 예시 |
|------------|------|------|
| Client → Server | 상태 변경 요청 | `game:move`, `chat:send` |
| Server → Client | 상태 동기화 | `game:state`, `chat:message` |
| Server → Client | 알림/푸시 | `notification:new` |
| Broadcast | 전체 공지 | `system:announcement` |

### 8.5 연결 상태 관리

- Socket.io 기본 reconnection 설정 사용
- 서버 측 disconnect 이벤트에서 cleanup 처리
- Redis에서 연결 상태 관리 (선택적)

### 8.6 기본 Room 구조

**자동 참여 Room** (환경 설정 가능):
```typescript
// 연결 시 자동 참여
socket.join(`user:${userId}`);      // 개인 알림용
socket.join(`broadcast:all`);       // 전체 공지용

// 환경 설정
SOCKET_DEFAULT_ROOMS=user,broadcast
```

**Room 권한 검증** (확장 가능 구조):
```typescript
// 기본: 인증된 유저만 Room 참여 가능
// 확장: Hook으로 Room별 권한 검증 추가 가능

interface RoomAuthHook {
  canJoin(userId: string, roomId: string): Promise<boolean>;
}

// 서비스에서 Hook 등록
roomManager.registerAuthHook('game:', gameRoomAuthHook);
```

### 8.7 Notification 시스템

**알림 유형**:
| 유형 | Room 패턴 | 용도 |
|------|-----------|------|
| 시스템 | `broadcast:all` | 전체 공지, 점검 알림 |
| 개인 | `user:{userId}` | 개인 메시지, 알림 |
| 그룹 | `group:{groupId}` | 그룹/채팅방 메시지 |

**이벤트 구조**:
```typescript
// 시스템 알림
{
  event: 'notification:system',
  data: {
    type: 'maintenance',
    message: '서버 점검 예정',
    scheduledAt: '2025-02-06 03:00:00'
  }
}

// 개인 알림
{
  event: 'notification:personal',
  data: {
    type: 'message',
    from: 'userId',
    content: '...'
  }
}

// 강제 로그아웃
{
  event: 'force_logout',
  data: {
    reason: 'duplicate_login'
  }
}
```

---

## 9. API 설계

### 9.1 URL 구조

```
/api/v1/{resource}
/api/v1/{resource}/{id}
/api/v1/{resource}/{id}/{sub-resource}

예시:
GET    /api/v1/users/me
PUT    /api/v1/users/me
POST   /api/v1/auth/google
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
```

### 9.2 Response 포맷

```typescript
// 성공 응답
{
  "success": true,
  "data": { ... },
  "meta": {                    // 선택적 (페이지네이션 등)
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

// 에러 응답
{
  "success": false,
  "error": {
    "code": "AUTH_001",        // 커스텀 에러 코드
    "message": "Token expired",
    "details": { ... }         // 선택적
  }
}
```

### 9.3 에러 코드 체계

| HTTP Status | 커스텀 코드 범위 | 설명 |
|-------------|-----------------|------|
| 400 | REQ_001 ~ REQ_099 | 잘못된 요청 |
| 401 | AUTH_001 ~ AUTH_099 | 인증 실패 |
| 403 | PERM_001 ~ PERM_099 | 권한 없음 |
| 404 | NOT_001 ~ NOT_099 | 리소스 없음 |
| 429 | RATE_001 ~ RATE_099 | Rate Limit 초과 |
| 500 | SRV_001 ~ SRV_099 | 서버 에러 |

### 9.4 Rate Limiting

```typescript
// 설정 가능한 Rate Limiting
{
  global: {
    ttl: 60000,      // 1분
    limit: 100,      // 요청 수
  },
  auth: {
    ttl: 60000,
    limit: 10,       // 인증 관련 더 엄격
  },
  perEndpoint: {
    'POST /api/v1/messages': { ttl: 1000, limit: 5 }
  }
}
```

### 9.5 DTO Validation (class-validator)

```typescript
// 요청 DTO 예시
import { IsEmail, IsString, IsOptional, Length } from 'class-validator';

class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(2, 50)
  name: string;

  @IsOptional()
  @IsString()
  picture?: string;
}

// ValidationPipe 전역 설정
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,          // DTO에 없는 속성 제거
  forbidNonWhitelisted: true, // DTO에 없는 속성 전송 시 에러
  transform: true,          // 자동 타입 변환
}));
```

### 9.6 Swagger (REST API 문서화)

| 환경 | Swagger 활성화 |
|------|---------------|
| local | O (/api-docs) |
| dev | O (/api-docs) |
| prod | X (비활성화) |

```typescript
// main.ts
if (process.env.SWAGGER_ENABLED === 'true') {
  const config = new DocumentBuilder()
    .setTitle('Backend Engine API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(process.env.SWAGGER_PATH, app, document);
}
```

### 9.7 Health Check

```typescript
// GET /health
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

**검사 항목**:
- Database 연결 상태
- Redis 연결 상태

---

## 10. 보안 체크리스트

### 10.1 필수 구현 항목

- [ ] JWT 서명 검증 (모든 요청)
- [ ] Refresh Token Rotation
- [ ] 동시 접속 제한 (1 디바이스)
- [ ] Rate Limiting (Redis 기반)
- [ ] SQL Injection 방지 (Prisma Parameterized Query)
- [ ] XSS 방지 (입력값 Sanitization)
- [ ] CORS 설정 (허용 Origin 명시)
- [ ] Helmet.js 적용 (보안 헤더)
- [ ] HTTPS Only (Production)

### 10.2 환경별 보안 수준

| 항목 | Local | Dev | Prod |
|------|-------|-----|------|
| HTTPS | X | O | O |
| Rate Limit | 완화 | 중간 | 엄격 |
| CORS | * | 특정 도메인 | 특정 도메인 |
| 로깅 수준 | Debug | Info | Warn |

---

## 11. 성능 최적화 가이드

### 11.1 Database

- **Connection Pool**: 환경별 설정 (local: 5-10, prod: 20-30/서버)
- **Index**: 조회 빈도 높은 컬럼에 적용
- **N+1 방지**: Prisma `include` 활용
- **Sharding**: 대규모 확장 시 User ID 기반

### 11.2 Redis

- **Pipeline**: 다중 명령 일괄 처리
- **Connection Pool**: 환경별 설정
- **Cluster**: Production 환경 필수

### 11.3 Application

- **무한 루프 금지**: 모든 while/for에 종료 조건
- **Async/Await**: 병렬 처리 가능한 작업 동시 실행
- **메모리 관리**: 대용량 데이터 스트리밍 처리

---

## 12. 클라이언트 연동 가이드

### 12.1 REST API 사용

```typescript
// 헤더 설정
{
  'Authorization': 'Bearer {accessToken}',
  'Content-Type': 'application/json',
  'X-Timezone': 'Asia/Seoul'  // 선택적
}

// Token 만료 시 (401 응답)
// → /api/v1/auth/refresh 호출로 토큰 갱신
```

### 12.2 Socket.io 연결

```typescript
const socket = io('wss://server-url', {
  auth: {
    token: `Bearer ${accessToken}`
  },
  transports: ['websocket'],  // WebSocket 우선
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// 강제 로그아웃 이벤트 처리
socket.on('force_logout', () => {
  // 토큰 삭제 및 로그인 페이지 이동
});
```

---

## 13. 확장성 고려사항

### 13.1 서비스별 커스터마이징

Engine 위에 구축되는 각 서비스는 다음을 확장 가능:

- **유저 추가 필드**: 서비스별 프로필 확장
- **인증 추가 검증**: 서비스별 권한 체크
- **캐시 키**: 서비스별 prefix 추가
- **Socket Room**: 서비스별 Room 타입 정의

### 13.2 모듈 독립성

- 각 Feature 모듈은 독립적으로 동작
- Core 모듈 의존성 최소화
- 인터페이스 기반 확장 지원

---

## 14. CLI 초기화 및 배포 설정

### 14.1 프로젝트 초기화 CLI

```bash
# CLI로 새 프로젝트 설정
npm run init

# 대화형 설정
? 프로젝트 이름: my-game-server
? 데이터베이스 호스트: localhost
? 데이터베이스 포트: 3306
? 데이터베이스 이름: my_game
? Redis 호스트: localhost
? Redis 포트: 6379
? JWT Secret: (자동 생성 또는 직접 입력)
...

# 결과: .env.local 파일 생성
```

**수동 설정**: `.env.example` 복사 후 직접 편집

### 14.2 Docker 설정

```yaml
# docker-compose.yml (개발 환경)
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: engine_dev
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - mysql
      - redis
    env_file:
      - .env.local
```

```dockerfile
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### 14.3 PM2 설정

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'backend-engine',
    script: 'dist/main.js',
    instances: 'max',           // CPU 코어 수만큼
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2/error.log',
    out_file: './logs/pm2/out.log',
    merge_logs: true,
    max_memory_restart: '1G'
  }]
};
```

```bash
# PM2 명령어
pm2 start ecosystem.config.js
pm2 reload backend-engine     # 무중단 재시작
pm2 logs backend-engine
```

### 14.4 에러 알림 시스템

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Alert Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Critical Error 발생]                                       │
│     │                                                        │
│     ├─ 로그 파일 기록 (error-YYYY-MM-DD.log)                 │
│     │                                                        │
│     └─ ERROR_ALERT_ENABLED=true?                             │
│         │                                                    │
│         ├─ ERROR_ALERT_TYPE=slack                            │
│         │   └─ Slack Webhook으로 알림 전송                   │
│         │                                                    │
│         └─ ERROR_ALERT_TYPE=email                            │
│             └─ SMTP로 이메일 전송                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**알림 내용**:
- 에러 메시지 및 스택 트레이스
- 발생 시간
- 서버 정보 (호스트명, 환경)
- 관련 요청 정보 (URL, userId 등)

---

## 15. 구현 순서 권장

1. **Phase 1: 기반 설정**
   - NestJS 프로젝트 초기화
   - 환경 설정 (ConfigModule)
   - Prisma 설정 및 마이그레이션

2. **Phase 2: 인증 시스템**
   - Google OAuth 연동
   - JWT 발급/검증
   - Refresh Token Rotation

3. **Phase 3: 캐시 시스템**
   - Redis 연결 (Direct/Cluster)
   - Cache Service 구현
   - 유저 정보 캐싱

4. **Phase 4: Socket.io**
   - Redis Adapter 설정
   - Handshake 인증
   - Room 관리

5. **Phase 5: 보안 강화**
   - Rate Limiting
   - 동시 접속 제한
   - 이상 행동 감지

6. **Phase 6: Sharding (선택)**
   - Shard Manager 구현
   - 설정 기반 On/Off

---

## 16. 테스트 전략

### 16.1 테스트 유형

| 유형 | 대상 | 도구 |
|------|------|------|
| Unit | Service, Util | Jest |
| Integration | Controller + Service | Jest + Supertest |
| E2E | 전체 Flow | Jest + Supertest |
| Load | 동시 접속 | k6, Artillery |

### 16.2 필수 테스트 시나리오

- [ ] Google OAuth 로그인 성공/실패
- [ ] Token 갱신 (정상/탈취 감지)
- [ ] 동시 접속 시 기존 세션 종료
- [ ] 캐시 Hit/Miss 동작
- [ ] Socket 연결/인증/Room 참여
- [ ] Rate Limit 동작
- [ ] Sharding On/Off 전환
- [ ] Soft Delete → Delete DB 이관
- [ ] 타임존 변환 (UTC → 클라이언트 타임존)
- [ ] 로그 파일 생성/롤링/백업
- [ ] 민감 데이터 암호화/복호화

---

## 17. 핵심 요구사항 체크리스트

### 17.1 필수 기능

| 항목 | 요구사항 | 상태 |
|------|---------|------|
| 데이터베이스 | MySQL + Redis | ⬜ |
| 동시 접속 | 1000명+ 지원 (부하 최소화) | ⬜ |
| API | RESTful + Socket.io | ⬜ |
| Sharding | 환경 설정으로 On/Off | ⬜ |
| 쿼리 제한 | 요청당 최대 3개 | ⬜ |
| 인증 | Google OAuth + JWT | ⬜ |
| Token 보안 | Rotation + 동시접속 제한(1개) | ⬜ |
| 유저 캐시 | user_info_{ID} 형식 | ⬜ |
| 캐시 무효화 | DB 변경 시 삭제 → 필요 시 재생성 | ⬜ |
| Redis 연결 | local/dev: Direct, prod: Cluster | ⬜ |
| 무한 루프 | 금지 (종료 조건 필수) | ⬜ |
| 코드 가독성 | 초보 개발자도 이해 가능 | ⬜ |
| 다중 서버 | LB 환경 지원 (Redis Adapter) | ⬜ |
| 클라이언트 호환 | React, Unity 등 다양한 클라이언트 | ⬜ |

### 17.2 추가 기능

| 항목 | 요구사항 | 상태 |
|------|---------|------|
| 로깅 | API/Socket/Error 분리, 50MB 롤링, 1개월 백업 | ⬜ |
| Soft Delete | deletedAt + 1개월 후 Delete DB 이관 | ⬜ |
| Timestamp | UTC+0 저장, 타임존 변환 Response | ⬜ |
| 암호화 | 민감 데이터 AES-256-GCM | ⬜ |
| Swagger | local/dev만 노출 | ⬜ |
| WebSocket 문서 | ws-docs 경로, local/dev만 노출 | ⬜ |
| Health Check | DB + Redis 연결 확인 | ⬜ |
| Rate Limiting | 환경별 설정 가능 | ⬜ |
| CORS | 환경 설정으로 관리 | ⬜ |
| Body Size | 엔드포인트별 설정 | ⬜ |
| CLI 초기화 | 수동 + CLI 설정 모두 지원 | ⬜ |
| Socket Room | 개인 + 그룹 + 전체 알림 | ⬜ |
| Room 권한 | 확장 가능한 Hook 구조 | ⬜ |
| 에러 알림 | Slack/Email 선택 가능 | ⬜ |
| Docker | Dockerfile + docker-compose | ⬜ |
| PM2 | ecosystem.config.js | ⬜ |
| Prisma | 최초 migrate + 이후 SQL 생성 | ⬜ |
| DB/Redis 토글 | 환경 설정으로 enable/disable | ⬜ |
| 파일 업로드 | Local + S3 선택 가능 | ⬜ |
| 이메일 발송 | SMTP 지원 | ⬜ |
| i18n | 확장 가능한 구조 | ⬜ |
| 개발 히스토리 | .claude/ 폴더 (git 제외) | ⬜ |
| README.md | Engine 사용법 문서화 | ⬜ |

---

## 18. README.md 작성 가이드

### 18.1 README.md 구조

```markdown
# Backend Engine

NestJS 기반 고성능 Backend Engine 템플릿

## 주요 기능

- Google OAuth + JWT 인증
- Socket.io 실시간 통신 (Redis Adapter)
- MySQL + Redis 캐시
- 1000명+ 동시 접속 지원
- Sharding 지원 (환경 설정으로 On/Off)

## 빠른 시작

### 요구사항
- Node.js 22+
- MySQL 8.0+
- Redis 7+

### 설치

# 저장소 복제
git clone https://github.com/your-org/backend-engine.git my-project
cd my-project

# 의존성 설치
npm install

# 환경 설정 (방법 1: CLI)
npm run init

# 환경 설정 (방법 2: 수동)
cp .env.example .env.local
# .env.local 파일 편집

# 데이터베이스 마이그레이션 (최초 1회)
npm run migrate:init

# 개발 서버 실행
npm run start:dev

### Docker로 실행

# 개발 환경 (MySQL, Redis 포함)
docker-compose up -d

# 프로덕션
docker-compose -f docker-compose.prod.yml up -d

## 환경 설정

### 필수 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| DATABASE_URL | MySQL 연결 문자열 | mysql://user:pass@localhost:3306/db |
| REDIS_HOST | Redis 호스트 | localhost |
| JWT_SECRET | JWT 서명 키 | your-secret-key |
| GOOGLE_CLIENT_ID | Google OAuth ID | xxx.apps.googleusercontent.com |

### 기능 활성화/비활성화

| 변수 | 설명 | 기본값 |
|------|------|--------|
| DB_ENABLED | MySQL 사용 | true |
| REDIS_ENABLED | Redis 사용 | true |
| SHARDING_ENABLED | Sharding 사용 | false |
| SWAGGER_ENABLED | Swagger 활성화 | true |
| WS_DOCS_ENABLED | WebSocket 문서 활성화 | true |

## API 문서

개발 환경에서 문서 확인:
- REST API: http://localhost:3000/api-docs
- WebSocket: http://localhost:3000/ws-docs

## 프로젝트 구조

src/
├── auth/          # 인증 (Google OAuth, JWT)
├── user/          # 유저 관리
├── core/          # 핵심 모듈
│   ├── database/  # DB, Sharding
│   ├── cache/     # Redis 캐시
│   ├── socket/    # Socket.io
│   ├── logger/    # 로깅
│   └── ...
└── common/        # 공통 유틸리티

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| npm run start:dev | 개발 서버 실행 |
| npm run build | 프로덕션 빌드 |
| npm run start:prod | 프로덕션 실행 |
| npm run init | 프로젝트 초기화 CLI |
| npm run migrate:init | 최초 DB 마이그레이션 |
| npm run migrate:generate | 마이그레이션 SQL 생성 |
| npm run prisma:generate | Prisma Client 생성 |
| npm run test | 테스트 실행 |

## 클라이언트 연동

### REST API

// 헤더 설정
Authorization: Bearer {accessToken}
Content-Type: application/json
X-Timezone: Asia/Seoul  // 선택적

### Socket.io

const socket = io('wss://your-server', {
  auth: { token: 'Bearer {accessToken}' }
});

// 강제 로그아웃 처리
socket.on('force_logout', () => {
  // 재로그인 필요
});

## 라이선스

MIT
```

### 18.2 README에 포함할 섹션

| 섹션 | 내용 |
|------|------|
| 주요 기능 | Engine의 핵심 기능 목록 |
| 빠른 시작 | 설치 및 실행 방법 |
| 환경 설정 | 필수/선택 환경 변수 설명 |
| API 문서 | Swagger, WebSocket 문서 접근 방법 |
| 프로젝트 구조 | 폴더 구조 설명 |
| 주요 명령어 | npm scripts 목록 |
| 클라이언트 연동 | REST API, Socket.io 사용법 |
| 라이선스 | 라이선스 정보 |

---

## 19. WebSocket API 문서화 시스템

### 19.1 개요

REST API의 Swagger처럼 WebSocket 이벤트를 문서화하는 시스템 구현

| 항목 | REST API | WebSocket |
|------|----------|-----------|
| 표준 스펙 | OpenAPI (Swagger) | AsyncAPI |
| 문서 경로 | /api-docs | /ws-docs |
| 활성화 환경 | local, dev | local, dev |

### 19.2 커스텀 데코레이터 설계

#### A. WsEvent 데코레이터

```typescript
// src/core/socket/docs/decorators/ws-event.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const WS_EVENT_METADATA = 'ws:event:metadata';

export interface WsEventOptions {
  /** 이벤트 이름 */
  name: string;
  /** 이벤트 설명 */
  description: string;
  /** 이벤트 방향 */
  direction: 'client-to-server' | 'server-to-client' | 'bidirectional';
  /** 이벤트 카테고리/그룹 */
  category?: string;
  /** 인증 필요 여부 */
  authenticated?: boolean;
  /** Room 컨텍스트 필요 여부 */
  requiresRoom?: boolean;
  /** 사용 예시 */
  example?: {
    payload?: object;
    response?: object;
  };
  /** 에러 응답 */
  errors?: {
    code: string;
    message: string;
    description?: string;
  }[];
}

export function WsEvent(options: WsEventOptions): MethodDecorator {
  return SetMetadata(WS_EVENT_METADATA, options);
}
```

#### B. WsPayload 데코레이터

```typescript
// src/core/socket/docs/decorators/ws-payload.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const WS_PAYLOAD_METADATA = 'ws:payload:metadata';

export interface WsPayloadField {
  /** 필드 이름 */
  name: string;
  /** 필드 타입 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 필드 설명 */
  description: string;
  /** 필수 여부 */
  required?: boolean;
  /** 예시 값 */
  example?: any;
  /** 중첩 객체 필드 (type이 object일 때) */
  properties?: WsPayloadField[];
  /** 배열 아이템 타입 (type이 array일 때) */
  items?: WsPayloadField;
}

export interface WsPayloadOptions {
  fields: WsPayloadField[];
}

export function WsPayload(options: WsPayloadOptions): MethodDecorator {
  return SetMetadata(WS_PAYLOAD_METADATA, options);
}
```

#### C. WsResponse 데코레이터

```typescript
// src/core/socket/docs/decorators/ws-response.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const WS_RESPONSE_METADATA = 'ws:response:metadata';

export interface WsResponseField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  example?: any;
  properties?: WsResponseField[];
  items?: WsResponseField;
}

export interface WsResponseOptions {
  /** 응답 이벤트 이름 (다른 이벤트로 응답할 경우) */
  event?: string;
  /** 응답 필드 */
  fields: WsResponseField[];
}

export function WsResponse(options: WsResponseOptions): MethodDecorator {
  return SetMetadata(WS_RESPONSE_METADATA, options);
}
```

### 19.3 Gateway에서 사용 예시

```typescript
// src/core/socket/socket.gateway.ts

import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WsEvent, WsPayload, WsResponse } from './docs/decorators';

@WebSocketGateway()
export class SocketGateway {

  @SubscribeMessage('chat:send')
  @WsEvent({
    name: 'chat:send',
    description: '채팅 메시지 전송',
    direction: 'client-to-server',
    category: 'Chat',
    authenticated: true,
    requiresRoom: true,
    example: {
      payload: { roomId: 'room:123', message: '안녕하세요!' },
      response: { success: true, messageId: 'msg_abc123' }
    },
    errors: [
      { code: 'CHAT_001', message: 'Room not found' },
      { code: 'CHAT_002', message: 'Message too long' }
    ]
  })
  @WsPayload({
    fields: [
      {
        name: 'roomId',
        type: 'string',
        description: '채팅방 ID',
        required: true,
        example: 'room:123'
      },
      {
        name: 'message',
        type: 'string',
        description: '메시지 내용 (최대 2000자)',
        required: true,
        example: '안녕하세요!'
      },
      {
        name: 'metadata',
        type: 'object',
        description: '메시지 메타데이터 (선택)',
        required: false,
        properties: [
          { name: 'replyTo', type: 'string', description: '답장 대상 메시지 ID' }
        ]
      }
    ]
  })
  @WsResponse({
    event: 'chat:sent',
    fields: [
      { name: 'success', type: 'boolean', description: '전송 성공 여부' },
      { name: 'messageId', type: 'string', description: '생성된 메시지 ID' },
      { name: 'timestamp', type: 'string', description: '메시지 생성 시간' }
    ]
  })
  async handleChatSend(
    @MessageBody() data: { roomId: string; message: string },
    @ConnectedSocket() client: Socket
  ) {
    // 구현...
  }

  // Server → Client 이벤트 문서화 (실제 핸들러 없음)
  @WsEvent({
    name: 'chat:message',
    description: '새 채팅 메시지 수신 (브로드캐스트)',
    direction: 'server-to-client',
    category: 'Chat',
    authenticated: true,
    example: {
      response: {
        messageId: 'msg_abc123',
        roomId: 'room:123',
        senderId: 'user_xyz',
        senderName: '홍길동',
        message: '안녕하세요!',
        timestamp: '2025-02-05 14:30:00'
      }
    }
  })
  @WsResponse({
    fields: [
      { name: 'messageId', type: 'string', description: '메시지 ID' },
      { name: 'roomId', type: 'string', description: '채팅방 ID' },
      { name: 'senderId', type: 'string', description: '발신자 ID' },
      { name: 'senderName', type: 'string', description: '발신자 이름' },
      { name: 'message', type: 'string', description: '메시지 내용' },
      { name: 'timestamp', type: 'string', description: '메시지 시간' }
    ]
  })
  documentChatMessage() {
    // 문서화 전용 메서드 (실행되지 않음)
  }
}
```

### 19.4 문서화 서비스

```typescript
// src/core/socket/docs/ws-docs.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { WS_EVENT_METADATA, WS_PAYLOAD_METADATA, WS_RESPONSE_METADATA } from './decorators';

export interface WsEventDoc {
  name: string;
  description: string;
  direction: string;
  category: string;
  authenticated: boolean;
  requiresRoom: boolean;
  payload?: object;
  response?: object;
  example?: object;
  errors?: object[];
}

@Injectable()
export class WsDocsService implements OnModuleInit {
  private events: Map<string, WsEventDoc> = new Map();
  private categories: Set<string> = new Set();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    this.scanEvents();
  }

  private scanEvents() {
    const providers = this.discoveryService.getProviders();

    providers
      .filter(wrapper => wrapper.instance && wrapper.metatype)
      .forEach(wrapper => {
        const { instance } = wrapper;
        const prototype = Object.getPrototypeOf(instance);

        this.metadataScanner.scanFromPrototype(
          instance,
          prototype,
          (methodName: string) => {
            const method = prototype[methodName];

            const eventMeta = this.reflector.get(WS_EVENT_METADATA, method);
            if (!eventMeta) return;

            const payloadMeta = this.reflector.get(WS_PAYLOAD_METADATA, method);
            const responseMeta = this.reflector.get(WS_RESPONSE_METADATA, method);

            const eventDoc: WsEventDoc = {
              ...eventMeta,
              category: eventMeta.category || 'General',
              authenticated: eventMeta.authenticated ?? true,
              requiresRoom: eventMeta.requiresRoom ?? false,
              payload: payloadMeta,
              response: responseMeta,
            };

            this.events.set(eventMeta.name, eventDoc);
            this.categories.add(eventDoc.category);
          }
        );
      });
  }

  getAllEvents(): WsEventDoc[] {
    return Array.from(this.events.values());
  }

  getEventsByCategory(): Map<string, WsEventDoc[]> {
    const grouped = new Map<string, WsEventDoc[]>();

    this.categories.forEach(category => {
      grouped.set(category, []);
    });

    this.events.forEach(event => {
      const list = grouped.get(event.category) || [];
      list.push(event);
      grouped.set(event.category, list);
    });

    return grouped;
  }

  getCategories(): string[] {
    return Array.from(this.categories);
  }

  getEvent(name: string): WsEventDoc | undefined {
    return this.events.get(name);
  }

  generateAsyncApiSpec(): object {
    return {
      asyncapi: '2.6.0',
      info: {
        title: process.env.WS_DOCS_TITLE || 'WebSocket API',
        version: process.env.WS_DOCS_VERSION || '1.0.0',
        description: 'WebSocket API Documentation'
      },
      servers: {
        production: {
          url: '{protocol}://{host}',
          protocol: 'wss',
          variables: {
            protocol: { default: 'wss', enum: ['ws', 'wss'] },
            host: { default: 'localhost:3000' }
          }
        }
      },
      channels: this.buildChannels(),
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    };
  }

  private buildChannels(): object {
    const channels: Record<string, object> = {};

    this.events.forEach((event, name) => {
      channels[name] = {
        description: event.description,
        [event.direction === 'client-to-server' ? 'publish' : 'subscribe']: {
          summary: event.description,
          tags: [{ name: event.category }],
          message: {
            payload: event.payload || {},
            examples: event.example ? [event.example] : []
          }
        }
      };
    });

    return channels;
  }
}
```

### 19.5 문서 UI 컨트롤러

```typescript
// src/core/socket/docs/ws-docs.controller.ts

import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { WsDocsService } from './ws-docs.service';
import { ApiExcludeController } from '@nestjs/swagger';

@Controller('ws-docs')
@ApiExcludeController()  // Swagger에서 제외
export class WsDocsController {
  constructor(private readonly wsDocsService: WsDocsService) {}

  /** 문서 HTML UI */
  @Get()
  getDocsHtml(@Res() res: Response) {
    const events = this.wsDocsService.getEventsByCategory();
    const categories = this.wsDocsService.getCategories();

    // HTML 렌더링
    res.send(this.renderDocsHtml(events, categories));
  }

  /** AsyncAPI JSON 스펙 */
  @Get('spec')
  getAsyncApiSpec() {
    return this.wsDocsService.generateAsyncApiSpec();
  }

  /** 모든 이벤트 목록 (JSON) */
  @Get('events')
  getAllEvents() {
    return {
      success: true,
      data: this.wsDocsService.getAllEvents()
    };
  }

  /** 카테고리별 이벤트 (JSON) */
  @Get('events/category/:category')
  getEventsByCategory(@Param('category') category: string) {
    const allEvents = this.wsDocsService.getEventsByCategory();
    const events = allEvents.get(category) || [];

    return {
      success: true,
      data: events
    };
  }

  /** 특정 이벤트 상세 (JSON) */
  @Get('events/:name')
  getEvent(@Param('name') name: string) {
    const event = this.wsDocsService.getEvent(name);

    if (!event) {
      return { success: false, error: { code: 'NOT_001', message: 'Event not found' } };
    }

    return { success: true, data: event };
  }

  private renderDocsHtml(events: Map<string, any[]>, categories: string[]): string {
    // HTML 템플릿 렌더링 (별도 파일로 분리 권장)
    return `<!DOCTYPE html>...`;  // 상세 HTML은 템플릿 파일 참조
  }
}
```

### 19.6 문서 모듈

```typescript
// src/core/socket/docs/ws-docs.module.ts

import { Module, DynamicModule } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { WsDocsController } from './ws-docs.controller';
import { WsDocsService } from './ws-docs.service';

export interface WsDocsModuleOptions {
  enabled: boolean;
  path?: string;
  title?: string;
  version?: string;
}

@Module({})
export class WsDocsModule {
  static forRoot(options?: WsDocsModuleOptions): DynamicModule {
    const enabled = options?.enabled ?? process.env.WS_DOCS_ENABLED === 'true';

    if (!enabled) {
      return {
        module: WsDocsModule,
        providers: [],
        controllers: [],
      };
    }

    return {
      module: WsDocsModule,
      imports: [DiscoveryModule],
      providers: [
        WsDocsService,
        {
          provide: 'WS_DOCS_OPTIONS',
          useValue: options,
        },
      ],
      controllers: [WsDocsController],
      exports: [WsDocsService],
    };
  }
}
```

### 19.7 연결 및 인증 문서

```typescript
// 문서화 전용 상수 (ws-docs.constants.ts)

export const WS_CONNECTION_DOCS = {
  connection: {
    title: 'WebSocket 연결',
    description: 'Socket.io 클라이언트로 연결',
    code: `
const socket = io('wss://your-server', {
  auth: {
    token: 'Bearer {accessToken}'
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});`,
    headers: {
      'auth.token': {
        type: 'string',
        description: 'JWT Access Token (Bearer 포함)',
        required: true,
        example: 'Bearer eyJhbGciOiJIUzI1NiIs...'
      }
    }
  },

  events: {
    connect: {
      direction: 'server-to-client',
      description: '연결 성공 시 발생',
      response: {
        socketId: 'string - 할당된 Socket ID'
      }
    },
    connect_error: {
      direction: 'server-to-client',
      description: '연결 실패 시 발생',
      response: {
        message: 'string - 에러 메시지'
      }
    },
    disconnect: {
      direction: 'bidirectional',
      description: '연결 종료 시 발생',
      response: {
        reason: 'string - 종료 사유'
      }
    },
    force_logout: {
      direction: 'server-to-client',
      description: '강제 로그아웃 (중복 로그인 등)',
      response: {
        reason: 'string - duplicate_login | token_expired | session_invalid'
      }
    }
  },

  rooms: {
    description: 'Room 참여/퇴장 이벤트',
    events: {
      'room:join': {
        direction: 'client-to-server',
        description: 'Room 참여 요청',
        payload: { roomId: 'string' },
        response: { success: 'boolean', members: 'number' }
      },
      'room:leave': {
        direction: 'client-to-server',
        description: 'Room 퇴장 요청',
        payload: { roomId: 'string' },
        response: { success: 'boolean' }
      }
    }
  }
};
```

### 19.8 클라이언트 SDK 코드 생성 (선택적 기능)

```typescript
// src/core/socket/docs/ws-docs.service.ts (추가 메서드)

/** TypeScript 클라이언트 타입 생성 */
generateClientTypes(): string {
  let types = `// Auto-generated WebSocket Types\n\n`;

  this.events.forEach((event, name) => {
    const safeName = name.replace(/[:.]/g, '_');

    if (event.payload) {
      types += `export interface ${safeName}_Payload {\n`;
      event.payload.fields?.forEach(field => {
        types += `  ${field.name}${field.required ? '' : '?'}: ${this.tsType(field.type)};\n`;
      });
      types += `}\n\n`;
    }

    if (event.response) {
      types += `export interface ${safeName}_Response {\n`;
      event.response.fields?.forEach(field => {
        types += `  ${field.name}: ${this.tsType(field.type)};\n`;
      });
      types += `}\n\n`;
    }
  });

  return types;
}

private tsType(type: string): string {
  const typeMap = {
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'object': 'Record<string, any>',
    'array': 'any[]'
  };
  return typeMap[type] || 'any';
}
```

### 19.9 활성화 설정

```typescript
// app.module.ts

import { WsDocsModule } from './core/socket/docs/ws-docs.module';

@Module({
  imports: [
    // ... 다른 모듈
    WsDocsModule.forRoot({
      enabled: process.env.WS_DOCS_ENABLED === 'true',
      path: process.env.WS_DOCS_PATH || '/ws-docs',
      title: process.env.WS_DOCS_TITLE || 'WebSocket API',
      version: process.env.WS_DOCS_VERSION || '1.0.0',
    }),
  ],
})
export class AppModule {}
```

### 19.10 문서 접근 경로

| 경로 | 설명 | 형식 |
|------|------|------|
| /ws-docs | 웹 UI 문서 | HTML |
| /ws-docs/spec | AsyncAPI 스펙 | JSON |
| /ws-docs/events | 전체 이벤트 목록 | JSON |
| /ws-docs/events/:name | 특정 이벤트 상세 | JSON |
| /ws-docs/events/category/:category | 카테고리별 이벤트 | JSON |

### 19.11 환경별 활성화

| 환경 | WS_DOCS_ENABLED | 접근 |
|------|-----------------|------|
| local | true | /ws-docs |
| dev | true | /ws-docs |
| prod | false | 비활성화 |

---

## 20. 의존성 패키지 목록

### 20.1 Production Dependencies

```json
{
  "dependencies": {
    "@nestjs/common": "^10.x",
    "@nestjs/core": "^10.x",
    "@nestjs/platform-express": "^10.x",
    "@nestjs/config": "^3.x",
    "@nestjs/passport": "^10.x",
    "@nestjs/jwt": "^10.x",
    "@nestjs/platform-socket.io": "^10.x",
    "@nestjs/schedule": "^4.x",
    "@nestjs/swagger": "^7.x",
    "@nestjs/terminus": "^10.x",
    "@prisma/client": "^5.x",
    "passport": "^0.7.x",
    "passport-google-oauth20": "^2.x",
    "passport-jwt": "^4.x",
    "ioredis": "^5.x",
    "socket.io": "^4.x",
    "@socket.io/redis-adapter": "^8.x",
    "helmet": "^7.x",
    "class-validator": "^0.14.x",
    "class-transformer": "^0.5.x",
    "bcrypt": "^5.x",
    "uuid": "^9.x",
    "dayjs": "^1.x",
    "winston": "^3.x",
    "winston-daily-rotate-file": "^4.x",
    "nodemailer": "^6.x",
    "@aws-sdk/client-s3": "^3.x",
    "nestjs-i18n": "^10.x"
  }
}
```

### 20.2 Development Dependencies

```json
{
  "devDependencies": {
    "@nestjs/cli": "^10.x",
    "@nestjs/schematics": "^10.x",
    "@nestjs/testing": "^10.x",
    "@types/node": "^20.x",
    "@types/express": "^4.x",
    "@types/passport-jwt": "^4.x",
    "@types/passport-google-oauth20": "^2.x",
    "@types/bcrypt": "^5.x",
    "@types/uuid": "^9.x",
    "@types/nodemailer": "^6.x",
    "prisma": "^5.x",
    "typescript": "^5.x",
    "ts-node": "^10.x",
    "jest": "^29.x",
    "@types/jest": "^29.x",
    "supertest": "^6.x",
    "@types/supertest": "^2.x",
    "eslint": "^8.x",
    "prettier": "^3.x"
  }
}
```

---

*이 지침서는 요구사항 분석을 바탕으로 작성되었으며, 구현 시 세부 조정이 필요할 수 있습니다.*

**문서 버전**: 1.1
**최종 수정**: 2025-02-05
