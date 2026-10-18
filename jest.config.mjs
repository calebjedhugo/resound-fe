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
    '^entities/(.*)$': '<rootDir>/src/entities/$1',
    '^ui/(.*)$': '<rootDir>/src/ui/$1',
    '^states/(.*)$': '<rootDir>/src/states/$1',
    '^editor/(.*)$': '<rootDir>/src/editor/$1',
    '^resoundModules/(.*)$': '<rootDir>/src/resoundModules/$1',
    '^createEventListeners$': '<rootDir>/src/createEventListeners.js',
  },

  // Setup files
  setupFiles: ['<rootDir>/setupMocks.js'],
  setupFilesAfterEnv: ['<rootDir>/setupTests.js'],

  // Test file patterns - colocated with source code (deploy/: the build + deploy scripts)
  testMatch: ['**/src/**/*.test.js', '**/deploy/**/*.test.js'],

  // Ignore patterns
  // .claude/ holds agent worktrees: whole copies of src/ that aren't this
  // checkout's tests. Anchored to <rootDir>: a worktree's own path contains
  // /.claude/, so an unanchored pattern would hide every test run inside one
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],

  // resound-sound ships an ESM bundle; babel-jest needs to transform it even
  // though it lives under node_modules. three/examples (CameraUtils for the
  // portal camera) and three/src (the real Matrix4 the drawList test helper
  // projects with) are likewise ESM-only.
  transformIgnorePatterns: [
    '/node_modules/(?!(resound-sound|resound-notation|three/examples|three/src)/)',
  ],
};
