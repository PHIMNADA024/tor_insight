import nextJest from "next/jest.js";

// next/jest compiles with Next's SWC setup and loads next.config and .env files.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import("jest").Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(config);
