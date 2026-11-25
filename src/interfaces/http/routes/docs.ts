import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { apiReference } from '@scalar/express-api-reference';
import express, { Router } from 'express';
import { buildOpenApiDocument } from '../openapi/document.js';

const SCALAR_ASSETS_PATH = '/api/docs/assets';

/** Folder of the Scalar standalone bundle, resolved from the package so the page works without internet. */
const scalarBundleDir = (): string => join(dirname(createRequire(import.meta.url).resolve('@scalar/api-reference')), 'browser');

/** `GET /api/openapi.json` and the Scalar reference at `GET /api/docs`. */
export const docsRoutes = (): Router => {
  const router = Router();
  const document = buildOpenApiDocument();

  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use('/docs/assets', express.static(scalarBundleDir(), { index: false }));
  router.get(
    '/docs',
    apiReference({
      url: '/api/openapi.json',
      pageTitle: 'ZK-Credential API',
      // Serve the bundle from this server: the default CDN would break an offline thesis demo.
      cdn: `${SCALAR_ASSETS_PATH}/standalone.js`,
    }),
  );

  return router;
};
