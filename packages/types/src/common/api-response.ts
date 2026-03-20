export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: { field: string; message: string }[];
}
