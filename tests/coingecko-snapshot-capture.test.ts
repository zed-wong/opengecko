import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureCoinGeckoSnapshots,
  formatSnapshotCaptureSummary,
  getSnapshotMetadataRelativePath,
  type SnapshotCaptureSummary,
} from '../src/coingecko/snapshot-capture';
import {
  SNAPSHOT_ARTIFACT_FORMAT_VERSION,
  coingeckoSnapshotManifest,
  type SnapshotManifest,
} from '../src/coingecko/snapshot-manifest';
import { resetRepoDotenvLoaderForTests } from '../src/config/env';

describe('CoinGecko snapshot capture', () => {
  const tempDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(() => {
    vi.restoreAllMocks();
    resetRepoDotenvLoaderForTests();
    process.chdir(originalCwd);
    delete process.env.COINGECKO_API_KEY;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createTempDir() {
    const dir = mkdtempSync(join(tmpdir(), 'opengecko-cg-snapshots-'));
    tempDirs.push(dir);
    return dir;
  }

  function createFetchResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as Response;
  }

  it('fails fast when COINGECKO_API_KEY is missing', async () => {
    await expect(captureCoinGeckoSnapshots({
      apiKey: '',
      outputDir: createTempDir(),
    })).rejects.toThrow('COINGECKO_API_KEY is required in the runtime environment for snapshot capture.');
  });

  it('loads COINGECKO_API_KEY through the centralized repo env loader when not passed explicitly', async () => {
    resetRepoDotenvLoaderForTests();
    const cwd = createTempDir();
    const outputDir = createTempDir();
    writeFileSync(join(cwd, '.env'), 'COINGECKO_API_KEY=repo-dotenv-key\n', 'utf8');
    process.chdir(cwd);
    delete process.env.COINGECKO_API_KEY;

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse({ gecko_says: '(V3) To the Moon!' }));
    const manifest: SnapshotManifest = {
      manifestId: 'env-loaded-manifest',
      formatVersion: 1,
      artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
      maxRequests: 10,
      entries: [{ id: 'ping', path: '/ping' }],
    };

    await captureCoinGeckoSnapshots({
      outputDir,
      manifest,
      fetchImpl: fetchMock as typeof fetch,
      capturedAt: () => new Date('2026-03-28T00:00:00.000Z'),
    });

    expect((fetchMock.mock.calls[0]?.[1] as { headers: Headers }).headers.get('x-cg-pro-api-key')).toBe('repo-dotenv-key');
  });

  it('reloads the centralized env loader for a new cwd even after earlier state was consumed elsewhere', async () => {
    const firstCwd = createTempDir();
    const secondCwd = createTempDir();
    const outputDir = createTempDir();
    writeFileSync(join(firstCwd, '.env'), 'COINGECKO_API_KEY=first-repo-key\n', 'utf8');
    writeFileSync(join(secondCwd, '.env'), 'COINGECKO_API_KEY=second-repo-key\n', 'utf8');
    delete process.env.COINGECKO_API_KEY;

    resetRepoDotenvLoaderForTests();
    process.chdir(firstCwd);
    await captureCoinGeckoSnapshots({
      outputDir,
      manifest: {
        manifestId: 'first-manifest',
        formatVersion: 1,
        artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
        maxRequests: 10,
        entries: [{ id: 'ping-first', path: '/ping' }],
      },
      fetchImpl: vi.fn().mockResolvedValue(createFetchResponse({ first: true })) as typeof fetch,
      capturedAt: () => new Date('2026-03-28T00:00:00.000Z'),
    });

    delete process.env.COINGECKO_API_KEY;
    process.chdir(secondCwd);

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse({ second: true }));
    await captureCoinGeckoSnapshots({
      outputDir,
      manifest: {
        manifestId: 'second-manifest',
        formatVersion: 1,
        artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
        maxRequests: 10,
        entries: [{ id: 'ping-second', path: '/ping' }],
      },
      fetchImpl: fetchMock as typeof fetch,
      capturedAt: () => new Date('2026-03-28T00:01:00.000Z'),
    });

    expect((fetchMock.mock.calls[0]?.[1] as { headers: Headers }).headers.get('x-cg-pro-api-key')).toBe('second-repo-key');
  });

  it('captures raw payloads and stores metadata/index accounting', async () => {
    const outputDir = createTempDir();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse({ bitcoin: { usd: 90000 } }))
      .mockResolvedValueOnce(createFetchResponse({ ethereum: { usd: 1 } }));

    const manifest: SnapshotManifest = {
      manifestId: 'test-manifest',
      formatVersion: 1,
      artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
      maxRequests: 10,
      entries: [
        {
          id: 'simple-price',
          path: '/simple/price',
          query: { ids: 'bitcoin', vs_currencies: 'usd' },
        },
        {
          id: 'token-price',
          path: '/simple/token_price/ethereum',
          query: { contract_addresses: '0xa0b8', vs_currencies: 'usd' },
        },
      ],
    };

    const summary = await captureCoinGeckoSnapshots({
      apiKey: 'test-key',
      outputDir,
      manifest,
      fetchImpl: fetchMock as typeof fetch,
      capturedAt: () => new Date('2026-03-28T00:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]?.[1] as { headers: Headers }).headers.get('x-cg-pro-api-key')).toBe('test-key');
    expect(summary.requestTotal).toBe(2);
    expect(summary.manifestEntryCount).toBe(2);
    expect(summary.totals).toEqual({
      captured: 2,
      reused: 0,
      conditional_skip: 0,
      failed: 0,
    });

    for (const entry of summary.entries) {
      const artifactPath = join(outputDir, entry.artifactRelativePath);
      const metadataPath = join(outputDir, getSnapshotMetadataRelativePath(entry.entryId, entry.artifactRelativePath));
      const artifactBody = readFileSync(artifactPath, 'utf8');
      expect(JSON.parse(artifactBody)).toEqual(entry.entryId === 'simple-price'
        ? { bitcoin: { usd: 90000 } }
        : { ethereum: { usd: 1 } });
      expect(JSON.parse(readFileSync(metadataPath, 'utf8'))).toMatchObject({
        entryId: entry.entryId,
        normalizedPath: entry.normalizedPath,
        variantId: entry.variantId,
        upstreamStatus: 200,
        artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
      });
    }

    const index = JSON.parse(readFileSync(summary.indexPath, 'utf8')) as SnapshotCaptureSummary;
    expect(index.entries.map((entry) => entry.state)).toEqual(['captured', 'captured']);
  });

  it('reuses existing artifacts by default and refreshes explicitly', async () => {
    const outputDir = createTempDir();
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse({ pong: true }));
    const manifest: SnapshotManifest = {
      manifestId: 'reusable-manifest',
      formatVersion: 1,
      artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
      maxRequests: 10,
      entries: [{ id: 'ping', path: '/ping' }],
    };

    const firstRun = await captureCoinGeckoSnapshots({
      apiKey: 'test-key',
      outputDir,
      manifest,
      fetchImpl: fetchMock as typeof fetch,
      capturedAt: () => new Date('2026-03-28T00:00:00.000Z'),
    });
    const firstArtifact = readFileSync(join(outputDir, firstRun.entries[0]!.artifactRelativePath), 'utf8');

    const secondRun = await captureCoinGeckoSnapshots({
      apiKey: 'test-key',
      outputDir,
      manifest,
      fetchImpl: fetchMock as typeof fetch,
      capturedAt: () => new Date('2026-03-28T00:10:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondRun.requestTotal).toBe(0);
    expect(secondRun.totals.reused).toBe(1);
    expect(secondRun.entries[0]?.state).toBe('reused');
    expect(readFileSync(join(outputDir, firstRun.entries[0]!.artifactRelativePath), 'utf8')).toBe(firstArtifact);

    await captureCoinGeckoSnapshots({
      apiKey: 'test-key',
      outputDir,
      manifest,
      fetchImpl: fetchMock as typeof fetch,
      capturedAt: () => new Date('2026-03-28T00:20:00.000Z'),
      refresh: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps bounded manifest coverage explicit and machine-readable', () => {
    expect(coingeckoSnapshotManifest.entries.length).toBeLessThanOrEqual(coingeckoSnapshotManifest.maxRequests);
    expect(coingeckoSnapshotManifest.maxRequests).toBe(10);
    expect(new Set(coingeckoSnapshotManifest.entries.map((entry) => entry.id)).size).toBe(coingeckoSnapshotManifest.entries.length);
    const formatted = formatSnapshotCaptureSummary({
      manifestId: 'summary',
      manifestEntryCount: 1,
      requestLimit: 10,
      requestTotal: 0,
      refresh: false,
      totals: { captured: 0, reused: 1, conditional_skip: 0, failed: 0 },
      indexPath: '/tmp/index.json',
      entries: [{
        entryId: 'ping',
        manifestId: 'summary',
        manifestFormatVersion: 1,
        artifactFormatVersion: 1,
        path: '/ping',
        normalizedPath: '/ping',
        normalizedQuery: '',
        variantId: 'ping',
        url: 'https://pro-api.coingecko.com/api/v3/ping',
        capturedAt: '2026-03-28T00:00:00.000Z',
        upstreamStatus: 200,
        artifactRelativePath: 'artifacts/ping.json',
        payloadSha256: 'hash',
        byteLength: 12,
        reusedFromExisting: true,
        refreshed: false,
        state: 'reused',
        errorMessage: null,
      }],
    });

    expect(JSON.parse(formatted)).toMatchObject({
      manifest_id: 'summary',
      request_limit: 10,
      totals: { reused: 1 },
      entries: [{ state: 'reused', normalized_path: '/ping' }],
    });
  });

  it('rejects duplicate manifest identities so undeclared variants cannot be fetched twice', async () => {
    const outputDir = createTempDir();

    const manifest: SnapshotManifest = {
      manifestId: 'duplicate-manifest',
      formatVersion: 1,
      artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
      maxRequests: 10,
      entries: [
        { id: 'ping-a', path: '/ping' },
        { id: 'ping-b', path: '/ping' },
      ],
    };

    await expect(captureCoinGeckoSnapshots({
      apiKey: 'test-key',
      outputDir,
      manifest,
    })).rejects.toThrow('Snapshot manifest contains duplicate normalized path: /ping');
  });
});
