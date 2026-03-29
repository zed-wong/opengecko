import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, loadRepoDotenv, resetRepoDotenvLoaderForTests } from '../src/config/env';

describe('repo dotenv loading', () => {
  beforeEach(() => {
    resetRepoDotenvLoaderForTests();
  });

  afterEach(() => {
    resetRepoDotenvLoaderForTests();
  });

  it('loads repo .env values when shell env is unset', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'opengecko-env-'));

    try {
      writeFileSync(join(tempDir, '.env'), 'DEFILLAMA_BASE_URL=https://llama.example\nDEFILLAMA_YIELDS_BASE_URL=https://yields.example\n');
      const env: NodeJS.ProcessEnv = {};

      expect(loadRepoDotenv({ cwd: tempDir, env })).toBe(true);
      expect(loadConfig(env).defillamaBaseUrl).toBe('https://llama.example');
      expect(loadConfig(env).defillamaYieldsBaseUrl).toBe('https://yields.example');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves shell env values over repo .env values', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'opengecko-env-'));

    try {
      writeFileSync(join(tempDir, '.env'), 'DEFILLAMA_BASE_URL=https://repo.example\n');
      const env: NodeJS.ProcessEnv = { DEFILLAMA_BASE_URL: 'https://shell.example' };

      expect(loadRepoDotenv({ cwd: tempDir, env })).toBe(true);
      expect(loadConfig(env).defillamaBaseUrl).toBe('https://shell.example');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('loads repo .env at most once per process', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'opengecko-env-'));

    try {
      writeFileSync(join(tempDir, '.env'), 'DEFILLAMA_BASE_URL=https://repo.example\n');
      const env: NodeJS.ProcessEnv = {};

      expect(loadRepoDotenv({ cwd: tempDir, env })).toBe(true);
      env.DEFILLAMA_BASE_URL = 'https://mutated.example';
      expect(loadRepoDotenv({ cwd: tempDir, env })).toBe(false);
      expect(loadConfig(env).defillamaBaseUrl).toBe('https://mutated.example');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reloads repo .env when the cwd changes', () => {
    const firstDir = mkdtempSync(join(tmpdir(), 'opengecko-env-'));
    const secondDir = mkdtempSync(join(tmpdir(), 'opengecko-env-'));

    try {
      writeFileSync(join(firstDir, '.env'), 'DEFILLAMA_BASE_URL=https://first.example\n');
      writeFileSync(join(secondDir, '.env'), 'DEFILLAMA_BASE_URL=https://second.example\n');
      const env: NodeJS.ProcessEnv = {};

      expect(loadRepoDotenv({ cwd: firstDir, env })).toBe(true);
      expect(env.DEFILLAMA_BASE_URL).toBe('https://first.example');

      delete env.DEFILLAMA_BASE_URL;
      expect(loadRepoDotenv({ cwd: secondDir, env })).toBe(true);
      expect(loadConfig(env).defillamaBaseUrl).toBe('https://second.example');
    } finally {
      rmSync(firstDir, { recursive: true, force: true });
      rmSync(secondDir, { recursive: true, force: true });
    }
  });
});
