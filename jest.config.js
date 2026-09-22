/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'lib',
      testEnvironment: 'node',
      rootDir: 'projects/toch-lib',
      testMatch: ['**/*.spec.ts'],
      setupFiles: ['<rootDir>/jest-setup.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.spec.json' }],
        // @angular/* ships ESM-only (.mjs, no CommonJS entry) — Babel just
        // converts that to CJS for Jest; ts-jest still owns our own .ts.
        '^.+\\.mjs$': ['babel-jest', { configFile: '<rootDir>/../../babel.config.cjs' }],
      },
      // Angular packages must be transformed too (the default ignores all
      // of node_modules); everything else stays untransformed as usual.
      transformIgnorePatterns: ['node_modules/(?!@angular/)'],
      moduleFileExtensions: ['ts', 'js', 'mjs', 'json'],
    },
    {
      displayName: 'eslint-rules',
      testEnvironment: 'node',
      rootDir: 'tools/eslint-rules',
      testMatch: ['**/*.test.js'],
    },
  ],
};
