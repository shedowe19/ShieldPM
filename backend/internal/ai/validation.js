import { isDemoMode } from "../../lib/config.js";

/**
 * Validates a host configuration for Demo Mode restrictions.
 * Blocks private IPs, localhost, and advanced configurations.
 *
 * @param {Object} host - The host object (proxy, redirection, stream)
 * @throws {Error} - If the configuration violates Demo Mode rules
 */
export const validateDemoModeHost = (host) => {
	if (!isDemoMode()) return;

	// Check advanced config
	if (host.advanced_config && host.advanced_config.trim().length > 0) {
		throw new Error("Advanced Config is disabled in Demo Mode.");
	}

	// Check forward host for private IPs
	// Support different field names across models
	const target = host.forward_host || host.forward_domain || host.forward_domain_name || host.forwarding_host;

	if (target) {
		const privateIPs = [
			/^127\./,
			/^10\./,
			/^192\.168\./,
			/^172\.(1[6-9]|2[0-9]|3[0-1])\./,
			/^localhost$/i,
			/^::1$/,
		];

		for (const regex of privateIPs) {
			if (regex.test(target)) {
				throw new Error("Private IPs and Localhost are disabled in Demo Mode.");
			}
		}
	}
};
