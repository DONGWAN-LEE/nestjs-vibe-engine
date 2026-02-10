/**
 * Global Setup
 *
 * Jest global setup file executed once before all test suites.
 * Used for one-time setup operations like database connections.
 */

export default async function globalSetup(): Promise<void> {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing';
  process.env.JWT_ACCESS_EXPIRES_IN = '1h';
  process.env.JWT_REFRESH_EXPIRES_IN = '30d';
  process.env.REDIS_MODE = 'direct';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';

  // Log setup
  if (process.env.DEBUG_TESTS === 'true') {
    console.log('Global test setup complete');
  }
}
