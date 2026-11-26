type Json = Readonly<Record<string, unknown>>;

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json, description: string): Json => ({ description, content: { 'application/json': { schema } } });
const body = (name: string): Json => ({ required: true, content: { 'application/json': { schema: ref(name) } } });
const arrayOf = (name: string): Json => ({ type: 'array', items: ref(name) });
const error = (description: string): Json => json(ref('ErrorBody'), description);

const BAD_REQUEST = { 400: error('Broken request (`INVALID_REQUEST`, `INVALID_JSON`).') };
const SERVER_ERROR = { 500: error('Infrastructure failure (`INFRASTRUCTURE_ERROR`, `INTERNAL_ERROR`).') };

const operation = (tag: string, summary: string, description: string, extra: Json): Json => ({
  tags: [tag],
  summary,
  description,
  ...extra,
});

/** Protocol rejections are results (HTTP 200); 4xx is reserved for broken requests and 409 for clashing runs. */
export const paths: Record<string, Json> = {
  '/api/issuer': {
    get: operation('Issuer', 'Issuer profile', 'The configured issuer and whether the on-chain registry trusts its key.', {
      responses: { 200: json(ref('IssuerView'), 'Issuer profile'), ...SERVER_ERROR },
    }),
  },
  '/api/issuer/credentials': {
    get: operation(
      'Issuer',
      'List issued credentials',
      'Everything the issuer signed, oldest first. Carries credential attributes by design.',
      {
        responses: { 200: json(arrayOf('CredentialView'), 'Credentials'), ...SERVER_ERROR },
      },
    ),
    post: operation('Issuer', 'Issue a credential', 'Signs a credential bound to the holder key (`makeIssueCredential`).', {
      requestBody: body('IssueCredentialRequest'),
      responses: {
        200: json(
          ref('IssueCredentialResult'),
          'Result envelope: `ok` true with the credential, or `ok` false with an error code',
        ),
        ...BAD_REQUEST,
        ...SERVER_ERROR,
      },
    }),
  },
  '/api/holder/credentials': {
    get: operation('Holder', 'Wallet', 'Credentials bound to the holder key.', {
      responses: { 200: json(arrayOf('CredentialView'), 'Wallet'), ...SERVER_ERROR },
    }),
  },
  '/api/holder/proofs': {
    post: operation(
      'Holder',
      'Build a proof',
      'Proves GPA >= threshold for a challenge (`makeGenerateProof`). The holder key sits in the server.',
      {
        requestBody: body('CreateProofRequest'),
        responses: {
          200: json(ref('CreateProofResult'), 'Result envelope with the proof or an error code'),
          ...BAD_REQUEST,
          ...SERVER_ERROR,
        },
      },
    ),
  },
  '/api/verifier/challenges': {
    get: operation('Verifier', 'List challenges', 'Newest first, status computed from the server clock.', {
      responses: { 200: json(arrayOf('ChallengeView'), 'Challenges'), ...SERVER_ERROR },
    }),
    post: operation(
      'Verifier',
      'Issue a challenge',
      'Registers a single-use, verifier-scoped challenge (`makeIssueChallenge`).',
      {
        requestBody: body('IssueChallengeRequest'),
        responses: { 200: json(ref('ChallengeView'), 'Issued challenge'), ...BAD_REQUEST, ...SERVER_ERROR },
      },
    ),
  },
  '/api/verifier/verifications': {
    post: operation(
      'Verifier',
      'Verify a proof',
      'Preconditions, then the contract check, then challenge consumption (`makeVerifyCredential`). A rejection is HTTP 200 with `accepted: false`.',
      {
        requestBody: body('VerifyRequest'),
        responses: { 200: json(ref('VerifyResult'), 'Verdict'), ...BAD_REQUEST, ...SERVER_ERROR },
      },
    ),
  },
  '/api/scenarios': {
    get: operation(
      'Simulator',
      'Scenario catalog',
      '22 attacks and 4 honest flows. `applicableConfigurations` lists where this server can run each one.',
      {
        responses: { 200: json(arrayOf('Scenario'), 'Scenarios'), ...SERVER_ERROR },
      },
    ),
  },
  '/api/runs': {
    post: operation(
      'Simulator',
      'Start a run',
      'Runs one scenario on the real container, one run at a time. Follow it with the events endpoint.',
      {
        requestBody: body('StartRunRequest'),
        responses: {
          202: json(ref('StartRunResponse'), 'Run accepted'),
          400: error('`SCENARIO_UNKNOWN`, `SCENARIO_NOT_APPLICABLE` or a broken request.'),
          409: error('`RUN_IN_PROGRESS`.'),
          ...SERVER_ERROR,
        },
      },
    ),
  },
  '/api/runs/{id}/events': {
    get: operation(
      'Simulator',
      'Stream run events (SSE)',
      'Server-Sent Events. Plain messages carry a `RunEvent`; the named message `run.completed` carries a `RunSummary`, after which the server closes the stream. A late client is replayed from `seq = 0`.',
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'r1' }],
        responses: {
          200: {
            description: 'Event stream',
            content: {
              'text/event-stream': {
                schema: { type: 'string' },
                example:
                  'data: {"runId":"r1","seq":0,"node":"issuer","step":"credential.issued","status":"completed","at":1790000000000,"data":{"credentialId":"c1","issuerId":"issuer-local"}}\n\nevent: run.completed\ndata: {"runId":"r1","configuration":"B4","scenarioId":"valid-accepted","outcome":{"accepted":true,"stage":"verify","reason":"ACCEPTED"},"totalMs":1830}\n\n',
              },
            },
          },
          404: error('`RUN_UNKNOWN`.'),
        },
      },
    ),
  },
};
