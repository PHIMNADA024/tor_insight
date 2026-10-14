/**
 * Tests are TypeScript compiled by SWC to CommonJS, so Jest needs no ESM flags.
 * SWC strips types without checking them; `npx tsc -p tests` type-checks the tests.
 *
 * @type {import("jest").Config}
 */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFiles: ["<rootDir>/tests/setup-env.cjs"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "commonjs" },
      },
    ],
  },
  // Source imports use NodeNext's ".js" extension; point Jest at the .ts file.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
