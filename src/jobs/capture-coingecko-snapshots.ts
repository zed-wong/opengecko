import { captureCoinGeckoSnapshots, formatSnapshotCaptureSummary } from '../coingecko/snapshot-capture';
import { createLogger } from '../lib/logger';

function parseArgs(argv: string[]) {
  return {
    refresh: argv.includes('--refresh'),
  };
}

export async function runCoinGeckoSnapshotCaptureCli(argv: string[] = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const logger = createLogger({ level: process.env.LOG_LEVEL === 'silent' ? 'silent' : 'info', pretty: false });
  const summary = await captureCoinGeckoSnapshots({
    refresh: args.refresh,
    logger,
  });

  process.stdout.write(`${formatSnapshotCaptureSummary(summary)}\n`);
  return summary;
}

if (process.argv[1] && process.argv[1].endsWith('capture-coingecko-snapshots.ts')) {
  runCoinGeckoSnapshotCaptureCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
