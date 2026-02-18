/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  // Golden file tests can be slow (PDF processing)
  testTimeout: 120_000,
  verbose: true
};
