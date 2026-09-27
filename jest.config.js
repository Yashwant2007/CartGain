/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    // Single unified ts-jest transform for both .ts and .tsx. A shared
    // tsconfig (tsconfig.jest.json overrides jsx in the app tsconfig.json to
    // react-jsx for tests) avoids the dual-compiler state that intermittently
    // processed .tsx files with jsx:preserve (raw "<" -> SyntaxError) under
    // full-suite parallelism on Linux CI.
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
}