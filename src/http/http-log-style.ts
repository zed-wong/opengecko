export const HTTP_LOG_STYLES = ['emoji_compact_p', 'boring'] as const;

export type HttpLogStyle = (typeof HTTP_LOG_STYLES)[number];

type HttpCompactPLogInput = {
  timestamp: Date;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  reqId: string;
  slowThresholdMs: number;
};

function pad(value: number, width: number) {
  return String(value).padStart(width, '0');
}

function formatTimestamp(date: Date) {
  return `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(Math.floor(date.getMilliseconds() / 10), 2)}`;
}

function statusTrafficEmoji(statusCode: number) {
  if (statusCode >= 500) {
    return '🔴';
  }

  if (statusCode >= 400) {
    return '🟠';
  }

  if (statusCode >= 300) {
    return '🟡';
  }

  return '🟢';
}

export function formatHttpCompactPLog(input: HttpCompactPLogInput) {
  const roundedDurationMs = Math.max(0, Math.round(input.durationMs));
  const slowSuffix = roundedDurationMs >= input.slowThresholdMs ? ' | 🐢SLOW' : '';

  return `${formatTimestamp(input.timestamp)}  ${statusTrafficEmoji(input.statusCode)} ${input.method} ${input.url} | ✅${input.statusCode} | ⏱${roundedDurationMs}ms | 🆔${input.reqId}${slowSuffix}`;
}
