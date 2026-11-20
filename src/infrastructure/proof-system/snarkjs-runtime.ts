/** Loaded lazily so code paths that never prove or verify do not pay for snarkjs start-up. */
export const loadSnarkjs = (): Promise<typeof import('snarkjs')> => import('snarkjs');

/**
 * snarkjs keeps WebAssembly worker threads alive after the first curve use, which stops the
 * process from exiting. Call this once all proving and verifying is finished.
 */
export const terminateSnarkjs = async (): Promise<void> => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  await curve?.terminate?.();
};
