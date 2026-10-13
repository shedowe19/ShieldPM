/** @type {Set<() => Promise<void>>} */
const listeners = new Set();

/**
 * Subscribe only while the analytics service is running.
 * @param {() => Promise<void>} listener
 * @returns {() => void}
 */
export const subscribeProxyHostDomains = (listener) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

/**
 * Notify after a host graph write has committed, including imports and discovery.
 * Analytics failures must not undo a successful host change.
 * @returns {Promise<void>}
 */
export const notifyProxyHostDomainsChanged = async () => {
	await Promise.allSettled(Array.from(listeners, (listener) => Promise.resolve().then(listener)));
};
