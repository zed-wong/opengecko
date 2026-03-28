import { createDiffReport } from '../coingecko/diff-report';

export async function runCoinGeckoDiffReportCli() {
  const report = createDiffReport({
    replayReportPath: process.env.COINGECKO_REPLAY_REPORT_PATH ?? 'data/coingecko-snapshots/replay/report.json',
    rulesetPath: process.env.COINGECKO_NORMALIZATION_RULESET_PATH ?? 'data/coingecko-snapshots/normalization-rules.json',
    divergenceRegistryPath: process.env.COINGECKO_DIVERGENCE_REGISTRY_PATH ?? 'data/coingecko-snapshots/divergence-registry.json',
    outputPath: process.env.COINGECKO_DIFF_REPORT_PATH ?? 'data/coingecko-snapshots/replay/diff-report.json',
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('report-coingecko-diff.ts')) {
  runCoinGeckoDiffReportCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
