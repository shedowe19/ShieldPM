import { redactWasmFilters, validateWasmFilters } from "../internal/wasm.js";
import { decrypt } from "./encryption.js";
import errs from "./error.js";
import { validateHostTrafficPolicy } from "./host-traffic-policy.js";

/** Only for server-encrypted revision snapshots, never request bodies or GitOps imports. */
export function validateTrustedHostPolicies(candidate, previous) {
	// A complete historical snapshot replaces metadata; absent policies must not be resurrected.
	validateHostTrafficPolicy(candidate, { ...previous, meta: {} });
	const filters = candidate.meta?.wasm_filters;
	if (filters === undefined) return;
	validateWasmFilters(redactWasmFilters(filters));
	for (const filter of filters) {
		if (filter.kind === "module") {
			try {
				validateWasmFilters([
					{
						...filter,
						config: {
							module_id: filter.config.module_id,
							configuration: JSON.parse(decrypt(filter.config.sealed_configuration)),
						},
					},
				]);
			} catch {
				throw new errs.ValidationError("The revision contains an unavailable Wasm module configuration");
			}
			continue;
		}
		if (!filter.enabled || filter.kind !== "api_key") continue;
		try {
			if (!decrypt(filter.config.sealed_value)) throw new TypeError("Empty key");
		} catch {
			throw new errs.ValidationError("The revision contains an unavailable Wasm credential");
		}
	}
}
