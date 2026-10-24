module.exports = {
  preset: "ts-jest",
  setupFilesAfterEnv: ["<rootDir>/src/test-bindings.ts"],
  testEnvironment: "node",
};
