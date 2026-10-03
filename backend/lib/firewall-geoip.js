import fs from "node:fs/promises";
import path from "node:path";
import errs from "./error.js";
import { ConfigurationLexer, readConfigurationDirectives } from "./firewall-geoip-config.js";
import { FIREWALL_COUNTRY_CODES } from "./firewall-policy.js";

const MASTER_CONFIG = "/usr/local/nginx/conf/nginx.conf";
const DATABASE_PATHS = [
	"/data/nginx/GeoLite2-Country.mmdb",
	"/data/nginx/GeoLite2-City.mmdb",
	"/data/goaccess/geoip/GeoLite2-Country.mmdb",
	"/data/goaccess/geoip/GeoLite2-City.mmdb",
];

const isCountryVariable = (value) => value?.toLowerCase() === "$geoip2_country_code";
const opaqueTables = new Set(["map", "geo", "split_clients", "types", "upstream"]);
const writerArgument = {
	map: 2,
	geo: -1,
	split_clients: 2,
	set: 1,
	auth_request_set: 1,
	set_by_lua: 1,
	set_by_lua_block: 1,
	set_by_lua_file: 1,
	perl_set: 1,
	js_set: 1,
	js_var: 1,
};

const createInspection = () => {
	let moduleEnabled = false;
	let databasePath = null;
	let countryDefinitions = 0;
	let otherWriters = 0;
	let relevantBytes = 0;
	const contexts = [];
	return {
		consume: ({ words: directive, boundary, lexer }) => {
			if (contexts.length <= 2) {
				relevantBytes += directive.reduce((size, value) => size + Buffer.byteLength(value, "utf8"), 0);
				if (relevantBytes > 32 * 1024 * 1024)
					throw new errs.ValidationError("Nginx configuration inspection limit exceeded");
			}
			const http = contexts[0]?.[0] === "http";
			const command = directive[0];
			if (
				http &&
				Object.hasOwn(writerArgument, command) &&
				isCountryVariable(directive.at(writerArgument[command]))
			) {
				otherWriters++;
			}
			if (boundary === "{") {
				if (opaqueTables.has(command) || command?.endsWith("_by_lua_block")) {
					lexer.skipBlock(command.endsWith("_by_lua_block"));
					return;
				}
				if (contexts.length === 1 && http && command === "geoip2") moduleEnabled = true;
				contexts.push(directive);
				return;
			}
			if (boundary === "}") {
				if (!contexts.length || directive.length) throw new errs.ValidationError("Invalid Nginx configuration");
				contexts.pop();
				return;
			}
			if (
				!contexts.length &&
				command === "load_module" &&
				directive[1]?.split("/").at(-1) === "ngx_http_geoip2_module.so"
			) {
				moduleEnabled = true;
			}
			if (contexts.length === 2 && http && contexts[1][0] === "geoip2" && isCountryVariable(command)) {
				countryDefinitions++;
				const sources = directive.filter((value) => value.startsWith("source="));
				const defaults = directive.filter((value) => value.startsWith("default="));
				const safeDefault =
					defaults.length <= 1 && !FIREWALL_COUNTRY_CODES.includes(defaults[0]?.slice(8).toUpperCase());
				if (
					sources.length === 1 &&
					sources[0].toLowerCase() === "source=$remote_addr" &&
					safeDefault &&
					directive.slice(-2).join(" ") === "country iso_code"
				) {
					databasePath = contexts[1][1] || null;
				}
			}
		},
		finish: () => {
			if (contexts.length) throw new errs.ValidationError("Invalid Nginx configuration");
			return {
				moduleEnabled,
				databasePath: countryDefinitions === 1 && otherWriters === 0 ? databasePath : null,
			};
		},
	};
};

/** Inspect inline configuration; status checks additionally expand files in their actual include contexts. */
export const inspectGeoipConfiguration = (configuration) => {
	const inspection = createInspection();
	const lexer = new ConfigurationLexer();
	for (const directive of lexer.feed(configuration)) inspection.consume(directive);
	lexer.finish();
	return inspection.finish();
};

const databaseExists = async (filename, fileSystem) => {
	// GeoIP2 resolves relative MMDB paths against Nginx's runtime prefix, never the backend CWD.
	if (!path.isAbsolute(filename)) return false;
	try {
		const stat = await fileSystem.stat(filename);
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
		const inspection = createInspection();
		for await (const directive of readConfigurationDirectives(fileSystem, masterConfig))
			inspection.consume(directive);
		inspected = inspection.finish();
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
