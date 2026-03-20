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

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'ConflictError');
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
