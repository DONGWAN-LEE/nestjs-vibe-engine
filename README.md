# Backend Engine

NestJS 기반 고성능 Backend Engine 템플릿

## 주요 기능

- Google OAuth + JWT 인증
- Socket.io 실시간 통신 (Redis Adapter)
- MySQL + Redis 캐시
- 1000명+ 동시 접속 지원
- Sharding 지원 (환경 설정으로 On/Off)
- Soft Delete + Delete DB 이관
- 다국어 지원 (i18n)
- 파일 업로드 (Local/S3)

## 빠른 시작

### 요구사항

- Node.js 22+
- MySQL 8.0+
- Redis 7+

### 설치

```bash
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
```

### Docker로 실행

```bash
# 개발 환경 (MySQL, Redis 포함)
docker-compose up -d

# 프로덕션
docker-compose -f docker-compose.prod.yml up -d
```

## 환경 설정

### 필수 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| DATABASE_URL | MySQL 연결 문자열 | mysql://user:pass@localhost:3306/db |
| REDIS_HOST | Redis 호스트 | localhost |
| REDIS_PORT | Redis 포트 | 6379 |
| JWT_SECRET | JWT 서명 키 | your-secret-key |
| GOOGLE_CLIENT_ID | Google OAuth ID | xxx.apps.googleusercontent.com |
| GOOGLE_CLIENT_SECRET | Google OAuth Secret | xxx |
| GOOGLE_CALLBACK_URL | OAuth 콜백 URL | http://localhost:3000/auth/google/callback |

### 기능 활성화/비활성화

| 변수 | 설명 | 기본값 |
|------|------|--------|
| DB_ENABLED | MySQL 사용 | true |
| REDIS_ENABLED | Redis 사용 | true |
| SHARDING_ENABLED | Sharding 사용 | false |
| SWAGGER_ENABLED | Swagger 활성화 | true |
| WS_DOCS_ENABLED | WebSocket 문서 활성화 | true |

### 환경별 설정 파일

| 환경 | 파일 | 용도 |
|------|------|------|
| Local | .env.local | 로컬 개발 |
| Dev | .env.dev | 개발 서버 |
| Prod | .env.prod | 프로덕션 |

## API 문서

개발 환경에서 문서 확인:

| 문서 | 경로 | 설명 |
|------|------|------|
| REST API | http://localhost:3000/api-docs | Swagger UI |
| WebSocket | http://localhost:3000/ws-docs | WebSocket 이벤트 문서 |

## 프로젝트 구조

```
src/
├── main.ts                 # 애플리케이션 진입점
├── app.module.ts           # 루트 모듈
├── auth/                   # 인증 (Google OAuth, JWT)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── strategies/
├── user/                   # 유저 관리
│   ├── user.controller.ts
│   ├── user.service.ts
│   └── user.repository.ts
├── health/                 # 헬스체크
├── core/                   # 핵심 인프라 모듈
│   ├── database/           # DB, Prisma, Sharding
│   ├── cache/              # Redis 캐시
│   ├── socket/             # Socket.io, Room 관리
│   ├── logger/             # 로깅 (API/Socket/Error)
│   ├── timezone/           # 타임존 변환
│   ├── encryption/         # 데이터 암호화
│   ├── upload/             # 파일 업로드 (Local/S3)
│   ├── mail/               # 이메일 발송
│   └── i18n/               # 다국어
└── common/                 # 공통 유틸리티
    ├── config/             # 환경 설정
    ├── decorators/         # 커스텀 데코레이터
    ├── filters/            # Exception Filters
    ├── guards/             # Auth Guards
    ├── interceptors/       # Interceptors
    └── middleware/         # Middleware
```

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run start:dev` | 개발 서버 실행 (watch mode) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start:prod` | 프로덕션 실행 |
| `npm run init` | 프로젝트 초기화 CLI |
| `npm run migrate:init` | 최초 DB 마이그레이션 |
| `npm run migrate:generate` | 마이그레이션 SQL 생성 |
| `npm run prisma:generate` | Prisma Client 생성 |
| `npm run test` | 테스트 실행 |
| `npm run test:e2e` | E2E 테스트 실행 |
| `npm run lint` | ESLint 검사 |

## 클라이언트 연동

### REST API

```typescript
// 헤더 설정
const headers = {
  'Authorization': 'Bearer {accessToken}',
  'Content-Type': 'application/json',
  'X-Timezone': 'Asia/Seoul'  // 선택적 - 응답 시간 변환용
};

// API 호출 예시
const response = await fetch('/api/v1/users/me', {
  method: 'GET',
  headers
});

// 응답 형식
{
  "success": true,
  "data": { ... }
}

// Token 만료 시 (401 응답)
// → /api/v1/auth/refresh 호출로 토큰 갱신
```

### Socket.io

```typescript
import { io } from 'socket.io-client';

const socket = io('wss://your-server', {
  auth: {
    token: `Bearer ${accessToken}`
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// 연결 성공
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

// 강제 로그아웃 처리
socket.on('force_logout', (data) => {
  console.log('Force logout:', data.reason);
  // 토큰 삭제 및 로그인 페이지 이동
});

// Room 참여
socket.emit('room:join', { roomId: 'group:123' });

// 메시지 전송
socket.emit('chat:send', {
  roomId: 'group:123',
  message: '안녕하세요!'
});

// 메시지 수신
socket.on('chat:message', (data) => {
  console.log('New message:', data);
});
```

## 인증 Flow

```
1. Client → /auth/google → Google OAuth 페이지
2. Google 인증 완료 → /auth/google/callback
3. 동시 접속 체크 (기존 세션 강제 종료)
4. Token 발급 (Access: 1시간, Refresh: 30일)
5. API 요청 시 Access Token 사용
6. 만료 시 /auth/refresh로 갱신
```

## 캐시 전략

| 데이터 | 캐시 키 | TTL |
|--------|---------|-----|
| 유저 정보 | `user_info:{userId}` | 1시간 |
| 세션 | `user_session:{userId}` | Access Token 만료와 동기화 |
| Rate Limit | `rate_limit:{userId}:{endpoint}` | 1분 |

**캐시 무효화**: DB 변경 시 관련 캐시 자동 삭제

## 로깅

```
logs/
├── api/           # REST API 로그
├── socket/        # Socket.io 로그
├── error/         # 에러 전용 로그
└── backup/        # 1개월 지난 로그 백업
```

- 콘솔 출력 금지 (파일만 기록)
- 파일 크기 제한: 50MB (초과 시 롤링)
- 1개월 지난 로그 자동 백업

## 보안

- JWT 서명 검증 (모든 요청)
- Refresh Token Rotation (탈취 감지)
- 동시 접속 제한 (1개 디바이스)
- Rate Limiting (Redis 기반)
- Helmet.js (보안 헤더)
- HTTPS Only (Production)

## 아키텍처 문서

상세한 설계 문서는 [ARCHITECTURE.md](./ARCHITECTURE.md) 참조

## 라이선스

MIT
