'use client';

import { useMemo } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import {
  BrowserKind,
  createExtensionClient,
  detectBrowser,
  ExtensionClient,
  ExtensionTargets,
  hasExtension,
  installTarget,
  InstallTarget,
  messagingIds,
  parseExtensionIds,
} from '@gitroom/helpers/utils/browser.extension';

export interface BrowserExtension {
  targets: ExtensionTargets;
  // true when at least one store build is configured (EXTENSION_ID/EXTENSION_IDS)
  configured: boolean;
  browser: BrowserKind;
  // where this browser installs it; null = not available for this browser yet
  install: InstallTarget | null;
  client: ExtensionClient;
}

// One place for "talk to the ViralGenHub extension": Chromium and Safari by
// extension ID (runtime.sendMessage), Firefox through the extension's
// postMessage bridge. Same messages either way (PING, GET_COOKIES, ...).
export const useBrowserExtension = (): BrowserExtension => {
  const { extensionId, extensionIds } = useVariables();
  return useMemo(() => {
    const targets = parseExtensionIds(extensionIds, extensionId);
    const browser = detectBrowser(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    );
    const g = (typeof window !== 'undefined' ? window : {}) as any;
    const runtime =
      g.chrome?.runtime?.sendMessage
        ? g.chrome.runtime
        : g.browser?.runtime?.sendMessage
        ? g.browser.runtime
        : null;
    const client = createExtensionClient({
      runtime,
      ids: messagingIds(targets, browser),
      bridge: typeof window !== 'undefined' ? window : null,
    });
    return {
      targets,
      configured: hasExtension(targets),
      browser,
      install: installTarget(targets, browser),
      client,
    };
  }, [extensionId, extensionIds]);
};
