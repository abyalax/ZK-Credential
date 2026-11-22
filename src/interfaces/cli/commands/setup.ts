import { generateHolderKeyPair } from '../../../infrastructure/index.js';
import { printJson, saveHolderKeys, withContainer } from '../context.js';
import type { Command } from './types.js';

export const keygen: Command = {
  name: 'keygen',
  description: 'Generate a holder key pair (private key stays in the state dir)',
  run: async (_args, context, io) => {
    const pair = await generateHolderKeyPair();
    await saveHolderKeys(context, { publicKey: pair.publicKey, privateKey: pair.privateKey });
    printJson(io, { holderPublicKey: pair.publicKey });
    return 0;
  },
};

export const registerIssuer: Command = {
  name: 'register-issuer',
  description: 'Register the configured issuer key on-chain (registry owner only)',
  run: (_args, context, io) =>
    withContainer(context, async ({ issuer, issuers }) => {
      await issuers.addIssuer(issuer.publicKey);
      printJson(io, { issuerId: issuer.id, registered: await issuers.isTrusted(issuer.publicKey) });
      return 0;
    }),
};
