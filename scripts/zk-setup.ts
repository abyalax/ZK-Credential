/**
 * Builds every circuit variant: compile (circom2) -> powers of tau -> Groth16 setup ->
 * verification key + Solidity verifier. Output goes to circuits/artifacts/ (gitignored).
 *
 * Usage: pnpm zk:setup [--force] [variant ...]
 *
 * SECURITY: the ceremony below has a single, locally generated contribution. It is fine for
 * research and testing, and must never be used to protect real credentials.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative } from 'node:path';
import * as snarkjs from 'snarkjs';
import {
  circuitArtifactPaths,
  DEFAULT_ARTIFACTS_DIR,
  ptauPath,
  REPOSITORY_ROOT,
} from '../src/infrastructure/proof-system/artifact-paths.js';
import { terminateSnarkjs } from '../src/infrastructure/proof-system/snarkjs-runtime.js';

const CIRCUITS_SRC = join(REPOSITORY_ROOT, 'circuits', 'src');
const VARIANTS_DIR = join(CIRCUITS_SRC, 'variants');
/** Smallest ptau worth generating; small circuits all share it. */
const MIN_PTAU_POWER = 8;
const NATIVE_CIRCOM = (() => {
  try {
    execFileSync('circom', ['--version'], { stdio: 'ignore' });
    return 'circom';
  } catch {}
})();
// circom2 (the WASM compiler) cannot emit a witness generator on Windows, but native Circom can.
const GENERATE_WASM = process.platform !== 'win32' || NATIVE_CIRCOM !== undefined;

const require = createRequire(import.meta.url);

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const listCircomFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return listCircomFiles(path);
      return entry.name.endsWith('.circom') ? [path] : [];
    }),
  );
  return nested.flat().sort((a, b) => a.localeCompare(b));
};

/**
 * Files are read in parallel but hashed in their sorted order. Hashing inside the parallel reads
 * made the digest depend on which read finished first, so it changed between runs and every
 * `pnpm zk:setup` rebuilt all variants.
 */
const hashSources = async (): Promise<string> => {
  const files = await listCircomFiles(CIRCUITS_SRC);
  const contents = await Promise.all(files.map((file) => readFile(file)));
  const hash = createHash('sha256');
  files.forEach((file, index) => {
    hash.update(relative(CIRCUITS_SRC, file));
    hash.update(contents[index] ?? '');
  });
  return hash.digest('hex');
};

const isUpToDate = async (variant: string, sourceHash: string): Promise<boolean> => {
  const paths = circuitArtifactPaths(variant);
  const required = [
    paths.r1cs,
    ...(GENERATE_WASM ? [paths.wasm] : []),
    paths.zkey,
    paths.verificationKey,
    paths.solidityVerifier,
  ];
  if (!required.every((file) => existsSync(file))) return false;
  if (!existsSync(paths.sourceHash)) return false;
  return (await readFile(paths.sourceHash, 'utf8')).trim() === sourceHash;
};

/**
 * circom2 is Circom compiled to WASM. Run from the repository root so includes resolve on both
 * Windows and Linux.
 */
const compile = (variant: string): void => {
  const circom2 = require.resolve('circom2/cli.js');
  const args = [
    join('circuits', 'src', 'variants', `${variant}.circom`),
    '--r1cs',
    '--sym',
    ...(GENERATE_WASM ? ['--wasm'] : []),
    '-o',
    join('circuits', 'src', 'variants'),
    '-l',
    join('circuits', 'src', 'templates'),
    '-l',
    'node_modules',
  ];
  try {
    if (NATIVE_CIRCOM) {
      execFileSync(NATIVE_CIRCOM, args, { cwd: REPOSITORY_ROOT, stdio: 'inherit' });
    } else {
      execFileSync(process.execPath, [circom2, ...args], {
        cwd: REPOSITORY_ROOT,
        stdio: 'inherit',
      });
    }
  } catch (error) {
    if (
      !(
        existsSync(join(VARIANTS_DIR, `${variant}.r1cs`)) &&
        (!GENERATE_WASM || existsSync(join(VARIANTS_DIR, `${variant}_js`, `${variant}.wasm`)))
      )
    ) {
      const output = error as { stdout?: string; stderr?: string };
      throw new Error(
        `Circuit compilation failed for "${variant}": ${output.stderr ?? 'missing R1CS/WASM output'}`,
      );
    }
  }
  if (GENERATE_WASM && !existsSync(join(VARIANTS_DIR, `${variant}_js`, `${variant}.wasm`))) {
    throw new Error(
      `Circuit "${variant}" has no WASM witness generator. Install native Circom (recommended on Windows) and rerun pnpm zk:setup.`,
    );
  }
};

const entropy = (): string => randomBytes(32).toString('hex');


const getPtauCurve = async (): Promise<unknown> => {
  const { curves } = snarkjs as unknown as {
    curves: {
      getCurveFromName: (name: string)=> Promise<unknown>;
    };
  };

  return curves.getCurveFromName('bn128');
};

const createInitialPtau = async (
  power: number,
  outputPath: string,
): Promise<void> => {
  const curve = await getPtauCurve();

  await snarkjs.powersOfTau.newAccumulator(
    curve,
    power,
    outputPath,
  );
};

const contributePtau = async (
  initialPath: string,
  outputPath: string,
): Promise<void> => {
  await snarkjs.powersOfTau.contribute(
    initialPath,
    outputPath,
    'zk-credential local ceremony',
    entropy(),
  );
};

const ensurePtau = async (power: number): Promise<string> => {
  const finalPath = ptauPath(power);

  if (existsSync(finalPath)) return finalPath;

  log(`  generating local powers of tau (2^${power}, single contributor)`);

  const dir = dirname(finalPath);
  await mkdir(dir, { recursive: true });

  const initial = join(dir, `pot${power}_0000.ptau`);
  const contributed = join(dir, `pot${power}_0001.ptau`);

  await createInitialPtau(power, initial);
  await contributePtau(initial, contributed);

  try {
    await snarkjs.powersOfTau.preparePhase2(
      contributed,
      finalPath,
    );
  } finally {
    await Promise.all([
      rm(initial, { force: true }),
      rm(contributed, { force: true }),
    ]);
  }

  return finalPath;
};


const ptauPowerFor = (info: snarkjs.R1CSInfoType): number => {
  const size = info.nConstraints + info.nPubInputs + info.nOutputs;
  return Math.max(MIN_PTAU_POWER, Math.floor(Math.log2(Math.max(size, 1))) + 1);
};

const loadVerifierTemplate = async (): Promise<string> => {
  // snarkjs restricts its package exports, so locate the templates next to the main entry point.
  const buildDir = dirname(require.resolve('snarkjs'));
  return readFile(join(buildDir, '..', 'templates', 'verifier_groth16.sol.ejs'), 'utf8');
};

const buildVariant = async (variant: string, sourceHash: string): Promise<void> => {
  const paths = circuitArtifactPaths(variant);
  await rm(paths.directory, { recursive: true, force: true });
  await mkdir(paths.directory, { recursive: true });

  log('  compiling');
  compile(variant);

  // Move compiled files from CIRCUITS_SRC/variants to paths.directory
  const compiledR1cs = join(VARIANTS_DIR, `${variant}.r1cs`);
  const compiledSym = join(VARIANTS_DIR, `${variant}.sym`);

  await rename(compiledR1cs, paths.r1cs);
  await rename(compiledSym, join(paths.directory, `${variant}.sym`));

  // Keep WASM beside the circuit artifacts on supported platforms.
  const compiledWasmDir = join(VARIANTS_DIR, `${variant}_js`);
  if (existsSync(compiledWasmDir))
    await rename(compiledWasmDir, join(paths.directory, `${variant}_js`));
  if (!GENERATE_WASM) log('    wasm compilation skipped (known issue with circom2 on Windows)');

  const info = await snarkjs.r1cs.info(paths.r1cs);
  log(
    `  constraints=${info.nConstraints} public-inputs=${info.nPubInputs} private-inputs=${info.nPrvInputs}`,
  );

  const ptau = await ensurePtau(ptauPowerFor(info));

  log('  groth16 setup');
  const initialZkey = join(paths.directory, `${variant}_0000.zkey`);
  await snarkjs.zKey.newZKey(paths.r1cs, ptau, initialZkey);
  await snarkjs.zKey.contribute(
    initialZkey,
    paths.zkey,
    'zk-credential local contribution',
    entropy(),
  );
  await rm(initialZkey, { force: true });

  if (!(await snarkjs.zKey.verifyFromR1cs(paths.r1cs, ptau, paths.zkey))) {
    throw new Error(`zkey for "${variant}" does not match its r1cs and ptau`);
  }

  const verificationKey = await snarkjs.zKey.exportVerificationKey(paths.zkey);
  await writeFile(paths.verificationKey, `${JSON.stringify(verificationKey, null, 2)}\n`);

  const solidity = await snarkjs.zKey.exportSolidityVerifier(paths.zkey, {
    groth16: await loadVerifierTemplate(),
  });
  await writeFile(paths.solidityVerifier, solidity);

  await writeFile(paths.sourceHash, `${sourceHash}\n`);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const requested = args.filter((arg) => !arg.startsWith('--'));

  const available = (await readdir(VARIANTS_DIR))
    .filter((file) => file.endsWith('.circom'))
    .map((file) => basename(file, '.circom'))
    .sort((a, b) => a.localeCompare(b));
  const unknown = requested.filter((variant) => !available.includes(variant));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown variant(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`,
    );
  }
  const variants = requested.length > 0 ? requested : available;

  await mkdir(DEFAULT_ARTIFACTS_DIR, { recursive: true });
  const sourceHash = await hashSources();

  for (const variant of variants) {
    log(`[${variant}]`);
    if (!force && (await isUpToDate(variant, sourceHash))) {
      log('  up to date');
      continue;
    }
    await buildVariant(variant, sourceHash);
    log('  done');
  }
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await terminateSnarkjs();
}
