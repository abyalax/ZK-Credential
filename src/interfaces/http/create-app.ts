import express, { type Express, Router } from 'express';
import { type ErrorLogger, errorHandler, notFound } from './http-error.js';
import { localhostOnly } from './local-only.js';
import { docsRoutes } from './routes/docs.js';
import { holderRoutes } from './routes/holder.js';
import { issuerRoutes } from './routes/issuer.js';
import { runRoutes } from './routes/runs.js';
import { verifierRoutes } from './routes/verifier.js';
import { createRunRegistry, type RunRegistry } from './runs/run-registry.js';
import type { HttpServices } from './services.js';

export interface AppOptions {
  readonly services: HttpServices;
  readonly logger?: ErrorLogger;
}

export interface App {
  readonly app: Express;
  readonly runs: RunRegistry;
}

const consoleLogger: ErrorLogger = {
  error: (message, cause) => console.error(message, cause),
};

/** Builds the Express app. It only maps requests to use cases and `Result` to responses (docs/ui/contract.md). */
export const createApp = ({ services, logger = consoleLogger }: AppOptions): App => {
  const runs = createRunRegistry(logger);
  const api = Router();
  api.use(docsRoutes(), issuerRoutes(services), holderRoutes(services), verifierRoutes(services), runRoutes(services, runs));

  const app = express();
  app.disable('x-powered-by');
  app.use(localhostOnly);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler(logger));
  return { app, runs };
};
