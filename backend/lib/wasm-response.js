/** Redact API keys from API responses, audits, previews and revision metadata. */
export function redactWasmFilters(filters = []) {
	return filters.map((filter) => {
		const clean = structuredClone(filter);
		if (clean.kind === "api_key") {
			clean.config.has_secret = Boolean(clean.config.sealed_value || clean.config.value);
			delete clean.config.value;
			delete clean.config.sealed_value;
		}
		if (clean.kind === "module") {
			clean.config.has_configuration = Boolean(clean.config.sealed_configuration || clean.config.configuration);
			delete clean.config.configuration;
			delete clean.config.sealed_configuration;
		}
		return clean;
	});
}
