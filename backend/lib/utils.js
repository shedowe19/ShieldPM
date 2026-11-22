import { execFile as nodeExecFile } from "node:child_process";
import fs from "node:fs";
import { isIP } from "node:net";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ipaddr from "ipaddr.js";
import { Liquid } from "liquidjs";
import _ from "lodash";
import { debug, global as logger } from "../logger.js";
import { getEnvironmentHash } from "./environment-hash.js";
import errs from "./error.js";
import { normalizeAddress } from "./firewall-addresses.js";

const nodeExecFilePromise = promisify(nodeExecFile);

/** Bounded execution per tool; a stuck helper must not hold the configuration lock forever. */
const COMMAND_TIMEOUTS = {
	nginx: 60_000,
	openssl: 30_000,
	certbot: 15 * 60_000,
	"certbot-ocsp-fetcher.sh": 5 * 60_000,
	pip: 10 * 60_000,
	chmod: 15_000,
};
const DEFAULT_EXEC_TIMEOUT = 60_000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PRIVATE_RANGES = new Set([
	"loopback",
	"private",
	"linkLocal",
	"uniqueLocal",
	"carrierGradeNat",
	"reserved",
	"broadcast",
	"multicast",
	"unspecified",
]);
const INTERNAL_HOST = /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa|metadata\.google\.internal)$/u;
const PUBLIC_HOSTNAME =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

/**
 * Validate a user-supplied authentication endpoint. This is an SSRF boundary:
 * Nginx, Lua and the OAuth2 sidecar must never be pointed at loopback, private,
 * link-local, metadata, `.local`, unix sockets or userinfo-bearing URLs.
 */
export const validatePublicHttpsUrl = (value, { label = "URL", allowPath = false } = {}) => {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: reject control bytes before Nginx/Lua output.
	if (typeof value !== "string" || !value || value.length > 2048 || /[\s\x00-\x1f\x7f;{}"'\\$#]/u.test(value)) {
		throw new errs.ValidationError(`${label} must be a public HTTPS URL without Nginx directives`);
	}
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new errs.ValidationError(`${label} must be a valid public HTTPS URL`);
	}
	if (url.protocol !== "https:") throw new errs.ValidationError(`${label} must use https://`);
	if (url.username || url.password) throw new errs.ValidationError(`${label} must not contain user information`);
	if (url.search || url.hash) throw new errs.ValidationError(`${label} must not contain a query or fragment`);
	if (!allowPath && url.pathname !== "/" && url.pathname !== "") {
		throw new errs.ValidationError(`${label} must be a bare origin without a path`);
	}
	if (url.pathname.split("/").includes(".."))
		throw new errs.ValidationError(`${label} must not contain '..' segments`);
	const hostname = url.hostname
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/u, "")
		.toLowerCase();
	if (!hostname || INTERNAL_HOST.test(hostname)) {
		throw new errs.ValidationError(`${label} must not point at localhost or an internal name`);
	}
	if (isIP(hostname)) {
		let range;
		try {
			const address = /** @type {any} */ (ipaddr.parse(hostname));
			range =
				address.kind() === "ipv6" && address.isIPv4MappedAddress()
					? address.toIPv4Address().range()
					: address.range();
		} catch {
			throw new errs.ValidationError(`${label} contains an invalid IP address`);
		}
		if (PRIVATE_RANGES.has(range)) {
			throw new errs.ValidationError(
				`${label} must not point at a loopback, link-local, private or metadata address`,
			);
		}
	} else if (!PUBLIC_HOSTNAME.test(hostname)) {
		throw new errs.ValidationError(`${label} must use a public fully-qualified hostname`);
	}
	return allowPath ? `${url.origin}${url.pathname}` : url.origin;
};

const writeHash = async () => {
	const hash = await getEnvironmentHash();
	const hashFile = `${process.env.DATA_PATH || "/data"}/shieldpm/env.sha512sum`;
	const hashDir = dirname(hashFile);
	if (!fs.existsSync(hashDir)) {
		await fs.promises.mkdir(hashDir, { recursive: true });
	}
	await fs.promises.writeFile(hashFile, hash);
};

/**
 * @param   {String} cmd
 * @param   {string[]}  args
 * @param   {import("node:child_process").ExecFileOptionsWithStringEncoding} [options]
 * @returns {Promise<string>}
 */
const execFile = async (cmd, args, options = {}) => {
	debug(logger, `CMD: ${cmd}`);

	try {
		const { stdout, stderr } = await nodeExecFilePromise(cmd, args, {
			maxBuffer: 16 * 1024 * 1024,
			killSignal: "SIGKILL",
			...options,
			timeout: options.timeout ?? COMMAND_TIMEOUTS[basename(cmd)] ?? DEFAULT_EXEC_TIMEOUT,
		});
		return (stdout + stderr).trim();
	} catch (err) {
		const output = `${err.stdout || ""}${err.stderr || ""}`.trim();
		const killed = err.killed && err.signal ? ` (terminated after timeout/${err.signal})` : "";
		throw new errs.CommandError(`${output || `Unable to execute ${cmd}`}${killed}`, err.code || 1, {
			code: err.code,
			signal: err.signal,
		});
	}
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRow = (omissions) => {
	/**
	 * @param   {Object} row
	 * @returns {Object}
	 */
	return (row) => {
		return _.omit(row, omissions);
	};
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRows = (omissions) => {
	/**
	 * @param   {Array} rows
	 * @returns {Object}
	 */
	return (rows) => {
		rows.forEach((row, idx) => {
			rows[idx] = _.omit(row, omissions);
		});
		return rows;
	};
};

/**
 * @returns {Object} Liquid render engine
 */
let cachedRenderEngine;

const getRenderEngine = () => {
	const development = process.env.NODE_ENV === "development";
	if (!development && cachedRenderEngine) return cachedRenderEngine;
	const renderEngine = new Liquid({
		root: `${__dirname}/../templates/`,
		cache: !development,
	});

	/**
	 * nginxAccessRule expects the object given to have 2 properties:
	 *
	 * directive  string
	 * address    string
	 */
	renderEngine.registerFilter("nginxAccessRule", (v) => {
		if (typeof v.directive !== "undefined" && typeof v.address !== "undefined" && v.directive && v.address) {
			let address = v.address;
			// Nginx evaluates mapped clients in its IPv4 access-rule table. Normalize
			// mapped rules too, including existing lists, while retaining native syntax.
			if (typeof address === "string" && isIP(address.split("/")[0]) === 6) {
				const parsed = ipaddr.parse(address.split("/")[0]);
				if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) address = normalizeAddress(address);
			}
			return `${v.directive} ${address};`;
		}
		return "";
	});

	// Lua decimal escapes preserve quotes, backslashes and control characters as data.
	const luaString = (value) =>
		`"${String(value ?? "").replace(
			// biome-ignore lint/suspicious/noControlCharactersInRegex: Escape control bytes instead of emitting them into Lua source.
			/[\\"\x00-\x1f\x7f]/g,
			(character) => `\\${String(character.charCodeAt(0)).padStart(3, "0")}`,
		)}"`;
	renderEngine.registerFilter("luaString", luaString);
	// Only a bare IPv6 literal needs URL brackets; retain every other upstream syntax.
	renderEngine.registerFilter("nginxUpstreamHost", (value) => (isIP(String(value)) === 6 ? `[${value}]` : value));
	// Authentik's outpost target is rendered only after the same SSRF validation
	// used at save time. Invalid legacy rows render as an empty origin.
	renderEngine.registerFilter("authentikOrigin", (value) => {
		try {
			return validatePublicHttpsUrl(value, { label: "Authentik host" });
		} catch {
			return "";
		}
	});
	// Leave headroom in ngx_http_lua's configuration-parser buffer: every token
	// is at most 1002 UTF-8 bytes after escaping. Never split a surrogate pair.
	renderEngine.registerFilter("luaPageString", (value) =>
		(String(value ?? "").match(/[\s\S]{1,250}/gu) || [""]).map(luaString).join(" ..\n            "),
	);

	if (!development) cachedRenderEngine = renderEngine;
	return renderEngine;
};

export default { writeHash, execFile, omitRow, omitRows, getRenderEngine, validatePublicHttpsUrl };
