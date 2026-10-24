'use client';

import { useCallback, useEffect, useState } from 'react';

// Chromium fires `beforeinstallprompt` once, early, when the app is
// installable. The event is kept at module scope so a component that mounts
// after it fired (the checklist waits for the workspace to load) still gets
// it; `prompt()` may only be called once per event, so it is dropped after use.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let listening = false;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((listener) => listener());

const startListening = () => {
  if (listening || typeof window === 'undefined') {
    return;
  }
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
};

startListening();

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari before display-mode support
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true);

// iOS browsers never fire beforeinstallprompt; installing is a manual
// "Share → Add to Home Screen" (only Safari offers it before iOS 16.4).
const isIos = () =>
  typeof window !== 'undefined' &&
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
  !(window as Window & { MSStream?: unknown }).MSStream;

export type PwaInstallState =
  | 'installed' // running standalone or installed during this visit
  | 'promptable' // beforeinstallprompt captured, prompt() can be shown
  | 'ios' // no event on iOS, show the manual hint
  | 'unavailable'; // nothing to offer (not installable, or already decided)

export const usePwaInstall = () => {
  const [state, setState] = useState<PwaInstallState>('unavailable');

  useEffect(() => {
    const compute = () => {
      if (installed || isStandalone()) {
        setState('installed');
      } else if (deferredPrompt) {
        setState('promptable');
      } else if (isIos()) {
        setState('ios');
      } else {
        setState('unavailable');
      }
    };
    compute();
    listeners.add(compute);
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener('change', compute);
    return () => {
      listeners.delete(compute);
      media.removeEventListener('change', compute);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferredPrompt;
    if (!event) {
      return 'unavailable' as const;
    }
    deferredPrompt = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      installed = true;
    }
    notify();
    return outcome;
  }, []);

  return { state, promptInstall };
};
