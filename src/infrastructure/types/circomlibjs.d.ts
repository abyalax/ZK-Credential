/**
 * Minimal typings for the parts of `circomlibjs` (v0.1.x) this project uses.
 * The package ships no declarations. Extend this file when more of its API is needed.
 */
declare module 'circomlibjs' {
  /** Field element in circomlibjs' internal (Montgomery) encoding. Convert with `F.toObject`. */
  export type FieldElement = Uint8Array;

  export type Point = readonly [FieldElement, FieldElement];

  export interface Field {
    e: (value: bigint | number | string) => FieldElement;
    toObject: (element: FieldElement) => bigint;
    eq: (a: FieldElement, b: FieldElement) => boolean;
  }

  export interface Poseidon {
    (inputs: ReadonlyArray<bigint | number | string | FieldElement>): FieldElement;
    readonly F: Field;
  }

  export interface EddsaSignature {
    readonly R8: Point;
    readonly S: bigint;
  }

  export interface Eddsa {
    readonly F: Field;
    /** Derives the BabyJubJub public key (Ax, Ay) from a 32-byte private key. */
    prv2pub: (privateKey: Uint8Array) => Point;
    signPoseidon: (privateKey: Uint8Array, message: FieldElement) => EddsaSignature;
    verifyPoseidon: (message: FieldElement, signature: EddsaSignature, publicKey: Point) => boolean;
  }

  export function buildPoseidon(): Promise<Poseidon>;
  export function buildEddsa(): Promise<Eddsa>;
}
