export const retiredHostMetadataFields = ["wasm_filters", "wasmFilters", "wasm_status", "wasmStatus"];

const decode = (value) => {
	let result = value;
	for (let depth = 0; depth < 2 && typeof result === "string"; depth++) {
		if (result.length > 16 * 1024 * 1024) throw new TypeError("Host metadata exceeds the migration bound");
		result = JSON.parse(result);
	}
	return result;
};

/** Legacy imports may serialize metadata twice; unknown root shapes must never become public hosts. */
export const readRetiredHostMetadata = (value) => {
	if (value === undefined || value === null) return {};
	let result;
	try {
		result = decode(value);
	} catch {
		throw new TypeError("Host metadata requires review before removed request filters can be migrated");
	}
	if (!result || typeof result !== "object" || Array.isArray(result))
		throw new TypeError("Host metadata requires review before removed request filters can be migrated");
	return result;
};

const activeBindings = (value) => {
	if (value === undefined || value === null) return false;
	let filters;
	try {
		filters = decode(value);
	} catch {
		return true;
	}
	if (!Array.isArray(filters)) return true;
	return filters.some(
		(filter) =>
			!filter ||
			typeof filter !== "object" ||
			Array.isArray(filter) ||
			!Object.hasOwn(filter, "enabled") ||
			Boolean(filter.enabled),
	);
};

/** Ambiguous binding shapes remain disabled until an administrator reviews the removed policy. */
export const hasActiveRetiredHostBindings = (value) => {
	const meta = readRetiredHostMetadata(value);
	return [meta.wasm_filters, meta.wasmFilters].some(activeBindings);
};

/** Removing an active request policy must never silently expose its former upstream. */
export const retireHostRuntime = (host) => {
	const active = hasActiveRetiredHostBindings(host.meta);
	const previous = readRetiredHostMetadata(host.meta);
	const meta = Object.fromEntries(
		Object.entries(previous).filter(([name]) => !retiredHostMetadataFields.includes(name)),
	);
	return active ? { ...host, enabled: 0, meta: { ...meta, nginx_online: false } } : { ...host, meta };
};
