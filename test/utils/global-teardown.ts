/**
 * Global Teardown
 *
 * Jest global teardown file executed once after all test suites.
 * Used for cleanup operations like closing database connections.
 */

export default async function globalTeardown(): Promise<void> {
  // Clean up any global resources

  // Log teardown
  if (process.env.DEBUG_TESTS === 'true') {
    console.log('Global test teardown complete');
  }
}
