let updates = Promise.resolve();

/** Serialize related CA and profile edits without acquiring the Certbot operation lock.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
export const withAcmeSettingsLock = (operation) => {
	const result = updates.then(operation);
	updates = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
};
