/**
 * Redis 설정
 *
 * Redis 연결에 필요한 설정을 정의합니다.
 * Direct 모드와 Cluster 모드를 지원하며,
 * 모드에 따라 적절한 연결 정보를 제공합니다.
 *
 * @module common/config
 */

import { registerAs } from '@nestjs/config';

/**
 * Redis 캐시 서버 설정을 등록합니다.
 *
 * @description
 * - mode: 연결 모드 ('direct' 또는 'cluster')
 * - host: Redis 서버 호스트 주소
 * - port: Redis 서버 포트 번호
 * - password: Redis 인증 비밀번호 (선택)
 * - clusterNodes: 클러스터 모드 시 노드 목록 (콤마 구분)
 */
export default registerAs('redis', () => ({
  mode: process.env.REDIS_MODE || 'direct',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  clusterNodes: process.env.REDIS_CLUSTER_NODES
    ? process.env.REDIS_CLUSTER_NODES.split(',').map((node) => {
        const [host, port] = node.trim().split(':');
        return { host, port: parseInt(port, 10) };
      })
    : [],
}));
