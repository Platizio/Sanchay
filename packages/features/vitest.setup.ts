import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

interface NodeUtilModule {
  transferableAbortController(): AbortController;
}

interface NodeProcess {
  getBuiltinModule(id: 'node:util'): NodeUtilModule;
}

// Vitest's jsdom environment can swap the global AbortController/AbortSignal for jsdom's, while fetch and
// Request stay Node's (undici). undici checks RequestInit.signal against the AbortSignal class it saw
// when it first loaded, so a jsdom signal that TanStack Query hands to oRPC can make
// `new Request(url, { signal })` throw "Expected signal (...) to be an instance of AbortSignal".
// Pinning Node's own classes (recovered through node:util) keeps every signal in one realm whichever
// loads first; where Vitest already exposes Node's classes this is a no-op guard.
// jsdom's addEventListener({ signal }) would reject these signals; no code under test uses it.
const nodeProcess = (globalThis as unknown as { process: NodeProcess }).process;
const nodeController = nodeProcess.getBuiltinModule('node:util').transferableAbortController();
globalThis.AbortController = nodeController.constructor as typeof AbortController;
globalThis.AbortSignal = nodeController.signal.constructor as typeof AbortSignal;

afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia; react-native-web's Appearance and Dimensions probe it.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
