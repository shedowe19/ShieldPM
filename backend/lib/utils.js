import { execFile as nodeExecFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Liquid } from "liquidjs";
import _ from "lodash";
import { debug, global as logger } from "../logger.js";
import errs from "./error.js";

const nodeExecFilePromise = promisify(nodeExecFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const writeHash = async () => {
	const templatesDir = `${__dirname}/../templates`;
	const files = await fs.promises.readdir(templatesDir);
	const envVars = (
		await Promise.all(
			files.map(async (file) => {
				const content = await fs.promises.readFile(`${templatesDir}/${file}`, "utf8");
				const matches = content.match(/env\.[A-Z0-9_]+/g) || [];
				return matches.map((match) => match.replace("env.", ""));
			}),
		)
	).flat();

	const uniqueEnvVars =
		[...new Set(envVars)]
			.sort()
			.map((varName) => process.env[varName])
			.join("") + process.env.TV;
	const hash = crypto.createHash("sha512").update(uniqueEnvVars).digest("hex");

	const hashFile = "/data/shieldpm/env.sha512sum";
	const hashDir = dirname(hashFile);
	if (!fs.existsSync(hashDir)) {
		await fs.promises.mkdir(hashDir, { recursive: true });
	}
	await fs.promises.writeFile(hashFile, hash);
};

/**
 * @param   {String} cmd
 * @param   {Array}  args
 * @returns {Promise<string>}
 */
const execFile = async (cmd, args) => {
	debug(logger, `CMD: ${cmd} ${args ? args.join(" ") : ""}`);

	try {
		const { stdout, stderr } = await nodeExecFilePromise(cmd, args);
		return (stdout + stderr).trim();
	} catch (err) {
		throw new errs.CommandError((err.stdout + err.stderr).trim(), 1, err);
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
const getRenderEngine = () => {
	const renderEngine = new Liquid({
		root: `${__dirname}/../templates/`,
		cache: process.env.NODE_ENV !== "development",
	});

	/**
	 * nginxAccessRule expects the object given to have 2 properties:
	 *
	 * directive  string
	 * address    string
	 */
	renderEngine.registerFilter("nginxAccessRule", (v) => {
		if (typeof v.directive !== "undefined" && typeof v.address !== "undefined" && v.directive && v.address) {
			return `${v.directive} ${v.address};`;
		}
		return "";
	});

	return renderEngine;
};

export default { writeHash, execFile, omitRow, omitRows, getRenderEngine };
