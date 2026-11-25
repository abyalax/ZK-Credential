import type { ErrorRequestHandler, RequestHandler } from 'express';
import { InfrastructureError } from '../../shared/index.js';

/** A request the server refuses: 4xx for a broken request, 409 for a clashing run. Protocol rejections are never errors. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

export const badRequest = (detail: string): HttpError => new HttpError(400, 'INVALID_REQUEST', detail);

export interface ErrorLogger {
  readonly error: (message: string, cause?: unknown) => void;
}

const isBodyParserError = (error: unknown): error is { status: number; type: string } =>
  typeof error === 'object' && error !== null && 'type' in error && 'status' in error;

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
};

/** Maps thrown errors to `{ error: "<CODE>" }`. Messages of unexpected failures stay in the log, not in the response. */
export const errorHandler =
  (logger: ErrorLogger): ErrorRequestHandler =>
  (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.code, ...(error.detail ? { detail: error.detail } : {}) });
      return;
    }
    if (isBodyParserError(error) && error.status >= 400 && error.status < 500) {
      res.status(error.status).json({ error: error.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'INVALID_REQUEST' });
      return;
    }
    logger.error('Unhandled error in HTTP adapter', error);
    const code = error instanceof InfrastructureError ? 'INFRASTRUCTURE_ERROR' : 'INTERNAL_ERROR';
    res.status(500).json({ error: code });
  };
