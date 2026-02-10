/**
 * Setup Wizard 환경변수 정의
 *
 * 각 환경변수의 메타데이터를 정의합니다.
 * HTML 폼 생성과 유효성 검증에 공통 사용됩니다.
 *
 * @module setup
 */

export interface EnvDefinition {
  key: string;
  label: string;
  group: string;
  type: 'text' | 'password' | 'number' | 'select';
  defaultValue: string;
  placeholder: string;
  required: boolean;
  options?: string[];
  autoGenerate?: boolean;
  autoGenerateLength?: number;
  description?: string;
  hideWhenEnv?: string;
}

export const ENV_GROUPS = [
  { id: 'app', label: '앱 기본 설정', icon: '⚙️' },
  { id: 'database', label: '데이터베이스', icon: '🗄️' },
  { id: 'redis', label: 'Redis 캐시', icon: '📦' },
  { id: 'auth', label: '인증 / 보안', icon: '🔐' },
  { id: 'etc', label: '기타 설정', icon: '🔧' },
] as const;

export const ENV_DEFINITIONS: EnvDefinition[] = [
  // ── App ──
  {
    key: 'NODE_ENV',
    label: '실행 환경',
    group: 'app',
    type: 'select',
    defaultValue: 'local',
    placeholder: '',
    required: true,
    options: ['local', 'dev', 'prod'],
    description: 'local: 개발, dev: 개발서버, prod: 운영서버',
  },
  {
    key: 'PORT',
    label: '서버 포트',
    group: 'app',
    type: 'number',
    defaultValue: '3000',
    placeholder: '3000',
    required: true,
    description: 'NestJS 서버가 리스닝할 포트 번호',
  },
  {
    key: 'API_VERSION',
    label: 'API 버전',
    group: 'app',
    type: 'text',
    defaultValue: 'v1',
    placeholder: 'v1',
    required: true,
    description: 'API 경로 프리픽스에 사용 (예: /api/v1)',
  },

  // ── Database ──
  {
    key: 'DB_HOST',
    label: 'DB 호스트',
    group: 'database',
    type: 'text',
    defaultValue: 'localhost',
    placeholder: 'localhost',
    required: true,
    description: 'MySQL 서버 호스트 주소',
  },
  {
    key: 'DB_PORT',
    label: 'DB 포트',
    group: 'database',
    type: 'number',
    defaultValue: '3306',
    placeholder: '3306',
    required: true,
    description: 'MySQL 서버 포트 번호',
  },
  {
    key: 'DB_USER',
    label: 'DB 사용자명',
    group: 'database',
    type: 'text',
    defaultValue: 'root',
    placeholder: 'root',
    required: true,
    description: 'MySQL 접속 사용자 계정',
  },
  {
    key: 'DB_PASSWORD',
    label: 'DB 비밀번호',
    group: 'database',
    type: 'password',
    defaultValue: '',
    placeholder: '비밀번호 입력',
    required: true,
    description: 'MySQL 접속 비밀번호',
  },
  {
    key: 'DB_NAME',
    label: 'DB 이름',
    group: 'database',
    type: 'text',
    defaultValue: 'nestjs_engine_db',
    placeholder: 'nestjs_engine_db',
    required: true,
    description: '사용할 데이터베이스 이름',
  },

  // ── Redis ──
  {
    key: 'REDIS_MODE',
    label: 'Redis 모드',
    group: 'redis',
    type: 'select',
    defaultValue: 'direct',
    placeholder: '',
    required: true,
    options: ['direct', 'cluster'],
    description: 'direct: 단일 노드, cluster: 클러스터 모드',
  },
  {
    key: 'REDIS_HOST',
    label: 'Redis 호스트',
    group: 'redis',
    type: 'text',
    defaultValue: 'localhost',
    placeholder: 'localhost',
    required: true,
    description: 'Redis 서버 호스트 주소',
  },
  {
    key: 'REDIS_PORT',
    label: 'Redis 포트',
    group: 'redis',
    type: 'number',
    defaultValue: '6379',
    placeholder: '6379',
    required: true,
    description: 'Redis 서버 포트 번호',
  },
  {
    key: 'REDIS_PASSWORD',
    label: 'Redis 비밀번호',
    group: 'redis',
    type: 'password',
    defaultValue: '',
    placeholder: '비밀번호 (없으면 비워두세요)',
    required: false,
    description: 'Redis 인증 비밀번호 (선택)',
  },

  // ── Auth / Security ──
  {
    key: 'JWT_SECRET',
    label: 'JWT 시크릿 키',
    group: 'auth',
    type: 'password',
    defaultValue: '',
    placeholder: '32자 이상 랜덤 문자열',
    required: true,
    autoGenerate: true,
    autoGenerateLength: 64,
    description: 'JWT 토큰 서명에 사용되는 비밀 키',
  },
  {
    key: 'JWT_ACCESS_EXPIRES_IN',
    label: 'Access Token 만료',
    group: 'auth',
    type: 'text',
    defaultValue: '1h',
    placeholder: '1h',
    required: true,
    description: 'Access Token 만료 시간 (예: 1h, 30m, 7d)',
  },
  {
    key: 'JWT_REFRESH_EXPIRES_IN',
    label: 'Refresh Token 만료',
    group: 'auth',
    type: 'text',
    defaultValue: '30d',
    placeholder: '30d',
    required: true,
    description: 'Refresh Token 만료 시간 (예: 30d, 90d)',
  },
  {
    key: 'GOOGLE_CLIENT_ID',
    label: 'Google OAuth Client ID',
    group: 'auth',
    type: 'text',
    defaultValue: '',
    placeholder: 'xxx.apps.googleusercontent.com',
    required: false,
    description: 'Google Cloud Console에서 발급받은 OAuth Client ID',
  },
  {
    key: 'GOOGLE_CLIENT_SECRET',
    label: 'Google OAuth Client Secret',
    group: 'auth',
    type: 'password',
    defaultValue: '',
    placeholder: 'Google OAuth Secret',
    required: false,
    description: 'Google Cloud Console에서 발급받은 OAuth Client Secret',
  },
  {
    key: 'GOOGLE_CALLBACK_URL',
    label: 'Google OAuth Callback URL',
    group: 'auth',
    type: 'text',
    defaultValue: 'http://localhost:3000/api/v1/auth/google/callback',
    placeholder: 'http://localhost:3000/api/v1/auth/google/callback',
    required: false,
    description: 'Google OAuth 로그인 후 리다이렉트 URL',
  },
  {
    key: 'MAX_DEVICES_PER_USER',
    label: '최대 동시 접속 기기 수',
    group: 'auth',
    type: 'number',
    defaultValue: '1',
    placeholder: '1',
    required: true,
    description: '로그인 계정당 동시 접속 가능한 기기 수 (0 = 무제한)',
  },

  // ── Etc ──
  {
    key: 'ENCRYPTION_KEY',
    label: '암호화 키',
    group: 'etc',
    type: 'password',
    defaultValue: '',
    placeholder: '32바이트 암호화 키',
    required: true,
    autoGenerate: true,
    autoGenerateLength: 32,
    description: '민감 데이터 AES 암호화에 사용되는 키',
  },
  {
    key: 'DEFAULT_TIMEZONE',
    label: '기본 타임존',
    group: 'etc',
    type: 'text',
    defaultValue: 'Asia/Seoul',
    placeholder: 'Asia/Seoul',
    required: true,
    description: '클라이언트 미지정 시 사용할 기본 타임존',
  },
  {
    key: 'CORS_ORIGINS',
    label: 'CORS 허용 도메인',
    group: 'etc',
    type: 'text',
    defaultValue: '*',
    placeholder: 'http://localhost:3000 또는 * (전체 허용)',
    required: true,
    description: '쉼표로 구분하여 여러 도메인 입력 가능, *는 전체 허용',
  },
  {
    key: 'LOG_DIR',
    label: '로그 디렉토리',
    group: 'etc',
    type: 'text',
    defaultValue: './logs',
    placeholder: './logs',
    required: false,
    description: '로그 파일 저장 경로',
  },
  {
    key: 'SWAGGER_ENABLED',
    label: 'Swagger 문서 활성화',
    group: 'etc',
    type: 'select',
    defaultValue: 'true',
    placeholder: '',
    required: true,
    options: ['true', 'false'],
    description: 'API 문서 자동 생성 (prod 환경에서는 자동으로 비활성화됩니다)',
    hideWhenEnv: 'prod',
  },
  {
    key: 'SWAGGER_PATH',
    label: 'Swagger 경로',
    group: 'etc',
    type: 'text',
    defaultValue: '/api-docs',
    placeholder: '/api-docs',
    required: false,
    description: 'Swagger UI 접근 경로',
    hideWhenEnv: 'prod',
  },
];

/**
 * DB 개별 필드에서 DATABASE_URL을 조합합니다.
 */
export function buildDatabaseUrl(
  host: string,
  port: string,
  user: string,
  password: string,
  dbName: string,
): string {
  const encodedPassword = encodeURIComponent(password);
  return `mysql://${user}:${encodedPassword}@${host}:${port}/${dbName}`;
}

/**
 * DATABASE_URL에서 개별 필드를 파싱합니다.
 */
export function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  dbName: string;
} {
  const match = url.match(
    /^mysql:\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)$/,
  );
  if (!match) {
    return {
      host: 'localhost',
      port: '3306',
      user: 'root',
      password: '',
      dbName: 'nestjs_engine_db',
    };
  }
  return {
    user: match[1],
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: match[4],
    dbName: match[5],
  };
}
