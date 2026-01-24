export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // Module mocks and path mappings
  moduleNameMapper: {
    // Mock THREE.js
    '^three$': '<rootDir>/src/__tests__/helpers/threeMock.js',

    // Mock motion module (has side effects at import)
    '^resoundModules/playerControls/motion/motion$':
      '<rootDir>/src/__tests__/helpers/motionMock.js',

    // Absolute imports from src/ (mirrors jsconfig.json baseUrl)
    '^core/(.*)$': '<rootDir>/src/core/$1',
    '^audio/(.*)$': '<rootDir>/src/audio/$1',
    '^entities/(.*)$': '<rootDir>/src/entities/$1',
    '^ui/(.*)$': '<rootDir>/src/ui/$1',
    '^states/(.*)$': '<rootDir>/src/states/$1',
    '^resoundModules/(.*)$': '<rootDir>/src/resoundModules/$1',
    '^createEventListeners$': '<rootDir>/src/createEventListeners.js',
  },

  // Setup files
  setupFiles: ['<rootDir>/setupMocks.js'],
  setupFilesAfterEnv: ['<rootDir>/setupTests.js'],

  // Test file patterns - colocated with source code
  testMatch: ['**/src/**/*.test.js'],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/'],
};
