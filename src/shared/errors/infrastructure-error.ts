/**
 * Unexpected technical failure (I/O, proof engine crash, ...).
 * Expected business outcomes are modelled with `Result`, not with this error.
 */
export class InfrastructureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InfrastructureError';
  }
}
