import type { Result } from '@/shared';

/** Domain results travel as `{ ok, value | error }` with HTTP 200. Only malformed requests and infra failures use 4xx/5xx. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const parseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text === '' ? undefined : JSON.parse(text);
};

export const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...init?.headers },
  });
  const body = await parseBody(response);
  if (!response.ok) {
    const code = (body as { error?: string } | undefined)?.error ?? `HTTP_${response.status}`;
    throw new HttpError(response.status, code);
  }
  return body as T;
};

export const get = <T>(path: string): Promise<T> => requestJson<T>(path);

export const post = <T>(path: string, body: unknown): Promise<T> =>
  requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) });

export type Envelope<T, E> = Result<T, E>;
