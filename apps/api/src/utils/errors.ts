export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public name: string = 'AppError',
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NotFoundError');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'ValidationError');
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(409, message, 'ConflictError');
  }
}

/**
 * A request that is well-formed but cannot be satisfied by current state, with
 * enough structure for the client to explain why. Used by the unplanned
 * production entry to name every short input rather than just the first.
 */
export class UnprocessableError extends AppError {
  constructor(
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(422, message, 'UnprocessableError');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, 'ForbiddenError');
  }
}

export class MatchError extends AppError {
  constructor(message: string) {
    super(422, message, 'MatchError');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Invalid credentials') {
    super(401, message, 'UnauthorizedError');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, message, 'TooManyRequestsError');
  }
}

export class BadGatewayError extends AppError {
  constructor(message = 'Upstream request failed') {
    super(502, message, 'BadGatewayError');
  }
}
