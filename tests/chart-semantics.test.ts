import { describe, expect, it } from 'vitest';

import { downsampleTimeSeries, getChartGranularityMs, getRangeDurationMs } from '../src/modules/chart-semantics';

describe('chart semantics helpers', () => {
  it('uses hourly granularity for one day windows and weekly granularity for large windows', () => {
    expect(getChartGranularityMs(24 * 60 * 60 * 1000)).toBe(60 * 60 * 1000);
    expect(getChartGranularityMs(120 * 24 * 60 * 60 * 1000)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('downsamples while keeping the first and last rows', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      timestamp: new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 24 * 60 * 60 * 1000),
      price: index,
    }));

    const downsampled = downsampleTimeSeries(rows, 3 * 24 * 60 * 60 * 1000);

    expect(downsampled.map((row) => row.price)).toEqual([0, 3, 6, 9]);
  });

  it('computes explicit range durations deterministically', () => {
    expect(
      getRangeDurationMs({
        from: Date.parse('2026-03-01T00:00:00.000Z'),
        to: Date.parse('2026-03-08T00:00:00.000Z'),
      }),
    ).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
