// Firefox build only (EXT_BROWSER=firefox): content script on the ViralGenHub app
// origins listed in the manifest (app.viralgenhub.com; the staging build adds staging).
//
// Firefox does not let web pages message an extension (externally_connectable is
// not supported, https://bugzil.la/1319168), so the app posts its request to its
// own window and this script relays it to the background, which runs the same
// origin check as on Chromium. It reads nothing from the page and touches no DOM.
//
// Page -> here:  { type: 'vgh-ext-request',  id, message }
// here -> page:  { type: 'vgh-ext-response', id, response } or { ..., id, error }
// The app side is libraries/helpers/src/utils/browser.extension.ts in the app repo.

declare const browser: {
  runtime: { sendMessage(message: unknown): Promise<unknown> };
};

const REQUEST = 'vgh-ext-request';
const RESPONSE = 'vgh-ext-response';

window.addEventListener('message', (event: MessageEvent) => {
  // Only this window's own page, never a frame or another origin.
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }
  let data: { type?: unknown; id?: unknown; message?: unknown };
  try {
    // Plain copy out of the page's compartment (Firefox Xray wrappers).
    data = JSON.parse(JSON.stringify(event.data ?? null)) ?? {};
  } catch {
    return;
  }
  if (
    data.type !== REQUEST ||
    typeof data.id !== 'string' ||
    !data.message ||
    typeof data.message !== 'object'
  ) {
    return;
  }
  const id = data.id;
  const reply = (body: Record<string, unknown>) =>
    window.postMessage({ type: RESPONSE, id, ...body }, window.location.origin);

  browser.runtime.sendMessage(data.message).then(
    (response) => reply({ response }),
    (err: unknown) =>
      reply({ error: err instanceof Error ? err.message : String(err) })
  );
});
