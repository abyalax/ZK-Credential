export type Async<T = undefined> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'done'; readonly value: T };

export const IDLE: Async<never> = { status: 'idle' };
export const LOADING: Async<never> = { status: 'loading' };
export const failed = (error: unknown): Async<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : 'Terjadi kesalahan',
});
