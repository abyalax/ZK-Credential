import type { PublicClient, WalletClient } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { createOnChainIssuerRegistry, issuerKeyHash } from '../../../src/infrastructure/index.js';
import { testIssuer } from '../../support/fakes.js';

describe('on-chain issuer registry adapter', () => {
  it('returns only configured issuers trusted by the contract', async () => {
    const trustedHash = await issuerKeyHash(testIssuer.publicKey);
    const readContract = vi.fn(async ({ args }: { args: readonly [bigint] }) => args[0] === trustedHash);
    const registry = createOnChainIssuerRegistry({
      publicClient: { readContract } as unknown as PublicClient,
      walletClient: {} as WalletClient,
      contractAddress: '0x0000000000000000000000000000000000000001',
      issuers: [testIssuer, { ...testIssuer, id: 'untrusted' as never, publicKey: '3:4' as never }],
    });

    await expect(registry.list()).resolves.toEqual([testIssuer]);
    expect(readContract).toHaveBeenCalledTimes(2);
  });

  it('submits issuer additions and waits for confirmation', async () => {
    const writeContract = vi.fn(async () => '0xabc');
    const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' }));
    const registry = createOnChainIssuerRegistry({
      publicClient: { waitForTransactionReceipt } as unknown as PublicClient,
      walletClient: {
        account: '0x0000000000000000000000000000000000000002',
        chain: null,
        writeContract,
      } as unknown as WalletClient,
      contractAddress: '0x0000000000000000000000000000000000000001',
      issuers: [],
    });

    await registry.addIssuer(testIssuer.publicKey);

    expect(writeContract).toHaveBeenCalledOnce();
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'addIssuer',
        args: [await issuerKeyHash(testIssuer.publicKey)],
      }),
    );
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xabc' });
  });
});
