import { describe, expect, it } from 'vitest';
import {
  type ConfigurationId,
  listScenarios,
  PUBLIC_DATA_KEYS,
  privateDataKeys,
  type RunEvent,
  type RunSummary,
  resolveScenario,
} from '../../../src/application/index.js';
import { createSimulationServices } from '../../support/simulation-services.js';

const runOn = async (scenarioId: string, configuration: ConfigurationId = 'B4', verifyCredentialGas?: number) => {
  const { services } = createSimulationServices({}, verifyCredentialGas === undefined ? {} : { verifyCredentialGas });
  const resolved = resolveScenario(scenarioId, configuration);
  if (!resolved.ok) throw new Error(`cannot resolve ${scenarioId}: ${resolved.error}`);
  const events: RunEvent[] = [];
  const summary: RunSummary = await services.runScenario({
    runId: 'r1',
    configuration,
    scenario: resolved.value,
    emit: (event) => events.push(event),
  });
  return { events, summary };
};

const steps = (events: readonly RunEvent[]): string[] => events.map((event) => `${event.step}:${event.status}`);

/** docs/ui/contract.md, "Pemetaan penolakan": which node turns red for each reason. */
const REJECTING_NODE: Record<string, string> = {
  PROVE_FAILED: 'holder',
  CHALLENGE_VERIFIER_MISMATCH: 'verifier',
  THRESHOLD_BELOW_REQUIRED: 'verifier',
  CHALLENGE_UNKNOWN: 'verifier',
  CHALLENGE_EXPIRED: 'verifier',
  CHALLENGE_ALREADY_USED: 'verifier',
  ISSUER_NOT_REGISTERED: 'contract',
  PROOF_INVALID: 'contract',
};

const applicable = listScenarios().filter((scenario) => scenario.applicableConfigurations.includes('B4'));

describe('scenario catalog as served', () => {
  it('lists 22 attacks and 4 honest flows', () => {
    const all = listScenarios();
    expect(all.filter((scenario) => scenario.kind === 'attack')).toHaveLength(22);
    expect(all.filter((scenario) => scenario.kind === 'honest')).toHaveLength(4);
  });

  it('runs only on B4, and leaves out the scenarios that need a second issuer or a doctored credential', () => {
    const notApplicable = listScenarios().filter((scenario) => scenario.applicableConfigurations.length === 0);
    expect(notApplicable.map((scenario) => scenario.id).sort()).toEqual([
      'claims-challenge-out-of-field',
      'credential-tampered',
      'issuer-unregistered',
      'signature-malformed',
      'signature-other-issuer',
    ]);
    expect(applicable.every((scenario) => scenario.applicableConfigurations.join() === 'B4')).toBe(true);
  });

  it('refuses unknown scenarios and configurations the server cannot run', () => {
    expect(resolveScenario('nope', 'B4')).toEqual({ ok: false, error: 'SCENARIO_UNKNOWN' });
    expect(resolveScenario('valid-accepted', 'SD')).toEqual({ ok: false, error: 'SCENARIO_NOT_APPLICABLE' });
    expect(resolveScenario('valid-accepted', 'B1')).toEqual({ ok: false, error: 'SCENARIO_NOT_APPLICABLE' });
    expect(resolveScenario('issuer-unregistered', 'B4')).toEqual({ ok: false, error: 'SCENARIO_NOT_APPLICABLE' });
  });
});

describe('run orchestrator', () => {
  it('emits the honest flow in the order of the contract', async () => {
    const { events, summary } = await runOn('valid-accepted');
    expect(steps(events)).toEqual([
      'credential.issued:completed',
      'challenge.issued:completed',
      'witness.computed:started',
      'proof.generated:started',
      'witness.computed:completed',
      'proof.generated:completed',
      'presentation.sent:completed',
      'preconditions.checked:completed',
      'issuer.checked:completed',
      'proof.verified:started',
      'proof.verified:completed',
      'challenge.consumed:completed',
    ]);
    expect(summary).toMatchObject({ runId: 'r1', configuration: 'B4', scenarioId: 'valid-accepted' });
    expect(summary.outcome).toEqual({ accepted: true, stage: 'verify', reason: 'ACCEPTED' });
  });

  it.each(applicable.map((scenario) => [scenario.id, scenario.fullReason] as const))(
    '%s ends with the reason P5 expects on B4 (%s)',
    async (id, fullReason) => {
      const { summary } = await runOn(id);
      expect(summary.outcome.reason).toBe(fullReason);
      expect(summary.outcome.accepted).toBe(fullReason === 'ACCEPTED');
      expect(summary.outcome.stage).toBe(fullReason === 'PROVE_FAILED' ? 'prove' : 'verify');
    },
  );

  it.each(applicable.map((scenario) => scenario.id))('%s keeps event order, public data and the rejecting node', async (id) => {
    const { events, summary } = await runOn(id);
    expect(events.map((event) => event.seq)).toEqual(events.map((_event, index) => index));
    expect(events.every((event) => privateDataKeys(event.data).length === 0)).toBe(true);

    const rejected = events.filter((event) => event.status === 'rejected');
    if (summary.outcome.accepted) return expect(rejected).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBe(summary.outcome.reason);
    expect(rejected[0]?.node).toBe(REJECTING_NODE[summary.outcome.reason]);
  });
});

describe('run orchestrator: replay and disclosure', () => {
  it('presents the same proof twice for a replay and rejects the second time at the verifier', async () => {
    const { events, summary } = await runOn('replay-same-proof');
    expect(events.filter((event) => event.step === 'presentation.sent')).toHaveLength(2);
    expect(steps(events).slice(-3)).toEqual([
      'challenge.consumed:completed',
      'presentation.sent:completed',
      'preconditions.checked:rejected',
    ]);
    expect(events.at(-1)).toMatchObject({ step: 'preconditions.checked', status: 'rejected', reason: 'CHALLENGE_ALREADY_USED' });
    expect(summary.outcome.reason).toBe('CHALLENGE_ALREADY_USED');
  });

  it('stops after a rejected first presentation instead of replaying', async () => {
    const { events } = await runOn('payload-not-json');
    expect(events.filter((event) => event.step === 'presentation.sent')).toHaveLength(1);
  });

  it('shows the relabelled challenge in the second presentation', async () => {
    const { events } = await runOn('replay-relabelled-challenge');
    const sent = events.filter((event) => event.step === 'presentation.sent');
    expect(sent).toHaveLength(2);
    expect(sent[0]?.data?.challenge).not.toBe(sent[1]?.data?.challenge);
  });

  it('never reveals attributes to the verifier on B4', async () => {
    const { events } = await runOn('valid-accepted');
    expect(events.find((event) => event.step === 'presentation.sent')?.data?.attributesRevealed).toBe(0);
  });
});

describe('public data allowlist', () => {
  it('flags every key outside the list and nothing inside it', () => {
    expect(privateDataKeys({ gpa: 350, fullName: 'x' })).toEqual(['gpa', 'fullName']);
    expect(privateDataKeys(Object.fromEntries(PUBLIC_DATA_KEYS.map((key) => [key, 1])))).toEqual([]);
    expect(privateDataKeys(undefined)).toEqual([]);
  });
});

describe('reference gas on the Contract node', () => {
  const GAS = 251_374;
  const verified = (events: readonly RunEvent[]) =>
    events.filter((event) => event.step === 'proof.verified' && event.status === 'completed');

  it('attaches the P6 gas to an accepted verification, as an allowed public key', async () => {
    const { events } = await runOn('valid-accepted', 'B4', GAS);
    const [done] = verified(events);
    expect(done?.node).toBe('contract');
    expect(done?.data).toEqual({ gasUsed: GAS });
    expect(events.every((event) => privateDataKeys(event.data).length === 0)).toBe(true);
  });

  it('shows gas only on the accepted pass of a replay, not on the rejected one', async () => {
    const { events, summary } = await runOn('replay-same-proof', 'B4', GAS);
    expect(summary.outcome.reason).toBe('CHALLENGE_ALREADY_USED');
    expect(verified(events)).toHaveLength(1);
    expect(events.filter((event) => event.data?.gasUsed !== undefined)).toHaveLength(1);
  });

  it('shows no gas when the contract rejects the proof', async () => {
    const { events } = await runOn('proof-bytes-tampered', 'B4', GAS);
    expect(events.some((event) => event.data?.gasUsed !== undefined)).toBe(false);
  });

  it('shows no gas when no P6 run measured it', async () => {
    const { events } = await runOn('valid-accepted');
    expect(verified(events)[0]?.data).toBeUndefined();
  });
});
