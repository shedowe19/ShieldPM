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
const ASN_DATABASE_PATHS = ["/data/nginx/GeoLite2-ASN.mmdb", "/data/goaccess/geoip/GeoLite2-ASN.mmdb"];

const variableDefinitions = {
	$geoip2_country_code: {
		lookup: ["country", "iso_code"],
		safeDefault: (value) => !FIREWALL_COUNTRY_CODES.includes(value?.toUpperCase()),
	},
	$spm_geoip2_asn: {
		lookup: ["autonomous_system_number"],
		safeDefault: (value) => value === undefined || value === "" || value === "0",
	},
	$spm_geoip2_asn_org: {
		lookup: ["autonomous_system_organization"],
		safeDefault: (value) => value === undefined || value === "",
	},
};
const opaqueTables = new Set(["geo", "split_clients", "types", "upstream"]);
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

/** Only directive arguments that Nginx compiles as HTTP regexes can register capture-variable writers. */
const regexTokens = (directive, inMap) => {
	const [command] = directive;
	const prefixed = (values) => values.filter((value) => value?.startsWith("~"));
	if (inMap) return prefixed(directive.slice(0, 1));
	if (command === "server_name" || command === "valid_referers") return prefixed(directive.slice(1));
	if (command === "location" && ["~", "~*"].includes(directive[1])) return directive.slice(2, 3);
	if (command === "rewrite") return directive.slice(1, 2);
	if (command === "if") {
		const operator = directive.findIndex((value) => ["~", "~*", "!~", "!~*"].includes(value));
		return operator >= 0 ? directive.slice(operator + 1, operator + 2) : [];
	}
	if (["proxy_redirect", "proxy_cookie_domain", "proxy_cookie_path", "proxy_cookie_flags"].includes(command))
		return prefixed(directive.slice(1, 2));
	return [];
};

const namedCaptures = function* (pattern) {
	for (let index = 0; index < pattern.length; index++) {
		if (pattern[index] === "\\") {
			if (pattern[index + 1] === "Q") {
				const end = pattern.indexOf("\\E", index + 2);
				if (end < 0) return;
				index = end + 1;
			} else index++;
			continue;
		}
		if (pattern[index] === "[") {
			index++;
			if (pattern[index] === "^") index++;
			if (pattern[index] === "]") index++;
			for (; index < pattern.length; index++) {
				if (pattern[index] === "\\") index++;
				else if (pattern[index] === "[" && [":", ".", "="].includes(pattern[index + 1])) {
					const end = pattern.indexOf(`${pattern[index + 1]}]`, index + 2);
					if (end >= 0) index = end + 1;
				} else if (pattern[index] === "]") break;
			}
			continue;
		}
		if (pattern.startsWith("(?#", index)) {
			const end = pattern.indexOf(")", index + 3);
			if (end < 0) return;
			index = end;
			continue;
		}
		if (pattern[index] !== "(") continue;
		const match = /^\(\?(?:<([A-Za-z_][A-Za-z0-9_]*)>|'([A-Za-z_][A-Za-z0-9_]*)'|P<([A-Za-z_][A-Za-z0-9_]*)>)/.exec(
			pattern.slice(index),
		);
		if (match) {
			yield `$${(match[1] || match[2] || match[3]).toLowerCase()}`;
			index += match[0].length - 1;
		}
	}
};

const createInspection = () => {
	let moduleEnabled = false;
	let requiresCountry = false;
	let requiresAsn = false;
	const variables = Object.fromEntries(
		Object.keys(variableDefinitions).map((name) => [
			name,
			{ definitions: 0, otherWriters: 0, databasePath: null, block: null },
		]),
	);
	let relevantBytes = 0;
	const contexts = [];
	return {
		consume: ({ words: directive, boundary, lexer }) => {
			const inMap = contexts.at(-1)?.[0] === "map";
			if (contexts.length <= 2 && !inMap) {
				relevantBytes += directive.reduce((size, value) => size + Buffer.byteLength(value, "utf8"), 0);
				if (relevantBytes > 32 * 1024 * 1024)
					throw new errs.ValidationError("Nginx configuration inspection limit exceeded");
			}
			const http = contexts[0]?.[0] === "http";
			const command = directive[0];
			if (http && command === "map" && boundary === "{") {
				const source = directive[1]?.toLowerCase();
				const output = directive[2]?.toLowerCase();
				if (source === "$geoip2_country_code" && /^\$spm_fw_[1-9]\d*_country$/.test(output))
					requiresCountry = true;
				if (source === "$spm_geoip2_asn" && /^\$spm_fw_[1-9]\d*_asn_rule$/.test(output)) requiresAsn = true;
			}
			if (http && Object.hasOwn(writerArgument, command)) {
				const output = directive.at(writerArgument[command])?.toLowerCase();
				if (Object.hasOwn(variables, output)) variables[output].otherWriters++;
			}
			if (http) {
				for (const token of regexTokens(directive, inMap)) {
					for (const name of namedCaptures(token)) {
						if (Object.hasOwn(variables, name)) variables[name].otherWriters++;
					}
				}
			}
			if (boundary === "{") {
				if (opaqueTables.has(command) || command?.endsWith("_by_lua_block")) {
					lexer.skipBlock(command.endsWith("_by_lua_block"));
					return;
				}
				if (command === "map") lexer.inspectMap();
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
			const variableName = command?.toLowerCase();
			if (
				contexts.length === 2 &&
				http &&
				contexts[1][0] === "geoip2" &&
				Object.hasOwn(variableDefinitions, variableName)
			) {
				const variable = variables[variableName];
				const definition = variableDefinitions[variableName];
				variable.definitions++;
				const sources = directive.filter((value) => value.startsWith("source="));
				const defaults = directive.filter((value) => value.startsWith("default="));
				if (
					sources.length === 1 &&
					sources[0].toLowerCase() === "source=$remote_addr" &&
					defaults.length <= 1 &&
					definition.safeDefault(defaults[0]?.slice(8)) &&
					directive.slice(-definition.lookup.length).join(" ") === definition.lookup.join(" ")
				) {
					variable.databasePath = contexts[1][1] || null;
					variable.block = contexts[1];
				}
			}
		},
		finish: () => {
			if (contexts.length) throw new errs.ValidationError("Invalid Nginx configuration");
			const usable = (variable) =>
				variable.definitions === 1 && variable.otherWriters === 0 && variable.databasePath;
			const country = variables.$geoip2_country_code;
			const asn = variables.$spm_geoip2_asn;
			const organization = variables.$spm_geoip2_asn_org;
			return {
				moduleEnabled,
				requiresCountry,
				requiresAsn,
				databasePath: usable(country) || null,
				asnDatabasePath:
					usable(asn) && usable(organization) && asn.block === organization.block ? asn.databasePath : null,
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

const capabilityStatus = async (moduleEnabled, databasePath, fallbackPaths, missingVariableReason, fileSystem) => {
	const paths = databasePath ? [databasePath] : fallbackPaths;
	const databases = await Promise.all(paths.map((filename) => databaseExists(filename, fileSystem)));
	const databasePresent = databases.some(Boolean);
	const reason = !moduleEnabled
		? "module_disabled"
		: !databasePath
			? missingVariableReason
			: !databasePresent
				? "database_missing"
				: null;
	return { available: !reason, module_enabled: moduleEnabled, database_present: databasePresent, reason };
};

const unavailableConfiguration = () => ({
	available: false,
	module_enabled: false,
	database_present: false,
	reason: "configuration_unavailable",
});

const inspectEffectiveConfiguration = async (fileSystem, masterConfig) => {
	const inspection = createInspection();
	for await (const directive of readConfigurationDirectives(fileSystem, masterConfig)) inspection.consume(directive);
	return inspection.finish();
};

const statusForInspection = async (inspected, fileSystem) => {
	const [country, asn] = await Promise.all([
		capabilityStatus(
			inspected.moduleEnabled,
			inspected.databasePath,
			DATABASE_PATHS,
			"country_variable_missing",
			fileSystem,
		),
		capabilityStatus(
			inspected.moduleEnabled,
			inspected.asnDatabasePath,
			ASN_DATABASE_PATHS,
			"asn_variable_missing",
			fileSystem,
		),
	]);
	return { ...country, asn };
};

const assertCountryStatus = (status) => {
	if (!status.available) {
		throw new errs.ValidationError(
			`Country filtering requires an active Analytics GeoIP2 country database (${status.reason})`,
		);
	}
};

const assertAsnStatus = (status) => {
	if (!status.asn?.available) {
		throw new errs.ValidationError(
			`ASN filtering requires an active Analytics GeoIP2 ASN database (${status.asn?.reason ?? "configuration_unavailable"})`,
		);
	}
};

/** Report independent country/ASN readiness while keeping local paths and configuration private.
 * @param {{fileSystem?: typeof fs, masterConfig?: string}} [options]
 */
export const getFirewallGeoipStatus = async ({ fileSystem = fs, masterConfig = MASTER_CONFIG } = {}) => {
	let inspected;
	try {
		inspected = await inspectEffectiveConfiguration(fileSystem, masterConfig);
	} catch {
		return {
			...unavailableConfiguration(),
			asn: unavailableConfiguration(),
		};
	}
	return statusForInspection(inspected, fileSystem);
};

/** Reject active country policies before writing a host or producing a configuration. */
export const assertCountryFirewallAvailable = async (policy, suppliedStatus) => {
	if (!policy?.enabled || (!policy.country_denylist?.length && !policy.block_unknown_country)) return;
	const status = suppliedStatus ?? (await getFirewallGeoipStatus());
	assertCountryStatus(status);
};

/** Reject active ASN policies independently of country support, using the same visitor-IP lookup. */
export const assertAsnFirewallAvailable = async (policy, suppliedStatus) => {
	if (!policy?.enabled || !policy.asn_denylist?.length) return;
	const status = suppliedStatus ?? (await getFirewallGeoipStatus());
	assertAsnStatus(status);
};

/** Validate every required country/ASN lookup in the complete staged configuration before activating it. */
export const assertConfiguredFirewallLookups = async ({ fileSystem = fs, masterConfig = MASTER_CONFIG } = {}) => {
	let inspected;
	try {
		inspected = await inspectEffectiveConfiguration(fileSystem, masterConfig);
	} catch {
		throw new errs.ValidationError("Firewall lookup configuration cannot be inspected (configuration_unavailable)");
	}
	if (!inspected.requiresCountry && !inspected.requiresAsn) return;
	const status = await statusForInspection(inspected, fileSystem);
	if (inspected.requiresCountry) assertCountryStatus(status);
	if (inspected.requiresAsn) assertAsnStatus(status);
};
