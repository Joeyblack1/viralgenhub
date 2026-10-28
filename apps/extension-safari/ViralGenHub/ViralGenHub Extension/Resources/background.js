//#endregion
//#region src/providers/provider.registry.ts
var providers = [{
	identifier: "skool",
	name: "Skool",
	url: "https://www.skool.com",
	hostPermission: "*://*.skool.com/*",
	cookies: [{
		name: "client_id",
		required: true
	}, {
		name: "auth_token",
		required: true
	}]
}];
var providerMap = new Map(providers.map((p) => [p.identifier, p]));
function getAllProviders() {
	return providers;
}
function getProvider(identifier) {
	return providerMap.get(identifier);
}
//#endregion
//#region src/background.ts
var ext = globalThis.browser ?? chrome;
var EXTENSION_VERSION = ext.runtime.getManifest().version;
var REFRESH_ALARM_NAME = "cookie-refresh";
var STORAGE_KEY = "refreshEntries";
function originOf(value) {
	if (!value) return "";
	try {
		return new URL(value).origin;
	} catch {
		return "";
	}
}
function isOriginAllowed(origin) {
	return ["https://app.viralgenhub.com"].includes(originOf(origin));
}
function siteAccessHint() {
	return "Safari > Settings > Extensions > ViralGenHub > Edit Websites: allow skool.com and app.viralgenhub.com";
}
async function extractCookies(provider) {
	const allCookies = await ext.cookies.getAll({ url: provider.url });
	const extracted = {};
	const missingRequired = [];
	for (const def of provider.cookies) {
		const found = allCookies.find((c) => c.name === def.name);
		if (found) extracted[def.name] = found.value;
		else if (def.required) missingRequired.push(def.name);
	}
	if (missingRequired.length > 0) return {
		success: false,
		provider: provider.identifier,
		error: `Could not read your ${provider.name} sign-in (${missingRequired.join(", ")}). Sign in to ${provider.name} in this browser, and check the ViralGenHub extension is allowed on ${provider.name} (${siteAccessHint()}).`,
		missingCookies: missingRequired
	};
	return {
		success: true,
		provider: provider.identifier,
		cookies: extracted
	};
}
async function getStoredEntries() {
	return (await ext.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
}
async function setStoredEntries(entries) {
	await ext.storage.local.set({ [STORAGE_KEY]: entries });
}
async function ensureAlarm() {
	if (!await ext.alarms.get(REFRESH_ALARM_NAME)) ext.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: 1440 });
}
async function clearAlarmIfEmpty() {
	const entries = await getStoredEntries();
	if (Object.keys(entries).length === 0) await ext.alarms.clear(REFRESH_ALARM_NAME);
}
async function refreshAllCookies() {
	const entries = await getStoredEntries();
	for (const [integrationId, entry] of Object.entries(entries)) try {
		const provider = getProvider(entry.provider);
		if (!provider) continue;
		const cookieResult = await extractCookies(provider);
		if (!cookieResult.success) continue;
		const base64Cookies = btoa(JSON.stringify(cookieResult.cookies));
		await fetch(`${entry.backendUrl}/integrations/extension-refresh`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jwt: entry.jwt,
				cookies: base64Cookies
			})
		});
	} catch {}
}
ext.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === REFRESH_ALARM_NAME) refreshAllCookies();
});
(async () => {
	const entries = await getStoredEntries();
	if (Object.keys(entries).length > 0) await ensureAlarm();
})();
function handleMessage(message, origin, sendResponse) {
	if (!isOriginAllowed(origin)) {
		sendResponse({ error: "Unauthorized origin" });
		return true;
	}
	switch (message?.type) {
		case "PING":
			sendResponse({
				status: "ok",
				version: EXTENSION_VERSION
			});
			break;
		case "GET_PROVIDERS":
			sendResponse({ providers: getAllProviders().map((p) => ({
				identifier: p.identifier,
				name: p.name,
				url: p.url,
				cookieNames: p.cookies.map((c) => c.name)
			})) });
			break;
		case "GET_COOKIES": {
			const provider = getProvider(message.provider);
			if (!provider) {
				sendResponse({
					success: false,
					provider: message.provider,
					error: `Unknown provider: ${message.provider}`
				});
				break;
			}
			extractCookies(provider).then((result) => sendResponse(result)).catch((err) => sendResponse({
				success: false,
				provider: message.provider,
				error: `Failed to extract cookies: ${err.message}`
			}));
			return true;
		}
		case "STORE_REFRESH_TOKEN": {
			let backendOrigin = "";
			try {
				backendOrigin = new URL(message.backendUrl).origin;
			} catch {}
			if (!["https://app.viralgenhub.com"].includes(backendOrigin)) {
				sendResponse({
					success: false,
					error: "Untrusted backend URL"
				});
				break;
			}
			(async () => {
				const entries = await getStoredEntries();
				entries[message.integrationId] = {
					jwt: message.jwt,
					backendUrl: message.backendUrl,
					provider: message.provider
				};
				await setStoredEntries(entries);
				await ensureAlarm();
				sendResponse({ success: true });
			})().catch(() => sendResponse({ success: false }));
			return true;
		}
		case "REMOVE_REFRESH_TOKEN":
			(async () => {
				const entries = await getStoredEntries();
				delete entries[message.integrationId];
				await setStoredEntries(entries);
				await clearAlarmIfEmpty();
				sendResponse({ success: true });
			})().catch(() => sendResponse({ success: false }));
			return true;
		default: sendResponse({ error: `Unknown message type: ${message?.type}` });
	}
	return true;
}
ext.runtime.onMessageExternal.addListener((message, sender, sendResponse) => handleMessage(message, sender.origin ?? sender.url, sendResponse));
//#endregion
