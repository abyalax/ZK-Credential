import { Router } from 'express';
import { ok } from '../../../shared/index.js';
import { parseIssueCredential } from '../parsing.js';
import type { HttpServices } from '../services.js';
import { credentialView, issuerView } from '../views.js';

/** `GET /api/issuer`, `GET|POST /api/issuer/credentials`. */
export const issuerRoutes = (services: HttpServices): Router => {
  const router = Router();

  router.get('/issuer', async (_req, res) => {
    res.json(issuerView(await services.getIssuerProfile()));
  });

  router.get('/issuer/credentials', async (_req, res) => {
    res.json((await services.listCredentials()).map(credentialView));
  });

  router.post('/issuer/credentials', async (req, res) => {
    const input = parseIssueCredential(req.body);
    // The demo holder lives in the server, so the credential is bound to its key.
    const holder = await services.holderKeyring.current();
    const result = await services.issueCredential({
      ...input,
      issuerId: services.issuer.id,
      holderPublicKey: holder.publicKey,
    });
    res.json(result.ok ? ok(credentialView(result.value)) : result);
  });

  return router;
};
