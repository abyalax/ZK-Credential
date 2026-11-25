import { paths } from './paths.js';
import { schemas } from './schemas.js';

export const API_VERSION = '0.1.0';

/** OpenAPI 3.1 description of the demo server; rendered by Scalar at `/api/docs`. */
export const buildOpenApiDocument = () => ({
  openapi: '3.1.0',
  info: {
    title: 'ZK-Credential demo API',
    version: API_VERSION,
    description: [
      'Thin HTTP adapter over the same use cases as the CLI, built for the UI in `web/`.',
      '',
      '- Protocol rejections are normal results (HTTP 200), not errors.',
      '- GPA values are whole numbers scaled by 100 (`350` = 3.50).',
      '- No authentication: bind to localhost only. The holder private key lives in the server (demo simplification).',
      '- Run events carry public values only.',
    ].join('\n'),
    license: { name: 'MIT' },
  },
  servers: [{ url: '/', description: 'Same origin (Vite proxies `/api` here)' }],
  tags: [
    { name: 'Issuer', description: 'Issue and list credentials' },
    { name: 'Holder', description: 'Wallet and proofs' },
    { name: 'Verifier', description: 'Challenges and verification' },
    { name: 'Simulator', description: 'Scenarios and realtime runs' },
  ],
  paths,
  components: { schemas },
});
