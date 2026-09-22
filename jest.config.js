/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'lib',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: 'projects/toch-lib',
      testMatch: ['**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.spec.json' }],
      },
    },
    {
      displayName: 'eslint-rules',
      testEnvironment: 'node',
      rootDir: 'tools/eslint-rules',
      testMatch: ['**/*.test.js'],
    },
  ],
};
