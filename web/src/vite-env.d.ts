/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'http' | 'replay';
  readonly VITE_API_PROXY?: string;
}
