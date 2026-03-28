import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createDiffReport } from '../src/coingecko/diff-report';

describe('CoinGecko diff report', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('separates expected divergences from actionable findings and preserves deterministic ordering plus evidence paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'opengecko-diff-report-'));
    tempDirs.push(root);
    const snapshotDir = join(root, 'snapshots');
    const replayDir = join(snapshotDir, 'replay');
    const registryDir = join(snapshotDir, 'registry');
    mkdirSync(join(snapshotDir, 'artifacts'), { recursive: true });
    mkdirSync(join(replayDir, 'artifacts'), { recursive: true });
    mkdirSync(registryDir, { recursive: true });

    writeFileSync(join(snapshotDir, 'artifacts/a.json'), `${JSON.stringify({ image: 'upstream' }, null, 2)}\n`);
    writeFileSync(join(snapshotDir, 'artifacts/b.json'), `${JSON.stringify({ market_data: { current_price: 1 } }, null, 2)}\n`);
    writeFileSync(join(replayDir, 'artifacts/a.json'), `${JSON.stringify({ status: 200, body: { image: 'replay' } }, null, 2)}\n`);
    writeFileSync(join(replayDir, 'artifacts/b.json'), `${JSON.stringify({ status: 200, body: { market_data: {} } }, null, 2)}\n`);
    writeFileSync(join(replayDir, 'report.json'), `${JSON.stringify({
      reportFormatVersion: 1,
      corpusIdentity: 'corpus-1',
      manifestId: 'manifest-1',
      replayTargetManifestIdentity: 'target-1',
      normalizationRulesId: 'legacy',
      replayedAt: '2026-03-28T00:00:00.000Z',
      validationApiBaseUrl: 'http://127.0.0.1:3102',
      entryCount: 2,
      findings: [
        {
          findingId: 'b-finding',
          entryId: 'b',
          normalizedPath: '/simple/price?ids=bitcoin&vs_currencies=usd',
          replayTargetManifestIdentity: 'target-1',
          upstreamArtifactPath: 'artifacts/b.json',
          replayArtifactPath: 'artifacts/b.json',
          upstreamStatus: 200,
          replayStatus: 200,
          statusMatches: true,
          bodyMatches: false,
        },
        {
          findingId: 'a-finding',
          entryId: 'a',
          normalizedPath: '/exchanges/binance',
          replayTargetManifestIdentity: 'target-1',
          upstreamArtifactPath: 'artifacts/a.json',
          replayArtifactPath: 'artifacts/a.json',
          upstreamStatus: 200,
          replayStatus: 200,
          statusMatches: true,
          bodyMatches: false,
        },
      ],
    }, null, 2)}\n`);
    writeFileSync(join(snapshotDir, 'normalization-rules.json'), `${JSON.stringify({
      rulesetId: 'rules-v1',
      ignoredPaths: [],
      orderingInsensitivePaths: [],
      freshnessPaths: [],
      sourcePaths: ['image'],
      numericTolerances: {},
    }, null, 2)}\n`);
    writeFileSync(join(registryDir, 'divergence-registry.json'), `${JSON.stringify({
      registryId: 'registry-v1',
      entries: [
        {
          id: 'div-source-image',
          findingKey: 'a:source:image',
          reason: 'Known exchange image divergence.',
        },
      ],
    }, null, 2)}\n`);

    const outputPath = join(replayDir, 'diff-report.json');
    const report = createDiffReport({
      replayReportPath: join(replayDir, 'report.json'),
      snapshotDir,
      rulesetPath: join(snapshotDir, 'normalization-rules.json'),
      divergenceRegistryPath: join(registryDir, 'divergence-registry.json'),
      outputPath,
      generatedAt: () => new Date('2026-03-28T00:10:00.000Z'),
    });

    expect(report.normalizationRulesId).toBe('rules-v1');
    expect(report.divergenceRegistryId).toBe('registry-v1');
    expect(report.replayTargetManifestIdentity).toBe('target-1');
    expect(report.actionableFindings).toHaveLength(1);
    expect(report.expectedFindings).toHaveLength(1);
    expect(report.expectedFindings[0]).toMatchObject({
      entryId: 'a',
      gapClass: 'source',
      status: 'expected',
      divergenceId: 'div-source-image',
      evidencePaths: {
        upstreamArtifactPath: 'artifacts/a.json',
        replayArtifactPath: 'artifacts/a.json',
      },
    });
    expect(report.actionableFindings[0]).toMatchObject({
      entryId: 'b',
      gapClass: 'missing_field',
      status: 'actionable',
      ownershipHints: [
        {
          module_path: 'src/modules/simple.ts',
          provider_name: 'ccxt',
          endpoint_family: 'simple',
        },
      ],
      evidencePaths: {
        upstreamArtifactPath: 'artifacts/b.json',
        replayArtifactPath: 'artifacts/b.json',
      },
    });
    expect(report.expectedFindings[0]?.normalizedPath).toBe('/exchanges/binance');
    expect(report.actionableFindings[0]?.normalizedPath).toBe('/simple/price?ids=bitcoin&vs_currencies=usd');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('writes deterministically ordered machine-readable findings across repeated runs', () => {
    const root = mkdtempSync(join(tmpdir(), 'opengecko-diff-report-stable-'));
    tempDirs.push(root);
    const snapshotDir = join(root, 'snapshots');
    const replayDir = join(snapshotDir, 'replay');
    const registryDir = join(snapshotDir, 'registry');
    mkdirSync(join(snapshotDir, 'artifacts'), { recursive: true });
    mkdirSync(join(replayDir, 'artifacts'), { recursive: true });
    mkdirSync(registryDir, { recursive: true });

    writeFileSync(join(snapshotDir, 'artifacts/a.json'), `${JSON.stringify({ image: 'upstream' }, null, 2)}\n`);
    writeFileSync(join(snapshotDir, 'artifacts/z.json'), `${JSON.stringify({ market_data: { current_price: 1, market_cap: 2 } }, null, 2)}\n`);
    writeFileSync(join(replayDir, 'artifacts/a.json'), `${JSON.stringify({ status: 200, body: { image: 'replay' } }, null, 2)}\n`);
    writeFileSync(join(replayDir, 'artifacts/z.json'), `${JSON.stringify({ status: 200, body: { market_data: { current_price: 3 } } }, null, 2)}\n`);
    writeFileSync(join(replayDir, 'report.json'), `${JSON.stringify({
      reportFormatVersion: 1,
      corpusIdentity: 'corpus-2',
      manifestId: 'manifest-2',
      replayTargetManifestIdentity: 'target-2',
      normalizationRulesId: 'legacy',
      replayedAt: '2026-03-28T00:00:00.000Z',
      validationApiBaseUrl: 'http://127.0.0.1:3102',
      entryCount: 2,
      findings: [
        {
          findingId: 'z-finding',
          entryId: 'z',
          normalizedPath: '/simple/price?ids=bitcoin&vs_currencies=usd',
          replayTargetManifestIdentity: 'target-2',
          upstreamArtifactPath: 'artifacts/z.json',
          replayArtifactPath: 'artifacts/z.json',
          upstreamStatus: 200,
          replayStatus: 200,
          statusMatches: true,
          bodyMatches: false,
        },
        {
          findingId: 'a-finding',
          entryId: 'a',
          normalizedPath: '/exchanges/binance',
          replayTargetManifestIdentity: 'target-2',
          upstreamArtifactPath: 'artifacts/a.json',
          replayArtifactPath: 'artifacts/a.json',
          upstreamStatus: 200,
          replayStatus: 200,
          statusMatches: true,
          bodyMatches: false,
        },
      ],
    }, null, 2)}\n`);
    writeFileSync(join(snapshotDir, 'normalization-rules.json'), `${JSON.stringify({
      rulesetId: 'rules-v2',
      ignoredPaths: [],
      orderingInsensitivePaths: [],
      freshnessPaths: ['last_updated'],
      sourcePaths: ['image'],
      numericTolerances: {},
    }, null, 2)}\n`);
    writeFileSync(join(registryDir, 'divergence-registry.json'), `${JSON.stringify({
      registryId: 'registry-v2',
      entries: [],
    }, null, 2)}\n`);

    const options = {
      replayReportPath: join(replayDir, 'report.json'),
      snapshotDir,
      rulesetPath: join(snapshotDir, 'normalization-rules.json'),
      divergenceRegistryPath: join(registryDir, 'divergence-registry.json'),
      generatedAt: () => new Date('2026-03-28T00:10:00.000Z'),
    };

    const first = createDiffReport(options);
    const second = createDiffReport(options);

    expect(first).toEqual(second);
    expect(first.actionableFindings.map((finding) => finding.normalizedPath)).toEqual([
      '/exchanges/binance',
      '/simple/price?ids=bitcoin&vs_currencies=usd',
    ]);
    expect(first.actionableFindings[1]?.diffPaths).toEqual([
      'market_data.market_cap',
      'market_data.current_price',
    ]);
  });
});
