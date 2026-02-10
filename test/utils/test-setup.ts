/**
 * Test Setup
 *
 * Jest setup file executed after the test framework is installed.
 * Configures global test environment settings.
 */

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Silence console logs during tests unless explicitly needed
const originalConsole = { ...console };

beforeAll(() => {
  // Optionally silence console during tests
  if (process.env.SILENT_TESTS === 'true') {
    global.console = {
      ...console,
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      // Keep error for debugging
      error: originalConsole.error,
    };
  }
});

afterAll(() => {
  // Restore console
  global.console = originalConsole;
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  originalConsole.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Clean up any dangling async operations
afterAll(async () => {
  // Give time for any pending operations to complete
  await new Promise((resolve) => setTimeout(resolve, 100));
});

// Export for type checking
export {};
