module.exports = {
  preset: "ts-jest",
  setupFilesAfterEnv: ["<rootDir>/src/test-bindings.ts"],
  testEnvironment: "node",
  // PGlite's CJS bundle uses import() for Node built-ins; Jest needs require().
  transformIgnorePatterns: ["/node_modules/(?!@electric-sql/pglite/)"],
  transform: {
    "^.+\\.cjs$": [
      "babel-jest",
      {
        plugins: [
          "@babel/plugin-transform-dynamic-import",
          "@babel/plugin-transform-modules-commonjs",
        ],
      },
    ],
  },
};
