class StatusError extends Error {
  constructor(statusKey, statusArgs = []) {
    super(statusKey);
    this.statusKey = statusKey;
    this.statusArgs = statusArgs;
  }
}

export function statusError(statusKey, statusArgs = []) {
  return new StatusError(statusKey, statusArgs);
}

export function statusFromError(error, fallbackKey = 'unknownCaptureError') {
  if (error?.statusKey) {
    return {
      statusKey: error.statusKey,
      statusArgs: error.statusArgs || []
    };
  }

  return {
    statusKey: fallbackKey,
    statusArgs: [String(error?.message || '')]
  };
}

export function errorResponse(error, fallbackKey = 'unknownCaptureError') {
  const status = statusFromError(error, fallbackKey);
  return { ok: false, ...status };
}
