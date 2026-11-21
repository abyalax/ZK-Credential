import type { Address, Hex } from 'viem';
import { DEFAULT_LOCAL_RPC_URL } from '../../infrastructure/index.js';

export interface AppConfig {
  readonly chain: {
    readonly rpcUrl: string;
    readonly issuerRegistryAddress: Address;
    readonly credentialVerifierAddress: Address;
    /** Only needed to register issuers; verification and issuing work without it. */
    readonly registryOwnerPrivateKey?: Hex;
  };
  readonly issuer: {
    readonly id: string;
    readonly name: string;
    /** 32-byte hex BabyJubJub key, provisioned outside git (see docs/protocol/toolchain.md). */
    readonly privateKey: string;
  };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

type Env = Readonly<Record<string, string | undefined>>;

const required = (env: Env, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new TypeError(`Missing environment variable ${name} (see .env.example)`);
  return value;
};

const address = (env: Env, name: string): Address => {
  const value = required(env, name);
  if (!ADDRESS.test(value)) throw new TypeError(`${name} must be a 20-byte hex address`);
  return value as Address;
};

/** Reads the local configuration from environment variables. Fails fast on missing or malformed values. */
export const loadConfig = (env: Env): AppConfig => {
  const ownerKey = env.REGISTRY_OWNER_PRIVATE_KEY?.trim();
  if (ownerKey && !PRIVATE_KEY.test(ownerKey))
    throw new TypeError('REGISTRY_OWNER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key');
  return {
    chain: {
      rpcUrl: env.CHAIN_RPC_URL?.trim() || DEFAULT_LOCAL_RPC_URL,
      issuerRegistryAddress: address(env, 'ISSUER_REGISTRY_ADDRESS'),
      credentialVerifierAddress: address(env, 'CREDENTIAL_VERIFIER_ADDRESS'),
      ...(ownerKey ? { registryOwnerPrivateKey: ownerKey as Hex } : {}),
    },
    issuer: {
      id: env.ISSUER_ID?.trim() || 'issuer-local',
      name: env.ISSUER_NAME?.trim() || 'Local University',
      privateKey: required(env, 'ISSUER_PRIVATE_KEY'),
    },
  };
};
