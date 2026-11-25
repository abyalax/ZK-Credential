/** `components.schemas` of the API. Mirrors docs/ui/contract.md; GPA values are always whole numbers scaled by 100. */
type Schema = Readonly<Record<string, unknown>>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const str = (description: string, extra: Schema = {}): Schema => ({ type: 'string', description, ...extra });
const gpa = (description: string): Schema => ({ type: 'integer', minimum: 0, maximum: 400, description });
const obj = (properties: Record<string, Schema>, required: readonly string[] = Object.keys(properties)): Schema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

/** `{ ok: true, value } | { ok: false, error }`: the envelope of every `Result` the use cases return. */
const resultOf = (value: Schema, error: Schema): Schema => ({
  oneOf: [obj({ ok: { const: true }, value }), obj({ ok: { const: false }, error })],
  discriminator: { propertyName: 'ok' },
});

export const REJECTION_REASONS = [
  'CHALLENGE_UNKNOWN',
  'CHALLENGE_VERIFIER_MISMATCH',
  'CHALLENGE_ALREADY_USED',
  'CHALLENGE_EXPIRED',
  'ISSUER_NOT_REGISTERED',
  'THRESHOLD_BELOW_REQUIRED',
  'PROOF_INVALID',
  'PROVE_FAILED',
] as const;

const CHALLENGE_PATTERN = '^[0-9a-f]{62}$';

export const schemas: Record<string, Schema> = {
  ConfigurationId: {
    type: 'string',
    enum: ['A', 'SD', 'B1', 'B2', 'B3', 'B4'],
    description: 'A and SD are baselines; B1-B4 are the circuit ablation ladder.',
  },
  ErrorBody: obj(
    { error: str('Machine-readable code, e.g. `RUN_IN_PROGRESS`.'), detail: str('Human-readable hint for a broken request.') },
    ['error'],
  ),
  CredentialView: obj({
    id: str('Credential id.'),
    issuerId: str('Issuer id.'),
    holderPublicKey: str('Poseidon(holderPrivateKey) as a decimal string.'),
    studentNumber: str('Student number (NIM).'),
    fullName: str('Full name.'),
    degree: str('Degree.'),
    graduationDate: str('ISO date.', { format: 'date' }),
    gpa: gpa('GPA x 100 (350 = 3.50).'),
    issuedAt: { type: 'integer', description: 'Epoch milliseconds.' },
  }),
  IssuerView: obj({
    id: str('Issuer id.'),
    name: str('Display name.'),
    publicKey: str('Serialized BabyJubJub public key.'),
    registered: { type: 'boolean', description: 'Whether the on-chain IssuerRegistry trusts this key.' },
  }),
  ChallengeView: obj({
    value: str('31 random bytes as 62 lowercase hex characters.', { pattern: CHALLENGE_PATTERN }),
    verifierId: str('Verifier the challenge was issued for.'),
    issuedAt: { type: 'integer' },
    expiresAt: { type: 'integer' },
    status: { type: 'string', enum: ['issued', 'consumed', 'expired'], description: 'Computed from the server clock.' },
  }),
  PublicSignalsView: obj({
    issuerPublicKey: str('Issuer key the proof is bound to.'),
    gpaThreshold: gpa('Threshold the proof claims (GPA x 100).'),
    challenge: str('Challenge the proof is bound to.', { pattern: CHALLENGE_PATTERN }),
    verifierId: str('Verifier the proof is bound to.'),
  }),
  ProofView: obj({
    payload: str('Opaque serialized Groth16 proof.'),
    publicSignals: ref('PublicSignalsView'),
    sizeBytes: { type: 'integer' },
    durationMs: { type: 'integer', description: 'Time to build the proof on the server.' },
  }),
  Outcome: obj({
    accepted: { type: 'boolean' },
    stage: { type: 'string', enum: ['prove', 'verify'] },
    reason: {
      type: 'string',
      description: '`ACCEPTED` or one of the rejection reasons.',
      examples: ['ACCEPTED', ...REJECTION_REASONS],
    },
  }),
  VerifyResult: { allOf: [ref('Outcome'), obj({ durationMs: { type: 'integer' } })] },
  IssueCredentialRequest: obj({
    studentNumber: str('Student number (NIM).'),
    fullName: str('Full name.'),
    degree: str('Degree.'),
    graduationDate: str('ISO date (YYYY-MM-DD).'),
    gpa: { type: 'number', description: 'GPA x 100. Range is checked by the domain and reported as `GPA_OUT_OF_RANGE`.' },
  }),
  IssueCredentialError: {
    type: 'string',
    enum: ['REQUIRED_FIELD_EMPTY', 'GPA_OUT_OF_RANGE', 'GRADUATION_DATE_INVALID', 'ISSUER_NOT_REGISTERED', 'SIGNER_KEY_MISMATCH'],
  },
  IssueCredentialResult: resultOf(ref('CredentialView'), ref('IssueCredentialError')),
  CreateProofRequest: obj({
    credentialId: str('Credential to prove about.'),
    challenge: str('Challenge from the verifier.', { pattern: CHALLENGE_PATTERN }),
    verifierId: str('Verifier the proof is for.'),
    threshold: gpa('Claimed GPA threshold (x 100).'),
  }),
  CreateProofError: { type: 'string', enum: ['CREDENTIAL_NOT_FOUND', 'ATTRIBUTE_BELOW_THRESHOLD'] },
  CreateProofResult: resultOf(ref('ProofView'), ref('CreateProofError')),
  IssueChallengeRequest: obj({
    verifierId: str('Verifier the challenge is scoped to.'),
    ttlMs: { type: 'integer', minimum: 1, maximum: 86_400_000, description: 'Lifetime in milliseconds.' },
  }),
  VerifyRequest: obj({
    proof: ref('ProofView'),
    verifierId: str('The verifier doing the check.'),
    requiredThreshold: gpa('Threshold the verifier demands (x 100).'),
  }),
  Scenario: obj({
    id: str('Scenario id, as in experiments/scenarios/catalog.ts.'),
    title: str('Short description.'),
    kind: { type: 'string', enum: ['honest', 'attack'] },
    category: { type: 'string', enum: ['baseline', 'threshold', 'issuer', 'holder', 'replay', 'malformed'] },
    openIn: {
      type: 'array',
      items: { type: 'string', enum: ['threshold', 'issuer', 'holder', 'full'] },
      description: 'Variants where the attack is a documented gap.',
    },
    fullReason: str('Expected reason on B4.'),
    applicableConfigurations: {
      type: 'array',
      items: ref('ConfigurationId'),
      description: 'Configurations this server can run the scenario on.',
    },
  }),
  StartRunRequest: obj({ configuration: ref('ConfigurationId'), scenarioId: str('An id from `GET /api/scenarios`.') }),
  StartRunResponse: obj({ runId: str('Id to stream from `GET /api/runs/{id}/events`.') }),
  RunEvent: obj(
    {
      runId: str('Run id.'),
      seq: { type: 'integer', description: 'Emission order; clients drop repeats.' },
      node: { type: 'string', enum: ['issuer', 'holder', 'verifier', 'contract'] },
      step: str('Step id such as `credential.issued` or `proof.verified`.'),
      status: { type: 'string', enum: ['started', 'completed', 'rejected'] },
      at: { type: 'integer', description: 'Epoch milliseconds.' },
      durationMs: { type: 'integer' },
      data: {
        type: 'object',
        additionalProperties: { type: ['string', 'number'] },
        description: 'Public values only (allowlist in docs/ui/contract.md).',
      },
      reason: str('Only on `rejected`.'),
    },
    ['runId', 'seq', 'node', 'step', 'status', 'at'],
  ),
  RunSummary: obj({
    runId: str('Run id.'),
    configuration: ref('ConfigurationId'),
    scenarioId: str('Scenario id.'),
    outcome: ref('Outcome'),
    totalMs: { type: 'integer' },
  }),
};
