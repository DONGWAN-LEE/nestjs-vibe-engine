# NestJS Engine

NestJS 기반 고성능 Backend Engine 템플릿. 인증, 실시간 통신, 캐싱, 로깅 등 백엔드에 필요한 핵심 인프라가 사전 구성되어 있어, 비즈니스 로직 개발에만 집중할 수 있습니다.

## 이런 프로젝트를 만들 수 있습니다

| 분류 | 예시 |
|------|------|
| **RESTful API 서버** | 쇼핑몰 백엔드, 블로그 API, CMS, 관리자 대시보드 API |
| **실시간 채팅/메신저** | 1:1 채팅, 그룹 채팅, 채팅방 관리 (Socket.io + Room) |
| **실시간 협업 도구** | 공유 문서 편집, 칸반 보드, 프로젝트 관리 도구 |
| **게임 서버** | 턴제 게임, 실시간 멀티플레이어, 매칭 시스템 |
| **알림 시스템** | 실시간 푸시 알림, 이벤트 브로드캐스트, 알림 센터 |
| **IoT 백엔드** | 센서 데이터 수집, 디바이스 제어, 실시간 모니터링 |
| **SaaS 백엔드** | 멀티 테넌트 API, 구독 관리, 사용량 추적 |

## 주요 기능

### Web Setup Wizard
- 브라우저 기반 초기 설정 UI (`http://localhost:4321`)
- 환경변수 폼 입력 → `.env` 자동 생성 → DB 자동 생성 → 테이블 생성 → NestJS 부팅
- DB 연결 테스트 버튼으로 사전 확인
- JWT Secret, 암호화 키 자동 생성
- `.env` 존재 시 기존 값 프리필 + 수정 가능

### 인증 / 보안
- **Google OAuth 2.0** - 소셜 로그인
- **JWT 인증** - Access Token (1h) + Refresh Token (30d)
- **Refresh Token Rotation** - 토큰 탈취 감지
- **동시 접속 제한** - 계정당 기기 수 제한 (0=무제한)
- **강제 로그아웃** - 소켓 이벤트로 실시간 세션 종료
- **Helmet.js** - 보안 HTTP 헤더

### 실시간 통신
- **Socket.io** - WebSocket 기반 양방향 통신
- **Redis Adapter** - 멀티 인스턴스 간 소켓 이벤트 공유
- **Room 관리** - 채팅방/그룹 참여, 퇴장, 메시지 브로드캐스트
- **JWT 인증** - 소켓 연결 시 토큰 검증
- **WebSocket 문서화** - AsyncAPI 기반 이벤트 문서 자동 생성

### 데이터베이스
- **MySQL + Prisma ORM** - 타입 안전한 DB 접근
- **Soft Delete** - `deletedAt` 필드 기반 논리 삭제
- **Delete DB 이관** - 삭제 데이터 별도 DB 이관 (보관 기간 설정)
- **Connection Pooling** - 환경별 풀 크기 조절

### 캐싱 / 성능
- **Redis 캐시** - Direct/Cluster 모드 지원
- **캐시 인터셉터** - 데코레이터 기반 자동 캐싱
- **Rate Limiting** - Redis 기반 요청 제한
- **캐시 무효화** - DB 변경 시 관련 캐시 자동 삭제

### 로깅 / 모니터링
- **Winston Logger** - API / Socket / Error 로그 분리
- **Daily Rotate File** - 파일 크기 50MB 제한, 자동 롤링
- **로그 백업** - 1개월 지난 로그 자동 백업
- **헬스체크** - `/api/v1/health` 엔드포인트

### 횡단 관심사
- **타임존 변환** - UTC+0 저장, Response 시 클라이언트 타임존으로 변환
- **AES 암호화** - 민감 데이터 암호화 서비스
- **Exception Filter** - 통일된 에러 응답 형식
- **Validation Pipe** - DTO 기반 자동 유효성 검증
- **CORS** - 환경별 허용 도메인 설정

### API 문서
- **Swagger UI** - REST API 문서 자동 생성 (prod 환경 자동 비활성화)
- **WebSocket Docs** - Socket.io 이벤트 문서 (`/ws-docs`)

## 요구사항

| 도구 | 버전 |
|------|------|
| Node.js | 22+ |
| MySQL | 8.0+ (또는 MariaDB 10.6+) |
| Redis | 7+ |

## 빠른 시작

### 1. 설치

```bash
git clone <repository-url> my-project
cd my-project
npm install
```

### 2. 실행

```bash
npm run start:dev
```

브라우저에서 `http://localhost:4321` 을 열어 Setup Wizard를 진행합니다.

### 3. Setup Wizard

```
npm run start:dev
    │
    ├─ .env 없음 → Setup Wizard 폼 바로 진입
    │
    └─ .env 있음 → 선택 화면
                    ├─ "기존 설정으로 시작" → NestJS 앱 부팅
                    └─ "Setup Wizard 진입" → 기존 값 프리필 → 수정 가능
```

Setup Wizard 처리 순서:

1. 환경변수 폼 입력 (5개 그룹: 앱, DB, Redis, 인증, 기타)
2. DB 연결 테스트 (버튼으로 사전 확인 가능)
3. 데이터베이스 자동 생성 (없으면 CREATE DATABASE)
4. `.env` 파일 저장
5. Prisma Client 생성 + DB 테이블 생성
6. NestJS 앱 자동 시작

### 4. Setup Wizard 재실행

`.env` 파일이 존재하면 서버 재시작 시 Setup Wizard 없이 NestJS가 바로 실행됩니다.
Setup Wizard를 다시 실행하려면:

```bash
# 방법 1: .env 파일 삭제 후 재시작
rm .env
npm run start:dev

# 방법 2: FORCE_SETUP 환경변수로 강제 실행
npm run setup
```

### 5. 확인

Setup 완료 후 NestJS가 자동 부팅됩니다.

| 경로 | 설명 |
|------|------|
| `http://localhost:3000/api/v1/health` | 헬스체크 |
| `http://localhost:3000/api-docs` | Swagger API 문서 |
| `http://localhost:3000/ws-docs` | WebSocket 이벤트 문서 |

## 스크립트

### 실행

| 명령어 | 설명 |
|--------|------|
| `npm run start:dev` | 개발 서버 (watch mode) |
| `npm run start` | 프로덕션 시작 |
| `npm run start:prod` | 빌드 후 프로덕션 실행 |
| `npm run setup` | Setup Wizard 강제 실행 |
| `npm run setup:dev` | Setup Wizard 강제 실행 (watch mode) |

### 빌드 & 품질

| 명령어 | 설명 |
|--------|------|
| `npm run build` | TypeScript 빌드 |
| `npm run lint` | ESLint 검사 + 자동 수정 |
| `npm run format` | Prettier 포맷팅 |

### 테스트

| 명령어 | 설명 |
|--------|------|
| `npm test` | 전체 테스트 실행 |
| `npm run test:watch` | Watch 모드 |
| `npm run test:cov` | 커버리지 리포트 |
| `npm run test:e2e` | E2E 테스트 |

### Prisma

| 명령어 | 설명 |
|--------|------|
| `npm run prisma:generate` | Prisma Client 생성 |
| `npm run prisma:migrate` | 마이그레이션 실행 |
| `npm run migrate:init` | 최초 마이그레이션 |
| `npm run migrate:generate` | 마이그레이션 SQL 생성 (적용 안 함) |

## 환경변수

Setup Wizard에서 자동 설정되며, `.env` 파일로 관리됩니다.

### 앱 기본

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `NODE_ENV` | 실행 환경 (`local` / `dev` / `prod`) | `local` |
| `PORT` | 서버 포트 | `3000` |
| `API_VERSION` | API 버전 프리픽스 | `v1` |

### 데이터베이스

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DATABASE_URL` | MySQL 연결 문자열 (자동 생성) | - |

Setup Wizard에서 Host, Port, User, Password, DB Name을 개별 입력하면 `DATABASE_URL`이 자동 조합됩니다. DB가 없으면 자동 생성됩니다.

### Redis

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `REDIS_MODE` | 연결 모드 (`direct` / `cluster`) | `direct` |
| `REDIS_HOST` | 호스트 | `localhost` |
| `REDIS_PORT` | 포트 | `6379` |
| `REDIS_PASSWORD` | 비밀번호 (선택) | - |

### 인증 / 보안

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `JWT_SECRET` | JWT 서명 키 (자동 생성 가능) | - |
| `JWT_ACCESS_EXPIRES_IN` | Access Token 만료 | `1h` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token 만료 | `30d` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | - |
| `GOOGLE_CALLBACK_URL` | OAuth Callback URL | `http://localhost:3000/api/v1/auth/google/callback` |
| `MAX_DEVICES_PER_USER` | 계정당 동시 접속 기기 수 (0=무제한) | `1` |

### 기타

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ENCRYPTION_KEY` | AES 암호화 키 (자동 생성 가능) | - |
| `DEFAULT_TIMEZONE` | 기본 타임존 | `Asia/Seoul` |
| `CORS_ORIGINS` | 허용 도메인 (`*`=전체) | `*` |
| `LOG_DIR` | 로그 저장 경로 | `./logs` |
| `SWAGGER_ENABLED` | Swagger 활성화 (prod에서 자동 비활성화) | `true` |
| `SWAGGER_PATH` | Swagger 경로 | `/api-docs` |

## 프로젝트 구조

```
src/
├── main.ts                     # 진입점 (Setup Wizard 분기 포함)
├── app.module.ts               # 루트 모듈
├── setup/                      # Web Setup Wizard
│   ├── setup.server.ts         # Express 서버 (독립 동작)
│   ├── setup.html.ts           # HTML 템플릿 (Vanilla JS)
│   └── env-definitions.ts      # 환경변수 메타데이터
├── auth/                       # 인증 모듈
│   ├── auth.controller.ts      # Google OAuth 엔드포인트
│   ├── auth.service.ts         # JWT 발급, 세션 관리
│   ├── strategies/             # Passport 전략 (Google, JWT)
│   ├── guards/                 # Token 검증 Guard
│   └── dto/                    # 요청/응답 DTO
├── user/                       # 유저 모듈
│   ├── user.controller.ts
│   ├── user.service.ts
│   ├── user.repository.ts
│   └── dto/
├── health/                     # 헬스체크 (/api/v1/health)
├── core/                       # 핵심 인프라
│   ├── database/               # Prisma, Soft Delete, Delete 이관
│   ├── cache/                  # Redis 캐시 서비스
│   ├── socket/                 # Socket.io, Room 관리, WS 문서화
│   ├── logger/                 # Winston (API/Socket/Error 분리)
│   ├── timezone/               # UTC 저장, Response 시 변환
│   └── encryption/             # AES 암호화
└── common/                     # 공통
    ├── config/                 # 환경 설정 (app, database, redis, jwt)
    ├── decorators/             # @CurrentUser, @Timezone
    ├── filters/                # HttpException Filter
    ├── guards/                 # JWT Auth, WS Auth Guard
    ├── interceptors/           # Cache Interceptor
    ├── interfaces/             # API Response 인터페이스
    ├── middleware/              # Rate Limit Middleware
    └── utils.ts                # 공통 유틸리티
```

## 인증 Flow

```
1. Client → GET /api/v1/auth/google → Google OAuth 페이지 리다이렉트
2. Google 인증 완료 → GET /api/v1/auth/google/callback
3. 동시 접속 체크 → 초과 시 기존 세션 강제 종료 (force_logout 소켓 이벤트)
4. Token 발급 → Access Token (1h) + Refresh Token (30d)
5. API 요청 → Authorization: Bearer {accessToken}
6. Token 만료 → POST /api/v1/auth/refresh 로 갱신
```

## 클라이언트 연동

### REST API

```typescript
const headers = {
  'Authorization': 'Bearer {accessToken}',
  'Content-Type': 'application/json',
  'X-Timezone': 'Asia/Seoul',  // 선택 - 응답 시간 변환용
};

const response = await fetch('http://localhost:3000/api/v1/users/me', {
  method: 'GET',
  headers,
});

// 응답 형식
// { "success": true, "data": { ... } }
```

### Socket.io

```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: { token: `Bearer ${accessToken}` },
  transports: ['websocket'],
});

socket.on('connect', () => console.log('Connected:', socket.id));
socket.on('force_logout', (data) => { /* 강제 로그아웃 처리 */ });

socket.emit('room:join', { roomId: 'group:123' });
socket.emit('chat:send', { roomId: 'group:123', message: 'Hello!' });
socket.on('chat:message', (data) => console.log(data));
```

## 테스트

```bash
# 전체 테스트 (259개)
npm test

# 커버리지 포함
npm run test:cov
```

```
test/
├── e2e/                          # E2E 테스트
│   ├── auth.e2e-spec.ts
│   ├── health.e2e-spec.ts
│   ├── socket.e2e-spec.ts
│   └── user.e2e-spec.ts
├── integration/                  # 통합 테스트
│   ├── auth.integration.spec.ts
│   ├── cache.integration.spec.ts
│   ├── session.integration.spec.ts
│   └── user.integration.spec.ts
└── utils/                        # 테스트 유틸리티
```

## 기술 스택

| 분류 | 기술 |
|------|------|
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| Database | MySQL 8+ / Prisma ORM |
| Cache | Redis 7+ / ioredis |
| Auth | Passport (Google OAuth, JWT) |
| Realtime | Socket.io + Redis Adapter |
| Logging | Winston + Daily Rotate File |
| Docs | Swagger (REST) + AsyncAPI (WebSocket) |
| Testing | Jest + Supertest |
| Security | Helmet, bcrypt, AES-256 |

## 설계 원칙

- 요청당 최대 3개 쿼리, 캐시 우선
- `console.log` 금지 (Winston Logger 사용)
- N+1 쿼리 금지
- UTC+0 저장, Response 시 타임존 변환
- Soft Delete (deletedAt 필드)
- 무한 루프 금지 (모든 반복문에 종료 조건)

## 아키텍처 문서

상세한 설계 문서는 [ARCHITECTURE.md](./ARCHITECTURE.md) 참조

## 라이선스

UNLICENSED
