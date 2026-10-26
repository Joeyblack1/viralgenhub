// Jest config for libraries/nestjs-libraries (the root jest.config.ts needs
// @nx/jest, which this repo does not install).
//
//   pnpm run test:nestjs-libraries
//
// Needs the generated Prisma client first (the specs import enums and types
// from @prisma/client):  pnpm run prisma-generate
// It is not part of the specs' job to hit a database; nothing connects.
const path = require('path');

const root = path.resolve(__dirname, '../..');

module.exports = {
  rootDir: root,
  testEnvironment: 'node',
  // only the specs that run without a database or network
  testMatch: [
    '<rootDir>/libraries/nestjs-libraries/src/**/*.spec.ts',
    '<rootDir>/libraries/helpers/src/auth/token.encryption.spec.ts',
    '<rootDir>/libraries/helpers/src/auth/purpose.tokens.spec.ts',
    '<rootDir>/libraries/helpers/src/utils/early.access.intent.spec.ts',
    '<rootDir>/apps/backend/src/api/routes/users.controller.*.spec.ts',
    '<rootDir>/apps/backend/src/api/routes/admin.controller.*.spec.ts',
    '<rootDir>/apps/backend/src/public-api/routes/v1/*.spec.ts',
    '<rootDir>/apps/backend/src/services/auth/permissions/*.spec.ts',
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // no type-check (fast); the type-check is the apps' tsc build
        tsconfig: {
          isolatedModules: true,
          module: 'commonjs',
          target: 'es2021',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          baseUrl: root,
        },
      },
    ],
  },
  // tsconfig.base.json "paths"
  moduleNameMapper: {
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
    '^@gitroom/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
    '^@gitroom/orchestrator/(.*)$': '<rootDir>/apps/orchestrator/src/$1',
    '^@gitroom/react/(.*)$':
      '<rootDir>/libraries/react-shared-libraries/src/$1',
    '^@gitroom/plugins/(.*)$': '<rootDir>/libraries/plugins/src/$1',
    // ESM-only dependency tree (jsdom); see the stub for why
    '^isomorphic-dompurify$':
      '<rootDir>/libraries/nestjs-libraries/test/dompurify.stub.js',
    // Local runs only: a Prisma client generated OUTSIDE node_modules (see
    // README note above), e.g. when node_modules is a shared symlink.
    ...(process.env.PRISMA_CLIENT_DIR
      ? { '^\\.prisma/client/(.*)$': process.env.PRISMA_CLIENT_DIR + '/$1' }
      : {}),
  },
};
