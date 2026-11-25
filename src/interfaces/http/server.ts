import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { HttpConfig } from './config.js';
import { type AppOptions, createApp } from './create-app.js';

export interface RunningServer {
  /** Base URL with the real port (useful when `port` was 0). */
  readonly url: string;
  /** Lets the current run finish, drops open event streams, then stops listening. */
  readonly close: () => Promise<void>;
}

const listening = (app: Express, config: HttpConfig): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = app.listen(config.port, config.host, () => resolve(server));
    server.once('error', reject);
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Open SSE streams would keep `close` waiting forever.
    server.closeAllConnections();
  });

export const startHttpServer = async (options: AppOptions, config: HttpConfig): Promise<RunningServer> => {
  const { app, runs } = createApp(options);
  const server = await listening(app, config);
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${config.host}:${port}`,
    close: async () => {
      await runs.idle();
      await closeServer(server);
    },
  };
};
