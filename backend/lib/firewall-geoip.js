import fs from "node:fs/promises";
import errs from "./error.js";
import { FIREWALL_COUNTRY_CODES } from "./firewall-policy.js";

const MASTER_CONFIG = "/usr/local/nginx/conf/nginx.conf";
const DATABASE_PATHS = [
	"/data/nginx/GeoLite2-Country.mmdb",
	"/data/nginx/GeoLite2-City.mmdb",
	"/data/goaccess/geoip/GeoLite2-Country.mmdb",
	"/data/goaccess/geoip/GeoLite2-City.mmdb",
];

// Keep quoted values and comments opaque so text in maps cannot advertise a nonexistent country variable.
const configurationTokens = (configuration) => {
	const tokens = [];
	let word = "";
	let quote = "";
	const flush = () => {
		if (word) tokens.push({ value: word, boundary: false });
		word = "";
	};
	for (let index = 0; index < configuration.length; index++) {
		const char = configuration[index];
		if (char === "\\" && index + 1 < configuration.length) {
			word += configuration[++index];
			continue;
		}
		if (quote) {
			if (char === quote) quote = "";
			else word += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === "#") {
			flush();
			while (index < configuration.length && configuration[index] !== "\n") index++;
			continue;
		}
		if (/\s/.test(char)) {
			flush();
			continue;
		}
		if (char === "{" && word.endsWith("$")) {
			const end = configuration.indexOf("}", index + 1);
			if (end < 0) throw new errs.ValidationError("Invalid Nginx configuration");
			word += configuration.slice(index, end + 1);
			index = end;
			continue;
		}
		if ("{};".includes(char)) {
			flush();
			tokens.push({ value: char, boundary: true });
			continue;
		}
		word += char;
	}
	if (quote) throw new errs.ValidationError("Invalid Nginx configuration");
	flush();
	return tokens;
};

/** Inspect the existing Analytics country variable in HTTP scope, without exposing configuration content. */
export const inspectGeoipConfiguration = (configuration) => {
	let moduleEnabled = false;
	let databasePath = null;
	let countryDefinitions = 0;
	const contexts = [];
	let directive = [];
	for (const token of configurationTokens(configuration)) {
		if (!token.boundary) {
			directive.push(token.value);
			continue;
		}
		if (token.value === "{") {
			if (contexts.length === 1 && contexts[0][0] === "http" && directive[0] === "geoip2") moduleEnabled = true;
			contexts.push(directive);
			directive = [];
			continue;
		}
		if (token.value === "}") {
			if (!contexts.length || directive.length) throw new errs.ValidationError("Invalid Nginx configuration");
			contexts.pop();
			directive = [];
			continue;
		}
		if (
			!contexts.length &&
			directive[0] === "load_module" &&
			directive[1]?.split("/").at(-1) === "ngx_http_geoip2_module.so"
		)
			moduleEnabled = true;
		if (
			contexts.length === 2 &&
			contexts[0][0] === "http" &&
			contexts[1][0] === "geoip2" &&
			directive[0] === "$geoip2_country_code"
		) {
			countryDefinitions++;
			const sources = directive.filter((value) => value.startsWith("source="));
			const defaults = directive.filter((value) => value.startsWith("default="));
			const safeDefault =
				defaults.length <= 1 && !FIREWALL_COUNTRY_CODES.includes(defaults[0]?.slice(8).toUpperCase());
			if (
				sources.length === 1 &&
				sources[0] === "source=$remote_addr" &&
				safeDefault &&
				directive.slice(-2).join(" ") === "country iso_code"
			)
				databasePath = contexts[1][1] || null;
		}
		directive = [];
	}
	if (contexts.length || directive.length) throw new errs.ValidationError("Invalid Nginx configuration");
	// GeoIP2 allows redefining its variables, so an earlier safe definition is insufficient.
	return { moduleEnabled, databasePath: countryDefinitions === 1 ? databasePath : null };
};

const databaseExists = async (path, fileSystem) => {
	try {
		const stat = await fileSystem.stat(path);
		return stat.isFile() && stat.size > 0;
	} catch {
		return false;
	}
};

/** Report country-filter readiness while keeping local paths and configuration private.
 * @param {{fileSystem?: typeof fs, masterConfig?: string}} [options]
 */
export const getFirewallGeoipStatus = async ({ fileSystem = fs, masterConfig = MASTER_CONFIG } = {}) => {
	let inspected;
	try {
		inspected = inspectGeoipConfiguration(await fileSystem.readFile(masterConfig, "utf8"));
	} catch {
		return {
			available: false,
			module_enabled: false,
			database_present: false,
			reason: "configuration_unavailable",
		};
	}
	const paths = inspected.databasePath ? [inspected.databasePath] : DATABASE_PATHS;
	const databases = await Promise.all(paths.map((path) => databaseExists(path, fileSystem)));
	const databasePresent = databases.some(Boolean);
	const reason = !inspected.moduleEnabled
		? "module_disabled"
		: !inspected.databasePath
			? "country_variable_missing"
			: !databasePresent
				? "database_missing"
				: null;
	return { available: !reason, module_enabled: inspected.moduleEnabled, database_present: databasePresent, reason };
};

/** Reject active country policies before writing a host or producing a configuration. */
export const assertCountryFirewallAvailable = async (policy) => {
	if (!policy?.enabled || (!policy.country_denylist?.length && !policy.block_unknown_country)) return;
	const status = await getFirewallGeoipStatus();
	if (!status.available) {
		throw new errs.ValidationError(
			`Country filtering requires an active Analytics GeoIP2 country database (${status.reason})`,
		);
	}
};
