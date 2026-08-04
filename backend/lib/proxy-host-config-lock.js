/**
 * Serializes Nginx configuration mutations for one proxy host.
 * This is intentionally separate from firewall-policy locks: a host can be
 * re-rendered by independent subsystems that do not otherwise share a policy.
 */
const locks = new Map();

const withProxyHostConfigLock = async (hostId, operation) => {
	const id = Number(hostId);
	if (!Number.isInteger(id) || id < 1) return await operation();

	const previous = locks.get(id) || Promise.resolve();
	let release;
	const current = new Promise((resolve) => {
		release = resolve;
	});
	const tail = previous.then(
		() => current,
		() => current,
	);
	locks.set(id, tail);
	await previous.catch(() => undefined);
	try {
		return await operation();
	} finally {
		release();
		if (locks.get(id) === tail) locks.delete(id);
	}
};

export { withProxyHostConfigLock };
