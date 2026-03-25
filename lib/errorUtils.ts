function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringifyScalar(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function extractNetworkDetails(record: Record<string, unknown>): string[] {
  const details: string[] = [];
  const detailKeys = ['code', 'errno', 'syscall', 'hostname', 'address', 'port'];

  for (const key of detailKeys) {
    const value = stringifyScalar(record[key]);
    if (value) {
      details.push(`${key}=${value}`);
    }
  }

  return details;
}

function describeErrorCause(error: unknown, seen: Set<unknown>): string {
  if (error == null) {
    return '';
  }

  const scalar = stringifyScalar(error);
  if (scalar) {
    return scalar;
  }

  if (!isRecord(error)) {
    return String(error);
  }

  if (seen.has(error)) {
    return '';
  }
  seen.add(error);

  if (error instanceof Error) {
    const parts: string[] = [];
    const message = stringifyScalar(error.message);

    if (message) {
      parts.push(message);
    }

    const networkDetails = extractNetworkDetails(error as Record<string, unknown>);
    if (networkDetails.length > 0) {
      parts.push(networkDetails.join(', '));
    }

    const nestedCause = describeErrorCause(
      (error as Error & { cause?: unknown }).cause,
      seen
    );
    if (nestedCause && nestedCause !== message) {
      parts.push(`cause: ${nestedCause}`);
    }

    return parts.join(' | ');
  }

  const message = stringifyScalar(error.message);
  const networkDetails = extractNetworkDetails(error);
  const parts: string[] = [];

  if (message) {
    parts.push(message);
  }

  if (networkDetails.length > 0) {
    parts.push(networkDetails.join(', '));
  }

  const nestedCause = describeErrorCause(error.cause, seen);
  if (nestedCause && nestedCause !== message) {
    parts.push(`cause: ${nestedCause}`);
  }

  if (parts.length > 0) {
    return parts.join(' | ');
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function extractErrorMessage(error: unknown): string {
  const message = describeErrorCause(error, new Set());
  return message || 'Unknown error';
}

export function normalizeError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return error;
  }

  const message = extractErrorMessage(error);

  if (error instanceof Error) {
    if (error.message === message) {
      return error;
    }

    const normalizedError = new Error(message);
    normalizedError.name = error.name;
    return normalizedError;
  }

  return new Error(message);
}
