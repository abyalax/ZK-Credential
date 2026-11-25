import { Router } from 'express';
import { asChallengeValue, asCredentialId, asVerifierId } from '../../../domain/index.js';
import { ok } from '../../../shared/index.js';
import { parseCreateProof } from '../parsing.js';
import type { HttpServices } from '../services.js';
import { credentialView, proofView } from '../views.js';

/** `GET /api/holder/credentials`, `POST /api/holder/proofs`. */
export const holderRoutes = (services: HttpServices): Router => {
  const router = Router();

  router.get('/holder/credentials', async (_req, res) => {
    const [holder, stored] = await Promise.all([services.holderKeyring.current(), services.listCredentials()]);
    res.json(stored.filter(({ credential }) => credential.holderPublicKey === holder.publicKey).map(credentialView));
  });

  router.post('/holder/proofs', async (req, res) => {
    const input = parseCreateProof(req.body);
    const holder = await services.holderKeyring.current();
    const startedAt = services.clock.now();
    const result = await services.generateProof({
      credentialId: asCredentialId(input.credentialId),
      holderPrivateKey: holder.privateKey,
      request: {
        verifierId: asVerifierId(input.verifierId),
        challenge: asChallengeValue(input.challenge),
        gpaThreshold: input.threshold,
      },
    });
    res.json(result.ok ? ok(proofView(result.value, services.clock.now() - startedAt)) : result);
  });

  return router;
};
