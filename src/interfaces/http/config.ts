export interface HttpConfig {
  /** Always loopback: the server has no authentication. */
  readonly host: '127.0.0.1';
  readonly port: number;
}

/** Same port as `VITE_API_PROXY` in web/.env.example. */
export const DEFAULT_HTTP_PORT = 8787;

type Env = Readonly<Record<string, string | undefined>>;

export const loadHttpConfig = (env: Env): HttpConfig => {
  const raw = env.ZK_HTTP_PORT?.trim();
  if (!raw) return { host: '127.0.0.1', port: DEFAULT_HTTP_PORT };
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new TypeError('ZK_HTTP_PORT must be a port number (0-65535)');
  return { host: '127.0.0.1', port };
};
