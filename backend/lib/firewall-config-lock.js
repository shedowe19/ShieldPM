/**
 * Serializes read-render-write operations for the shared Nginx firewall map.
 * Policy-local locks protect cache and row mutations; this lock protects the
 * single generated file that represents every policy at once.
 */
let tail = Promise.resolve();

const withFirewallConfigLock = async (operation) => {
	const previous = tail;
	let release;
	const current = new Promise((resolve) => {
		release = resolve;
	});
	const queued = previous.then(
		() => current,
		() => current,
	);
	tail = queued;
	await previous.catch(() => undefined);
	try {
		return await operation();
	} finally {
		release();
		if (tail === queued) tail = Promise.resolve();
	}
};

export { withFirewallConfigLock };
