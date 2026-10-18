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
		if (clean.kind === "application") {
			clean.config.has_settings = Boolean(clean.config.sealed_settings || clean.config.settings);
			delete clean.config.settings;
			delete clean.config.sealed_settings;
		}
		return clean;
	});
}
