import type { Config } from 'jest';
import { pathsToModuleNameMapper, createDefaultEsmPreset } from 'ts-jest';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();
const basePreset = createDefaultEsmPreset({
  tsconfig: 'tsconfig.json'
});

const compilerOptions = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'tsconfig.json'), 'utf-8')
).compilerOptions;

const moduleNameMapper = {
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths, {
      prefix: '<rootDir>/',
      useESM: true
    }),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  }
};

export default {
  projects: [
    {
      displayName: 'node',
      ...basePreset,
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true }]
      },
	  extensionsToTreatAsEsm: ['.ts'],
      ...moduleNameMapper,
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      modulePathIgnorePatterns: ['<rootDir>/dist/']
    }
  ]
} satisfies Config;
