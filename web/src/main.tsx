import { createStore, Provider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { containerAtom } from '@/features';
import { type ApiMode, bootstrapContainer } from '@/infrastructure';
import { App } from './app/App';
import { StartupError } from './app/StartupError';
import './app/styles.css';

/** `?mode=` wins over `VITE_API_MODE`, so one build can switch to the backup recordings during the defense. */
const resolveMode = (): ApiMode => {
  const requested = new URLSearchParams(window.location.search).get('mode') ?? import.meta.env.VITE_API_MODE;
  return requested === 'http' || requested === 'replay' ? requested : 'mock';
};

const start = async (root: HTMLElement): Promise<void> => {
  const reactRoot = createRoot(root);
  try {
    // Composition root: the only place that chooses concrete gateways.
    const store = createStore();
    store.set(containerAtom, await bootstrapContainer(resolveMode()));
    reactRoot.render(
      <StrictMode>
        <Provider store={store}>
          <App />
        </Provider>
      </StrictMode>,
    );
  } catch (error) {
    reactRoot.render(<StartupError message={error instanceof Error ? error.message : String(error)} />);
  }
};

const root = document.getElementById('root');
if (!root) throw new Error('#root tidak ditemukan');
start(root).catch((error: unknown) => console.error('Gagal memulai UI', error));
