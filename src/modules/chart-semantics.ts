export type TimeSeriesRow = {
  timestamp: Date;
};

export function getRangeDurationMs(range: { from: number; to: number }) {
  return Math.max(0, range.to - range.from);
}

export function getChartGranularityMs(durationMs: number) {
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (durationMs <= day) {
    return hour;
  }

  if (durationMs <= 30 * day) {
    return day;
  }

  if (durationMs <= 90 * day) {
    return 2 * day;
  }

  return 7 * day;
}

export function downsampleTimeSeries<T extends TimeSeriesRow>(rows: T[], granularityMs: number) {
  if (rows.length <= 2 || granularityMs <= 0) {
    return rows;
  }

  const sampled: T[] = [rows[0]!];
  let lastIncluded = rows[0]!.timestamp.getTime();

  for (const row of rows.slice(1, -1)) {
    const current = row.timestamp.getTime();

    if (current - lastIncluded >= granularityMs) {
      sampled.push(row);
      lastIncluded = current;
    }
  }

  const last = rows.at(-1)!;

  if (sampled.at(-1)?.timestamp.getTime() !== last.timestamp.getTime()) {
    sampled.push(last);
  }

  return sampled;
}
