declare const brand: unique symbol;

/** Nominal typing helper: keeps structurally identical primitives from being mixed up. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
