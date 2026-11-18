/** Compile-time exhaustiveness check for discriminated unions. */
export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
};
