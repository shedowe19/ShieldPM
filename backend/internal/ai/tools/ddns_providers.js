import internalDdnsProvider from "../../ddns-provider.js";
import { isDemoMode } from "../../../lib/config.js";

// Helper to reuse validation if needed, but we'll import it or redefine it if simple.
// Since `validateDemoModeHost` is in executor.js, we can't easily import it without circular dependency if executor imports tools.
// We will export a validator from executor or a shared util, or redefine simple checks.
// For now, let's assume we can export validation logic to a shared place or just keep it simple.
// Actually, let's assume `executor.js` handles the top-level demo check for tools, but for specific args...
// We'll reimplement simple validation or move `validateDemoModeHost` to `backend/lib/validator/demo.js` later.
// For now, minimal checks here.

const validateUrl = (url) => {
	if (isDemoMode() && url) {
		const forbidden = ["localhost", "127.0.0.1", "192.168.", "10."];
		if (forbidden.some((f) => url.includes(f))) {
			throw new Error("Local IPs are disabled in Demo Mode");
		}
	}
};

export const get_ddns_providers = async (access, args) => {
	const providers = await internalDdnsProvider.getAll(access);
	return JSON.stringify(
		providers.map((p) => ({
			id: p.id,
			name: p.name,
			provider: p.provider,
			domains: p.domains,
			last_updated: p.last_updated_on,
			status: p.last_error ? "Error" : "OK",
		})),
	);
};

export const create_ddns_provider = async (access, args) => {
	if (args.provider === "custom") {
		validateUrl(args.config?.url);
	}
	const provider = await internalDdnsProvider.create(access, {
		ip_ver: "dual",
		enabled: true,
		...args,
	});
	return `Created DDNS Provider ID: ${provider.id}`;
};

export const update_ddns_provider = async (access, args) => {
	if (args.provider === "custom") {
		validateUrl(args.config?.url);
	}
	await internalDdnsProvider.update(access, { id: args.id, ...args });
	return `Updated DDNS Provider ID: ${args.id}`;
};

export const delete_ddns_provider = async (access, args) => {
	await internalDdnsProvider.delete(args.id, access.token.getUserId(1));
	return `Deleted DDNS Provider ID: ${args.id}`;
};

export const test_ddns_provider = async (access, args) => {
	const testRel = await internalDdnsProvider.test(access, { id: args.id });
	return `Test Result: ${testRel.status}. IPs: ${JSON.stringify(testRel.ips)}`;
};
