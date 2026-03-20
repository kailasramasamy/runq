export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
} as const;

export const RATE_LIMIT = {
  MAX_REQUESTS: 100,
  WINDOW_MS: 60_000,
} as const;
