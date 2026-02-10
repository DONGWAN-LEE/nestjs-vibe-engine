/**
 * 캐시 서비스
 *
 * Redis 기반의 캐시 서비스를 제공합니다.
 * ioredis를 사용하여 Direct 모드와 Cluster 모드를 모두 지원하며,
 * 연결 상태 관리, 통계 추적, 장애 시 안전한 폴백 처리를 수행합니다.
 *
 * ARCHITECTURE.md Section 6 - Cache Strategy (Redis) 기반 구현
 *
 * @example
 * ```typescript
 * constructor(private readonly cacheService: CacheService) {}
 *
 * async getUserInfo(userId: string): Promise<UserInfo | null> {
 *   const cached = await this.cacheService.get<UserInfo>(`user_info:${userId}`);
 *   if (cached) return cached;
 *   const user = await this.fetchFromDb(userId);
 *   await this.cacheService.set(`user_info:${userId}`, user, 3600);
 *   return user;
 * }
 * ```
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Cluster } from 'ioredis';
import { LoggerService } from '../logger/logger.service';

/**
 * 캐시 통계 인터페이스
 *
 * 캐시 적중률 모니터링 및 연결 상태 확인에 사용됩니다.
 */
interface CacheStats {
  /** 캐시 적중 횟수 */
  hits: number;
  /** 캐시 미스 횟수 */
  misses: number;
  /** 현재 저장된 키 개수 (추정치) */
  keys: number;
  /** Redis 연결 상태 */
  connected: boolean;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  /** Redis 클라이언트 인스턴스 (Direct 또는 Cluster) */
  private client: Redis | Cluster | null = null;

  /** 캐시 통계 */
  private stats: CacheStats = { hits: 0, misses: 0, keys: 0, connected: false };

  /** Redis 연결 모드 */
  private readonly mode: 'direct' | 'cluster';

  /** Redis 활성화 여부 */
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('CacheService');
    this.mode = this.configService.get<string>('REDIS_MODE', 'direct') as 'direct' | 'cluster';
    this.enabled = this.configService.get<string>('REDIS_ENABLED', 'true') !== 'false';
  }

  /**
   * 모듈 초기화 시 Redis 연결을 수립합니다
   *
   * Direct 모드: 단일 Redis 인스턴스에 연결합니다.
   * Cluster 모드: REDIS_CLUSTER_NODES 설정에 정의된 노드들에 연결합니다.
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.info('Redis cache is disabled by configuration');
      return;
    }

    try {
      if (this.mode === 'cluster') {
        const nodesConfig = this.configService.get<string>('REDIS_CLUSTER_NODES', '');
        const nodes = nodesConfig
          .split(',')
          .filter(Boolean)
          .map((node) => {
            const [host, port] = node.trim().split(':');
            return { host, port: parseInt(port, 10) };
          });

        if (nodes.length === 0) {
          this.logger.warn('No cluster nodes configured, falling back to disabled state');
          this.stats.connected = false;
          return;
        }

        this.client = new Cluster(nodes, {
          redisOptions: {
            password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
          },
        });

        this.logger.info('Redis cluster connection established', {
          nodeCount: nodes.length,
        });
      } else {
        this.client = new Redis({
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
        });

        await this.client.connect();
        this.logger.info('Redis direct connection established', {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
        });
      }

      this.stats.connected = true;
    } catch (error) {
      this.stats.connected = false;
      this.logger.error('Failed to connect to Redis', {
        mode: this.mode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 모듈 소멸 시 Redis 연결을 정리합니다
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.stats.connected = false;
        this.logger.info('Redis connection closed gracefully');
      } catch (error) {
        this.logger.error('Error while closing Redis connection', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 캐시에서 값을 조회합니다
   *
   * 저장된 JSON 문자열을 파싱하여 원래 타입으로 반환합니다.
   * 키가 존재하지 않거나 오류 발생 시 null을 반환합니다.
   *
   * @typeParam T - 반환할 데이터 타입
   * @param key - 캐시 키
   * @returns 저장된 값 또는 null
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.stats.connected) {
      this.stats.misses++;
      return null;
    }

    try {
      const value = await this.client.get(key);

      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      this.stats.misses++;
      this.logger.error('Cache get operation failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 캐시에 값을 저장합니다
   *
   * 값은 JSON.stringify를 통해 직렬화되어 저장됩니다.
   * TTL이 지정되면 EX 옵션을 사용하여 만료 시간을 설정합니다.
   *
   * @typeParam T - 저장할 데이터 타입
   * @param key - 캐시 키
   * @param value - 저장할 값
   * @param ttlSeconds - TTL (초 단위, 선택적)
   * @returns 저장 성공 여부
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    if (!this.client || !this.stats.connected) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);

      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }

      return true;
    } catch (error) {
      this.logger.error('Cache set operation failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 캐시에서 하나 이상의 키를 삭제합니다
   *
   * @param keys - 삭제할 캐시 키 목록
   * @returns 실제로 삭제된 키의 개수
   */
  async del(...keys: string[]): Promise<number> {
    if (!this.client || !this.stats.connected || keys.length === 0) {
      return 0;
    }

    try {
      const result = await this.client.del(...keys);
      return result;
    } catch (error) {
      this.logger.error('Cache del operation failed', {
        keys,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * 캐시 키의 존재 여부를 확인합니다
   *
   * @param key - 확인할 캐시 키
   * @returns 키 존재 여부 (boolean)
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.stats.connected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('Cache exists operation failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 캐시 키의 만료 시간을 설정합니다
   *
   * @param key - 대상 캐시 키
   * @param ttlSeconds - 만료 시간 (초 단위)
   * @returns 설정 성공 여부
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client || !this.stats.connected) {
      return false;
    }

    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      this.logger.error('Cache expire operation failed', {
        key,
        ttlSeconds,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 캐시 키의 남은 TTL을 조회합니다
   *
   * @param key - 대상 캐시 키
   * @returns 남은 TTL (초). 키가 없으면 -2, TTL이 없으면 -1
   */
  async ttl(key: string): Promise<number> {
    if (!this.client || !this.stats.connected) {
      return -2;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error('Cache ttl operation failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return -2;
    }
  }

  /**
   * 패턴에 매칭되는 캐시 키 목록을 조회합니다
   *
   * 프로덕션 환경에서 KEYS 명령은 성능에 영향을 줄 수 있으므로
   * 제한적으로 사용해야 합니다.
   *
   * @param pattern - 글로브 패턴 (예: 'user_info:*')
   * @returns 매칭된 키 목록
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this.stats.connected) {
      return [];
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.error('Cache keys operation failed', {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 캐시 키의 정수 값을 1 증가시킵니다
   *
   * 키가 존재하지 않으면 0으로 초기화 후 증가합니다.
   * Rate Limiting 카운터 등에 사용됩니다.
   *
   * @param key - 대상 캐시 키
   * @returns 증가 후 값
   */
  async incr(key: string): Promise<number> {
    if (!this.client || !this.stats.connected) {
      return 0;
    }

    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.error('Cache incr operation failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * 캐시 키의 정수 값을 1 감소시킵니다
   *
   * 키가 존재하지 않으면 0으로 초기화 후 감소합니다.
   *
   * @param key - 대상 캐시 키
   * @returns 감소 후 값
   */
  async decr(key: string): Promise<number> {
    if (!this.client || !this.stats.connected) {
      return 0;
    }

    try {
      return await this.client.decr(key);
    } catch (error) {
      this.logger.error('Cache decr operation failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * 여러 캐시 키의 값을 한 번에 조회합니다
   *
   * Redis MGET 명령을 사용하여 네트워크 라운드트립을 최소화합니다.
   *
   * @typeParam T - 반환할 데이터 타입
   * @param keys - 조회할 캐시 키 목록
   * @returns 각 키에 대한 값 배열 (없는 키는 null)
   */
  async mget<T>(...keys: string[]): Promise<(T | null)[]> {
    if (!this.client || !this.stats.connected || keys.length === 0) {
      return keys.map(() => null);
    }

    try {
      const values = await this.client.mget(...keys);
      return values.map((value) => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      });
    } catch (error) {
      this.logger.error('Cache mget operation failed', {
        keys,
        error: error instanceof Error ? error.message : String(error),
      });
      return keys.map(() => null);
    }
  }

  /**
   * 여러 캐시 키-값 쌍을 한 번에 저장합니다
   *
   * 각 엔트리에 개별 TTL을 설정할 수 있습니다.
   * Redis 파이프라인을 사용하여 성능을 최적화합니다.
   *
   * @param entries - 저장할 엔트리 배열 (key, value, ttl 포함)
   * @returns 저장 성공 여부
   */
  async mset(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<boolean> {
    if (!this.client || !this.stats.connected || entries.length === 0) {
      return false;
    }

    try {
      const pipeline = this.client.pipeline();

      for (const entry of entries) {
        const serialized = JSON.stringify(entry.value);
        if (entry.ttl !== undefined && entry.ttl > 0) {
          pipeline.set(entry.key, serialized, 'EX', entry.ttl);
        } else {
          pipeline.set(entry.key, serialized);
        }
      }

      await pipeline.exec();
      return true;
    } catch (error) {
      this.logger.error('Cache mset operation failed', {
        entryCount: entries.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 캐시 통계를 반환합니다
   *
   * 적중률(hit rate) 계산 등에 사용됩니다.
   *
   * @returns 현재 캐시 통계
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Redis 연결 상태를 확인합니다
   *
   * @returns 연결 여부
   */
  isConnected(): boolean {
    return this.stats.connected;
  }

  /**
   * 현재 Redis 연결 모드를 반환합니다
   *
   * @returns 'direct' 또는 'cluster'
   */
  getMode(): 'direct' | 'cluster' {
    return this.mode;
  }

  /**
   * 현재 데이터베이스의 모든 키를 삭제합니다
   *
   * 주의: 프로덕션 환경에서 사용하지 않아야 합니다.
   * 주로 테스트 환경에서 상태 초기화에 사용됩니다.
   */
  async clear(): Promise<void> {
    if (!this.client || !this.stats.connected) {
      return;
    }

    try {
      await this.client.flushdb();
      this.stats.keys = 0;
    } catch (error) {
      this.logger.error('Cache clear operation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Redis 서버의 헬스 상태를 확인합니다
   *
   * PING 명령을 통해 응답 가능 여부를 검증합니다.
   *
   * @returns Redis 서버 정상 여부
   */
  async isHealthy(): Promise<boolean> {
    if (!this.client || !this.stats.connected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Redis 캐시 활성화 여부를 반환합니다
   *
   * @returns 활성화 여부
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
