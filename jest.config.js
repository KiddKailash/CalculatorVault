/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  globals: {},
  testEnvironmentOptions: {},
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/__tests__/mocks/expo-secure-store.ts',
    '^expo-file-system$': '<rootDir>/__tests__/mocks/expo-file-system.ts',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__tests__/mocks/async-storage.ts',
    '_PlatformSecureStore$': '<rootDir>/__tests__/mocks/PlatformSecureStore.ts',
  },
};
