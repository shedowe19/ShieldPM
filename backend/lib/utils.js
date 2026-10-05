import { execFile as nodeExecFile } from "node:child_process";
import fs from "node:fs";
import { isIP } from "node:net";
import { dirname } from "node:path";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
		const { stdout, stderr } = await nodeExecFilePromise(cmd, args, options);
		return (stdout + stderr).trim();
	} catch (err) {
		const output = `${err.stdout || ""}${err.stderr || ""}`.trim();
		throw new errs.CommandError(output || `Unable to execute ${cmd}`, err.code || 1, {
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
	// Leave headroom in ngx_http_lua's configuration-parser buffer: every token
	// is at most 1002 UTF-8 bytes after escaping. Never split a surrogate pair.
	renderEngine.registerFilter("luaPageString", (value) =>
		(String(value ?? "").match(/[\s\S]{1,250}/gu) || [""]).map(luaString).join(" ..\n            "),
	);

	if (!development) cachedRenderEngine = renderEngine;
	return renderEngine;
};

export default { writeHash, execFile, omitRow, omitRows, getRenderEngine };
