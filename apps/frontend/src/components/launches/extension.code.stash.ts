// Extension-based providers (Skool) hand over session cookies. They must never
// travel in a URL (access logs, browser history, Referer), so they are kept in
// sessionStorage (same tab, same origin, gone when the tab closes) for the one
// hop from the add-provider modal to the continue page, which then POSTs them
// in the request body to /integrations/social-connect/:provider.
const key = (state: string) => `vgh-ext-code:${state}`;

export const stashExtensionCode = (state: string, code: string): boolean => {
  try {
    window.sessionStorage.setItem(key(state), code);
    return true;
  } catch {
    return false;
  }
};

export const readExtensionCode = (state: string): string => {
  try {
    return window.sessionStorage.getItem(key(state)) || '';
  } catch {
    return '';
  }
};

export const clearExtensionCode = (state: string) => {
  try {
    window.sessionStorage.removeItem(key(state));
  } catch {
    // ignore
  }
};
