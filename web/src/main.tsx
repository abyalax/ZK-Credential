import { createStore, Provider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { containerAtom } from '@/features';
import { type ApiMode, createContainer } from '@/infrastructure';
import { App } from './app/App';
import './app/styles.css';

/** Composition root: the only place that chooses concrete gateways. */
const mode: ApiMode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';
const store = createStore();
store.set(containerAtom, createContainer(mode));

const root = document.getElementById('root');
if (!root) throw new Error('#root tidak ditemukan');

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
