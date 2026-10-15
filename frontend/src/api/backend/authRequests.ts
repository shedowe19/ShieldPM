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
	expires: number | string | null;
	userId?: number;
	impersonating: boolean;
}

export function synchronizeAuthIdentity() {
	try {
		const stored = window.localStorage.getItem(sharedIdentityKey);
		if (!stored || stored === lastIdentity) return;
		const identity = JSON.parse(stored) as SharedIdentity;
		if (typeof identity.revision !== "string" || typeof identity.impersonating !== "boolean") return;
		lastIdentity = stored;
		identityRevision += 1;
		if (identity.expires === null) AuthStore.clear();
		else if (typeof identity.expires === "number" || typeof identity.expires === "string") {
			AuthStore.add(
				{ expires: identity.expires, user: identity.userId ? { id: identity.userId } : undefined },
				identity.impersonating,
			);
		} else return;
		window.dispatchEvent(new Event(AUTHENTICATION_CHANGED_EVENT));
	} catch {
		// Storage may be disabled; the in-tab queue and Web Lock remain usable.
	}
}
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key === sharedIdentityKey) synchronizeAuthIdentity();
	});
}
function publishIdentity(endpoint: string, response: unknown) {
	const result =
		response && typeof response === "object"
			? (response as { expires?: number | string | null; user?: { id?: number } })
			: undefined;
	if (endpoint !== "tokens/logout" && !result?.expires) return;
	const identity: SharedIdentity = {
		revision: `${Date.now()}:${Math.random()}`,
		expires: endpoint === "tokens/logout" ? null : (result?.expires ?? null),
		userId: result?.user?.id,
		impersonating: /^users\/\d+\/login$/.test(endpoint),
	};
	const serialized = JSON.stringify(identity);
	try {
		window.localStorage.setItem(sharedIdentityKey, serialized);
		lastIdentity = serialized;
	} catch {
		/* In-memory operation remains available. */
	}
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
