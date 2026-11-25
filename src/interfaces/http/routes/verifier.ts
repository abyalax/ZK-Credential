import { Router } from 'express';
import type { Proof } from '../../../domain/index.js';
import { asChallengeValue, asIssuerPublicKey, asProofPayload, asVerifierId, challengeStatus } from '../../../domain/index.js';
import { parseIssueChallenge, parseVerify } from '../parsing.js';
import type { HttpServices } from '../services.js';
import { challengeListingView, challengeView } from '../views.js';

/** `GET|POST /api/verifier/challenges`, `POST /api/verifier/verifications`. */
export const verifierRoutes = (services: HttpServices): Router => {
  const router = Router();

  router.get('/verifier/challenges', async (_req, res) => {
    res.json((await services.listChallenges()).map(challengeListingView));
  });

  router.post('/verifier/challenges', async (req, res) => {
    const input = parseIssueChallenge(req.body);
    const challenge = await services.issueChallenge({ verifierId: asVerifierId(input.verifierId), ttlMs: input.ttlMs });
    const status = challengeStatus({ challenge, consumedAt: undefined }, services.clock.now());
    res.json(challengeView(challenge, status));
  });

  router.post('/verifier/verifications', async (req, res) => {
    const input = parseVerify(req.body);
    const proof: Proof = {
      protocol: 'groth16',
      payload: asProofPayload(input.payload),
      publicSignals: {
        issuerPublicKey: asIssuerPublicKey(input.signals.issuerPublicKey),
        gpaThreshold: input.signals.gpaThreshold,
        challenge: asChallengeValue(input.signals.challenge),
        verifierId: asVerifierId(input.signals.verifierId),
      },
    };
    const startedAt = services.clock.now();
    const verdict = await services.verifyCredential({
      proof,
      policy: { verifierId: asVerifierId(input.verifierId), requiredGpaThreshold: input.requiredThreshold },
    });
    const durationMs = services.clock.now() - startedAt;
    // A protocol rejection is a normal result (HTTP 200), not a server error.
    res.json(
      verdict.ok
        ? { accepted: true, stage: 'verify', reason: 'ACCEPTED', durationMs }
        : { accepted: false, stage: 'verify', reason: verdict.error, durationMs },
    );
  });

  return router;
};
