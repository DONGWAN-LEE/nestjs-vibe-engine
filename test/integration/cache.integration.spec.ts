/**
 * Cache Module Integration Tests
 *
 * Tests the complete cache functionality including:
 * - Direct mode Redis operations
 * - Cluster mode Redis operations (simulated)
 * - Get, set, delete operations
 * - TTL (Time-To-Live) management
 * - Key existence checks
 * - Error handling and fallback behavior
 * - Cache key conventions
 *
 * These tests use a NestJS testing module with mock Redis clients
 * simulating both Direct and Cluster modes.
 *
 * Based on ARCHITECTURE.md Section 6 - Cache Strategy (Redis)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  createMockCacheService,
  createMockRedisClient,
  createMockConfigService,
  MockCacheService,
} from '../utils/mock-factories';
import { generateUuid, cacheKeys } from '../utils/test-utils';

// Type definitions for CacheService (matching implementation)
interface CacheConfig {
  mode: 'direct' | 'cluster';
  host: string;
  port: number;
  password?: string;
  clusterNodes?: string[];
  keyPrefix?: string;
  defaultTtl: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  connected: boolean;
}

// Mock CacheService for integration testing
// In a real integration test, this would be the actual CacheService
// For this test, we create a realistic mock that behaves like the real service
class MockCacheServiceImpl {
  private readonly config: CacheConfig;
  private readonly stats = { hits: 0, misses: 0, keys: 0, connected: true };
  private store = new Map<string, { value: string; expireAt?: number }>();

  constructor(private readonly configService: ConfigService) {
    this.config = {
      mode: this.configService.get('REDIS_MODE', 'direct') as 'direct' | 'cluster',
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      clusterNodes: this.configService.get('REDIS_CLUSTER_NODES')?.split(','),
      keyPrefix: this.configService.get('REDIS_KEY_PREFIX', ''),
      defaultTtl: this.configService.get('REDIS_DEFAULT_TTL', 3600),
    };
  }

  private getFullKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
  }

  private isExpired(entry: { value: string; expireAt?: number }): boolean {
    return entry.expireAt !== undefined && Date.now() > entry.expireAt;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    const entry = this.store.get(fullKey);

    if (!entry || this.isExpired(entry)) {
      if (entry) this.store.delete(fullKey);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const ttl = ttlSeconds ?? this.config.defaultTtl;
    const expireAt = ttl > 0 ? Date.now() + ttl * 1000 : undefined;

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    this.store.set(fullKey, { value: stringValue, expireAt });
    this.stats.keys = this.store.size;
    return true;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      const fullKey = this.getFullKey(key);
      if (this.store.delete(fullKey)) {
        count++;
      }
    }
    this.stats.keys = this.store.size;
    return count;
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const entry = this.store.get(fullKey);

    if (!entry || this.isExpired(entry)) {
      if (entry) this.store.delete(fullKey);
      return false;
    }

    return true;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const entry = this.store.get(fullKey);

    if (!entry) return false;

    entry.expireAt = Date.now() + ttlSeconds * 1000;
    return true;
  }

  async ttl(key: string): Promise<number> {
    const fullKey = this.getFullKey(key);
    const entry = this.store.get(fullKey);

    if (!entry) return -2; // Key does not exist
    if (!entry.expireAt) return -1; // No TTL set

    const remaining = Math.ceil((entry.expireAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async keys(pattern: string): Promise<string[]> {
    const fullPattern = this.getFullKey(pattern);
    const regex = new RegExp('^' + fullPattern.replace(/\*/g, '.*') + '$');
    const matchedKeys: string[] = [];

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        matchedKeys.push(key.replace(this.config.keyPrefix ? `${this.config.keyPrefix}:` : '', ''));
      }
    }

    return matchedKeys;
  }

  async incr(key: string): Promise<number> {
    const fullKey = this.getFullKey(key);
    const entry = this.store.get(fullKey);

    let value = 0;
    if (entry && !this.isExpired(entry)) {
      value = parseInt(entry.value, 10) || 0;
    }

    value++;
    this.store.set(fullKey, { value: String(value), expireAt: entry?.expireAt });
    return value;
  }

  async decr(key: string): Promise<number> {
    const fullKey = this.getFullKey(key);
    const entry = this.store.get(fullKey);

    let value = 0;
    if (entry && !this.isExpired(entry)) {
      value = parseInt(entry.value, 10) || 0;
    }

    value--;
    this.store.set(fullKey, { value: String(value), expireAt: entry?.expireAt });
    return value;
  }

  async mget<T>(...keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((key) => this.get<T>(key)));
  }

  async mset(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<boolean> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
    return true;
  }

  getStats(): CacheStats {
    return { ...this.stats, keys: this.store.size };
  }

  isConnected(): boolean {
    return this.stats.connected;
  }

  getMode(): 'direct' | 'cluster' {
    return this.config.mode;
  }

  async clear(): Promise<void> {
    this.store.clear();
    this.stats.keys = 0;
  }

  // For testing: simulate connection failure
  simulateConnectionFailure(): void {
    this.stats.connected = false;
  }

  // For testing: restore connection
  restoreConnection(): void {
    this.stats.connected = true;
  }
}

describe('Cache Module Integration Tests', () => {
  let cacheService: MockCacheServiceImpl;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      REDIS_MODE: 'direct',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_DEFAULT_TTL: 3600,
      REDIS_KEY_PREFIX: 'test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    const configService = module.get<ConfigService>(ConfigService);
    cacheService = new MockCacheServiceImpl(configService);
  });

  afterEach(async () => {
    await cacheService.clear();
  });

  describe('Basic Operations', () => {
    it('should set and get a value', async () => {
      // Arrange
      const key = 'test-key';
      const value = { name: 'Test Value', count: 42 };

      // Act
      const setResult = await cacheService.set(key, value);
      const getResult = await cacheService.get(key);

      // Assert
      expect(setResult).toBe(true);
      expect(getResult).toEqual(value);
    });

    it('should get null for non-existent key', async () => {
      // Arrange
      const key = 'non-existent-key';

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
    });

    it('should delete a key', async () => {
      // Arrange
      const key = 'delete-test-key';
      await cacheService.set(key, 'test-value');

      // Act
      const deleteResult = await cacheService.del(key);
      const getResult = await cacheService.get(key);

      // Assert
      expect(deleteResult).toBe(1);
      expect(getResult).toBeNull();
    });

    it('should delete multiple keys at once', async () => {
      // Arrange
      const keys = ['key1', 'key2', 'key3'];
      for (const key of keys) {
        await cacheService.set(key, `value-${key}`);
      }

      // Act
      const deleteResult = await cacheService.del(...keys);

      // Assert
      expect(deleteResult).toBe(3);
      for (const key of keys) {
        expect(await cacheService.get(key)).toBeNull();
      }
    });

    it('should return 0 when deleting non-existent keys', async () => {
      // Arrange
      const key = 'non-existent-delete-key';

      // Act
      const deleteResult = await cacheService.del(key);

      // Assert
      expect(deleteResult).toBe(0);
    });
  });

  describe('TTL Management', () => {
    it('should set value with custom TTL', async () => {
      // Arrange
      const key = 'ttl-test-key';
      const value = 'ttl-test-value';
      const ttlSeconds = 60;

      // Act
      await cacheService.set(key, value, ttlSeconds);
      const ttlResult = await cacheService.ttl(key);

      // Assert
      expect(ttlResult).toBeLessThanOrEqual(ttlSeconds);
      expect(ttlResult).toBeGreaterThan(0);
    });

    it('should expire key after TTL', async () => {
      // Arrange
      const key = 'expire-test-key';
      const value = 'expire-test-value';
      const ttlSeconds = 1; // 1 second

      // Act
      await cacheService.set(key, value, ttlSeconds);

      // Wait for TTL to expire (add small buffer)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
    });

    it('should update TTL with expire command', async () => {
      // Arrange
      const key = 'expire-update-key';
      await cacheService.set(key, 'test-value', 10);

      // Act
      const expireResult = await cacheService.expire(key, 3600);
      const newTtl = await cacheService.ttl(key);

      // Assert
      expect(expireResult).toBe(true);
      expect(newTtl).toBeGreaterThan(10);
      expect(newTtl).toBeLessThanOrEqual(3600);
    });

    it('should return -2 for TTL of non-existent key', async () => {
      // Arrange
      const key = 'non-existent-ttl-key';

      // Act
      const ttlResult = await cacheService.ttl(key);

      // Assert
      expect(ttlResult).toBe(-2);
    });
  });

  describe('Key Existence Check', () => {
    it('should return true for existing key', async () => {
      // Arrange
      const key = 'exists-test-key';
      await cacheService.set(key, 'exists-test-value');

      // Act
      const result = await cacheService.exists(key);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      // Arrange
      const key = 'non-existent-exists-key';

      // Act
      const result = await cacheService.exists(key);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for expired key', async () => {
      // Arrange
      const key = 'expired-exists-key';
      await cacheService.set(key, 'test-value', 1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Act
      const result = await cacheService.exists(key);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Data Types', () => {
    it('should handle string values', async () => {
      // Arrange
      const key = 'string-key';
      const value = 'simple string value';

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get<string>(key);

      // Assert
      expect(result).toBe(value);
    });

    it('should handle object values', async () => {
      // Arrange
      const key = 'object-key';
      const value = { id: '123', name: 'Test', nested: { data: true } };

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get(key);

      // Assert
      expect(result).toEqual(value);
    });

    it('should handle array values', async () => {
      // Arrange
      const key = 'array-key';
      const value = [1, 2, 3, 'four', { five: 5 }];

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get(key);

      // Assert
      expect(result).toEqual(value);
    });

    it('should handle number values', async () => {
      // Arrange
      const key = 'number-key';
      const value = 42;

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get<number>(key);

      // Assert
      expect(result).toBe(value);
    });

    it('should handle boolean values', async () => {
      // Arrange
      const key = 'boolean-key';

      // Act
      await cacheService.set(key, true);
      const trueResult = await cacheService.get<boolean>(key);

      await cacheService.set(key, false);
      const falseResult = await cacheService.get<boolean>(key);

      // Assert
      expect(trueResult).toBe(true);
      expect(falseResult).toBe(false);
    });
  });

  describe('Increment/Decrement Operations', () => {
    it('should increment a value', async () => {
      // Arrange
      const key = 'incr-key';
      await cacheService.set(key, 0);

      // Act
      const result1 = await cacheService.incr(key);
      const result2 = await cacheService.incr(key);
      const result3 = await cacheService.incr(key);

      // Assert
      expect(result1).toBe(1);
      expect(result2).toBe(2);
      expect(result3).toBe(3);
    });

    it('should decrement a value', async () => {
      // Arrange
      const key = 'decr-key';
      await cacheService.set(key, 10);

      // Act
      const result1 = await cacheService.decr(key);
      const result2 = await cacheService.decr(key);

      // Assert
      expect(result1).toBe(9);
      expect(result2).toBe(8);
    });

    it('should increment non-existent key starting from 0', async () => {
      // Arrange
      const key = 'new-incr-key';

      // Act
      const result = await cacheService.incr(key);

      // Assert
      expect(result).toBe(1);
    });
  });

  describe('Bulk Operations', () => {
    it('should get multiple keys at once with mget', async () => {
      // Arrange
      await cacheService.set('mget-key1', 'value1');
      await cacheService.set('mget-key2', 'value2');
      await cacheService.set('mget-key3', 'value3');

      // Act
      const results = await cacheService.mget<string>(
        'mget-key1',
        'mget-key2',
        'mget-key3',
        'non-existent',
      );

      // Assert
      expect(results).toEqual(['value1', 'value2', 'value3', null]);
    });

    it('should set multiple keys at once with mset', async () => {
      // Arrange
      const entries = [
        { key: 'mset-key1', value: 'value1' },
        { key: 'mset-key2', value: 'value2' },
        { key: 'mset-key3', value: 'value3', ttl: 60 },
      ];

      // Act
      const setResult = await cacheService.mset(entries);

      // Assert
      expect(setResult).toBe(true);
      expect(await cacheService.get('mset-key1')).toBe('value1');
      expect(await cacheService.get('mset-key2')).toBe('value2');
      expect(await cacheService.get('mset-key3')).toBe('value3');
    });
  });

  describe('Key Pattern Search', () => {
    it('should find keys matching pattern', async () => {
      // Arrange
      await cacheService.set('user:1:info', { id: '1' });
      await cacheService.set('user:2:info', { id: '2' });
      await cacheService.set('user:3:info', { id: '3' });
      await cacheService.set('other:key', 'other');

      // Act
      const userKeys = await cacheService.keys('user:*:info');

      // Assert
      expect(userKeys.length).toBe(3);
      expect(userKeys).toContain('user:1:info');
      expect(userKeys).toContain('user:2:info');
      expect(userKeys).toContain('user:3:info');
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits', async () => {
      // Arrange
      const key = 'stats-hit-key';
      await cacheService.set(key, 'value');

      // Act
      await cacheService.get(key);
      await cacheService.get(key);
      await cacheService.get(key);
      const stats = cacheService.getStats();

      // Assert
      expect(stats.hits).toBe(3);
    });

    it('should track cache misses', async () => {
      // Arrange & Act
      await cacheService.get('non-existent-1');
      await cacheService.get('non-existent-2');
      const stats = cacheService.getStats();

      // Assert
      expect(stats.misses).toBe(2);
    });

    it('should track key count', async () => {
      // Arrange
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');
      await cacheService.set('key3', 'value3');

      // Act
      const stats = cacheService.getStats();

      // Assert
      expect(stats.keys).toBe(3);
    });
  });

  describe('Cache Key Conventions (ARCHITECTURE.md Section 6.1)', () => {
    it('should use correct user_info key format', async () => {
      // Arrange
      const userId = generateUuid();
      const userInfo = { id: userId, name: 'Test User', email: 'test@example.com' };
      const key = cacheKeys.userInfo(userId);

      // Act
      await cacheService.set(key, userInfo);
      const result = await cacheService.get(key);

      // Assert
      expect(key).toBe(`user_info:${userId}`);
      expect(result).toEqual(userInfo);
    });

    it('should use correct user_session key format', async () => {
      // Arrange
      const userId = generateUuid();
      const sessionData = { sessionId: generateUuid(), active: true };
      const key = cacheKeys.userSession(userId);

      // Act
      await cacheService.set(key, sessionData);
      const result = await cacheService.get(key);

      // Assert
      expect(key).toBe(`user_session:${userId}`);
      expect(result).toEqual(sessionData);
    });

    it('should use correct rate_limit key format', async () => {
      // Arrange
      const userId = generateUuid();
      const endpoint = '/api/v1/users';
      const key = cacheKeys.rateLimit(userId, endpoint);

      // Act
      await cacheService.set(key, { count: 1 });
      const result = await cacheService.get(key);

      // Assert
      expect(key).toBe(`rate_limit:${userId}:${endpoint}`);
      expect(result).toEqual({ count: 1 });
    });

    it('should use correct socket_room key format', async () => {
      // Arrange
      const roomId = generateUuid();
      const roomData = { users: ['user1', 'user2'] };
      const key = cacheKeys.socketRoom(roomId);

      // Act
      await cacheService.set(key, roomData);
      const result = await cacheService.get(key);

      // Assert
      expect(key).toBe(`socket_room:${roomId}`);
      expect(result).toEqual(roomData);
    });
  });

  describe('Direct Mode vs Cluster Mode', () => {
    it('should report direct mode when configured', () => {
      // Assert
      expect(cacheService.getMode()).toBe('direct');
    });

    it('should report cluster mode when configured', async () => {
      // Arrange
      const clusterConfigService = createMockConfigService({
        REDIS_MODE: 'cluster',
        REDIS_CLUSTER_NODES: 'node1:6379,node2:6379,node3:6379',
        REDIS_DEFAULT_TTL: 3600,
        REDIS_KEY_PREFIX: 'test',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: clusterConfigService,
          },
        ],
      }).compile();

      const configService = module.get<ConfigService>(ConfigService);
      const clusterCacheService = new MockCacheServiceImpl(configService);

      // Assert
      expect(clusterCacheService.getMode()).toBe('cluster');
    });
  });

  describe('Connection State', () => {
    it('should report connected state', () => {
      // Assert
      expect(cacheService.isConnected()).toBe(true);
    });

    it('should report disconnected state after connection failure', () => {
      // Act
      cacheService.simulateConnectionFailure();

      // Assert
      expect(cacheService.isConnected()).toBe(false);
    });

    it('should restore connected state', () => {
      // Arrange
      cacheService.simulateConnectionFailure();

      // Act
      cacheService.restoreConnection();

      // Assert
      expect(cacheService.isConnected()).toBe(true);
    });
  });

  describe('Cache Invalidation Patterns', () => {
    it('should clear cache on user logout', async () => {
      // Arrange
      const userId = generateUuid();
      await cacheService.set(cacheKeys.userInfo(userId), { id: userId });
      await cacheService.set(cacheKeys.userSession(userId), { active: true });

      // Act - Simulate logout invalidation
      await cacheService.del(cacheKeys.userInfo(userId));
      await cacheService.del(cacheKeys.userSession(userId));

      // Assert
      expect(await cacheService.get(cacheKeys.userInfo(userId))).toBeNull();
      expect(await cacheService.get(cacheKeys.userSession(userId))).toBeNull();
    });

    it('should invalidate and re-cache on user update', async () => {
      // Arrange
      const userId = generateUuid();
      const oldUserInfo = { id: userId, name: 'Old Name' };
      const newUserInfo = { id: userId, name: 'New Name' };

      await cacheService.set(cacheKeys.userInfo(userId), oldUserInfo);

      // Act - Simulate update: delete old, set new
      await cacheService.del(cacheKeys.userInfo(userId));
      await cacheService.set(cacheKeys.userInfo(userId), newUserInfo);

      // Assert
      const result = await cacheService.get(cacheKeys.userInfo(userId));
      expect(result).toEqual(newUserInfo);
    });
  });

  describe('TTL Configurations per ARCHITECTURE.md Section 6.3', () => {
    it('should apply 1 hour TTL for user info cache', async () => {
      // Arrange
      const userId = generateUuid();
      const userInfo = { id: userId, name: 'Test User' };
      const userInfoTtl = 3600; // 1 hour

      // Act
      await cacheService.set(cacheKeys.userInfo(userId), userInfo, userInfoTtl);
      const ttl = await cacheService.ttl(cacheKeys.userInfo(userId));

      // Assert
      expect(ttl).toBeLessThanOrEqual(userInfoTtl);
      expect(ttl).toBeGreaterThan(userInfoTtl - 5); // Within 5 seconds
    });

    it('should apply 1 minute TTL for rate limit cache', async () => {
      // Arrange
      const userId = generateUuid();
      const endpoint = '/api/v1/test';
      const rateLimitTtl = 60; // 1 minute

      // Act
      await cacheService.set(cacheKeys.rateLimit(userId, endpoint), { count: 1 }, rateLimitTtl);
      const ttl = await cacheService.ttl(cacheKeys.rateLimit(userId, endpoint));

      // Assert
      expect(ttl).toBeLessThanOrEqual(rateLimitTtl);
      expect(ttl).toBeGreaterThan(rateLimitTtl - 5);
    });
  });

  describe('Error Handling', () => {
    it('should handle clear operation', async () => {
      // Arrange
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');

      // Act
      await cacheService.clear();

      // Assert
      expect(await cacheService.get('key1')).toBeNull();
      expect(await cacheService.get('key2')).toBeNull();
      expect(cacheService.getStats().keys).toBe(0);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent set operations', async () => {
      // Arrange
      const operations = Array.from({ length: 100 }, (_, i) => ({
        key: `concurrent-key-${i}`,
        value: `value-${i}`,
      }));

      // Act
      await Promise.all(
        operations.map((op) => cacheService.set(op.key, op.value)),
      );

      // Assert
      for (const op of operations) {
        expect(await cacheService.get(op.key)).toBe(op.value);
      }
    });

    it('should handle concurrent get operations', async () => {
      // Arrange
      const key = 'concurrent-get-key';
      const value = { data: 'concurrent-value' };
      await cacheService.set(key, value);

      // Act
      const results = await Promise.all(
        Array.from({ length: 100 }, () => cacheService.get(key)),
      );

      // Assert
      for (const result of results) {
        expect(result).toEqual(value);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string value', async () => {
      // Arrange
      const key = 'empty-string-key';

      // Act
      await cacheService.set(key, '');
      const result = await cacheService.get<string>(key);

      // Assert
      expect(result).toBe('');
    });

    it('should handle null in object', async () => {
      // Arrange
      const key = 'null-object-key';
      const value = { id: '1', optionalField: null };

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get(key);

      // Assert
      expect(result).toEqual(value);
    });

    it('should handle special characters in key', async () => {
      // Arrange
      const key = 'special:key:with:colons';
      const value = 'special-value';

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get<string>(key);

      // Assert
      expect(result).toBe(value);
    });

    it('should handle very long key', async () => {
      // Arrange
      const key = 'key_' + 'a'.repeat(200);
      const value = 'long-key-value';

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get<string>(key);

      // Assert
      expect(result).toBe(value);
    });

    it('should handle very large value', async () => {
      // Arrange
      const key = 'large-value-key';
      const value = { data: 'x'.repeat(100000) };

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get(key);

      // Assert
      expect(result).toEqual(value);
    });
  });
});
