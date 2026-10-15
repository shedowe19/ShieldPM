import AuthStore, { AUTHENTICATION_CHANGED_EVENT } from "src/modules/AuthStore";

// Browsers apply Set-Cookie before fetch resolves. Keep the entire response in
// order, including failures, rather than merely rejecting stale JavaScript data.
let pending: Promise<unknown> | undefined;
let identityChanges = 0;
let identityRevision = 0;
const sharedIdentityKey = "shieldpm:cookie-identity";
let lastIdentity: string | null = null;
interface SharedIdentity {
	revision: string;
	sequence: number;
	expires: number | string | null;
	userId?: number;
	impersonating: boolean;
}

let lastSequence = 0;
let lastRevision = "";
let lastStorageIdentity: string | null = null;
let identityChannel: BroadcastChannel | undefined;
function applyIdentity(serialized: string, currentResponse = false) {
	if (!currentResponse && serialized === lastIdentity) return;
	try {
		const identity = JSON.parse(serialized) as SharedIdentity;
		if (
			typeof identity.revision !== "string" ||
			typeof identity.impersonating !== "boolean" ||
			!Number.isSafeInteger(identity.sequence) ||
			identity.sequence < 1
		)
			return;
		if (
			!currentResponse &&
			(identity.sequence < lastSequence ||
				(identity.sequence === lastSequence && identity.revision <= lastRevision))
		)
			return;
		const expires = typeof identity.expires === "string" ? Date.parse(identity.expires) : identity.expires;
		if (expires !== null && (typeof expires !== "number" || !Number.isFinite(expires))) return;
		lastIdentity = serialized;
		lastSequence = identity.sequence;
		lastRevision = identity.revision;
		identityRevision += 1;
		if (expires === null || expires <= Date.now()) AuthStore.clear();
		else
			AuthStore.add(
				{ expires, user: identity.userId ? { id: identity.userId } : undefined },
				identity.impersonating,
			);
		window.dispatchEvent(new Event(AUTHENTICATION_CHANGED_EVENT));
	} catch {
		/* Ignore malformed browser synchronization metadata. */
	}
}
export function synchronizeAuthIdentity() {
	try {
		const stored = window.localStorage.getItem(sharedIdentityKey);
		if (!stored || stored === lastStorageIdentity) return;
		lastStorageIdentity = stored;
		applyIdentity(stored);
	} catch {
		/* Browser storage can be unavailable. */
	}
}
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key === sharedIdentityKey) synchronizeAuthIdentity();
	});
	try {
		if (window.BroadcastChannel) {
			identityChannel = new window.BroadcastChannel("shieldpm:authentication");
			identityChannel.onmessage = (event: MessageEvent<unknown>) => {
				if (typeof event.data !== "string") return;
				let serialized = event.data;
				try {
					const stored = window.localStorage.getItem(sharedIdentityKey);
					if (stored && JSON.parse(stored).sequence >= JSON.parse(serialized).sequence) serialized = stored;
				} catch {
					/* Channel metadata remains available when storage is blocked. */
				}
				applyIdentity(serialized);
			};
		}
	} catch {
		/* Keep the in-tab queue when browser tab messaging is disabled. */
	}
}

function publishIdentity(endpoint: string, response: unknown) {
	const result =
		response && typeof response === "object"
			? (response as { expires?: number | string | null; user?: { id?: number } })
			: undefined;
	if (endpoint !== "tokens/logout" && !result?.expires) return;
	const identity: SharedIdentity = {
		revision: `${Date.now()}:${Math.random()}`,
		sequence: lastSequence + 1,
		expires: endpoint === "tokens/logout" ? null : (result?.expires ?? null),
		userId: result?.user?.id,
		impersonating: /^users\/\d+\/login$/.test(endpoint),
	};
	const serialized = JSON.stringify(identity);
	try {
		window.localStorage.setItem(sharedIdentityKey, serialized);
		lastStorageIdentity = serialized;
	} catch {
		/* In-memory operation remains available. */
	}
	try {
		identityChannel?.postMessage(serialized);
	} catch {
		/* Metadata cannot fail a completed login. */
	}
	lastIdentity = serialized;
	lastSequence = identity.sequence;
	lastRevision = identity.revision;
	// Let the caller finish its login/2FA/OIDC navigation before reconciling.
	// If a cross-tab update invalidated that caller, its response still changed
	// the cookie: recover only when no newer state or response consumed it.
	const responseRevision = AuthStore.sessionRevision;
	if (typeof identity.userId === "number")
		setTimeout(() => {
			if (lastIdentity === serialized && AuthStore.sessionRevision === responseRevision)
				applyIdentity(serialized, true);
		}, 0);
}

export function serializeAuthRequest<T>(url: string, operation: () => Promise<T>): Promise<T> {
	const endpoint = url.replace(/^\/|\/$/g, "");
	if (!/^(?:tokens(?:\/.*)?|oidc\/claim|users\/\d+\/login)$/.test(endpoint)) return operation();
	const isRefresh = endpoint === "tokens/refresh";
	const revision = identityRevision;
	if (isRefresh && identityChanges) return Promise.reject(new Error("Authentication is changing"));
	if (!isRefresh) {
		identityChanges += 1;
		identityRevision += 1;
	}
	const execute = async () => {
		synchronizeAuthIdentity();
		if (isRefresh && (revision !== identityRevision || AuthStore.isImpersonating))
			throw new Error("Authentication changed before refresh");
		const result = await operation();
		if (!isRefresh) publishIdentity(endpoint, result);
		return result;
	};
	const run = () => {
		let started = false;
		try {
			if (navigator.locks?.request) {
				return navigator.locks
					.request("shieldpm:authentication", { mode: "exclusive" }, () => {
						started = true;
						return execute();
					})
					.catch((error) => {
						// Retry lock acquisition failures, never an already dispatched request.
						if (started) throw error;
						return execute();
					});
			}
		} catch {
			// Access to browser capabilities can itself be denied.
		}
		return execute();
	};
	const request = pending ? pending.then(run, run) : run();
	const tracked = request.finally(() => {
		if (!isRefresh) identityChanges -= 1;
		if (pending === tracked) pending = undefined;
	});
	pending = tracked;
	return tracked;
}
