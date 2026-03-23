import { describe, expect, it } from 'vitest';

import {
  createStartupProgressTracker,
  INITIAL_STARTUP_STEPS,
} from '../src/services/startup-progress';

describe('startup progress tracker', () => {
  it('renders a step list with current progress and OHLCV worker startup subprogress', () => {
    const writes: string[] = [];
    const tracker = createStartupProgressTracker({
      write: (value: string) => {
        writes.push(value);
      },
    });

    tracker.start();
    tracker.complete('load_config');
    tracker.complete('connect_database');
    tracker.complete('sync_exchange_metadata');
    tracker.complete('sync_coin_catalog');
    tracker.complete('sync_chain_catalog');
    tracker.complete('build_market_snapshots');
    tracker.begin('start_ohlcv_worker', { current: 124, total: 386 });

    const output = writes.at(-1) ?? '';

    expect(output).toContain('Server starting...');
    expect(output).toContain('[######----] 60%');
    expect(output).toContain('[x] Load config');
    expect(output).toContain('[x] Connect database');
    expect(output).toContain('[>] Start OHLCV worker (124/386)');
    expect(output).toContain('[ ] Seed reference data');
  });

  it('exposes the canonical step order used by startup progress', () => {
    expect(INITIAL_STARTUP_STEPS.map((step: { id: string }) => step.id)).toEqual([
      'load_config',
      'connect_database',
      'sync_exchange_metadata',
      'sync_coin_catalog',
      'sync_chain_catalog',
      'build_market_snapshots',
      'start_ohlcv_worker',
      'seed_reference_data',
      'rebuild_search_index',
      'start_http_listener',
    ]);
  });

  it('supports terminal redraw instead of appending full snapshots', () => {
    const writes: string[] = [];
    const tracker = createStartupProgressTracker({
      write: (value: string) => {
        writes.push(value);
      },
    });

    tracker.start();
    tracker.complete('load_config');

    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain('\u001bc');
    expect(writes[1]).toContain('[x] Load config');
  });

  it('renders failed steps with an explicit failure marker and message', () => {
    const writes: string[] = [];
    const tracker = createStartupProgressTracker({
      write: (value: string) => {
        writes.push(value);
      },
    });

    tracker.start();
    tracker.complete('load_config');
    tracker.begin('connect_database');
    tracker.fail('connect_database', 'sqlite busy');

    const output = writes.at(-1) ?? '';

    expect(output).toContain('[!] Connect database - sqlite busy');
    expect(output).toContain('[x] Load config');
  });

  it('can fail the active step without repeating the step id at call site', () => {
    const writes: string[] = [];
    const tracker = createStartupProgressTracker({
      write: (value: string) => {
        writes.push(value);
      },
    });

    tracker.start();
    tracker.complete('load_config');
    tracker.begin('sync_coin_catalog');
    tracker.failCurrent('catalog fetch failed');

    const output = writes.at(-1) ?? '';

    expect(output).toContain('[!] Sync coin catalog - catalog fetch failed');
  });
});
