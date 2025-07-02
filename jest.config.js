module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // The default ignore patterns (can be overridden by command line)
  testPathIgnorePatterns: [
    'node_modules/',
    'dist/',
    // Keep these commented out so they're documented but not active
    // 'users.integration.spec.ts',
    // 'report.controller.spec.ts',
  ],
  forceExit: true,
  detectOpenHandles: true,
}; 