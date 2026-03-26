import { HttpError } from './errors';

export function parseBooleanQuery(value: string | undefined, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new HttpError(400, 'invalid_parameter', `Invalid boolean query value: ${value}`);
}

export function parseCsvQuery(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function parsePrecision(value: string | undefined): number | 'full' {
  if (value === undefined) {
    return 'full';
  }

  if (value === 'full') {
    return 'full';
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 18) {
    throw new HttpError(400, 'invalid_parameter', `Invalid precision value: ${value}`);
  }

  return parsed;
}

export function parsePositiveInt(value: string | undefined, defaultValue: number) {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'invalid_parameter', `Invalid integer value: ${value}`);
  }

  return parsed;
}
