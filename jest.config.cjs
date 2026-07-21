module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/src/shared/zod-setup.ts"],
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
};
