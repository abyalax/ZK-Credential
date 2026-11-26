import type { RequestHandler } from 'express';

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The server has no authentication and holds the holder's private key, so it answers local
 * hostnames only. Besides the loopback bind, this blocks DNS-rebinding pages that reach it by another name.
 */
export const localhostOnly: RequestHandler = (req, res, next) => {
  const hostname = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (LOCAL_HOSTNAMES.has(hostname)) {
    next();
    return;
  }
  res.status(403).json({ error: 'LOCALHOST_ONLY' });
};
