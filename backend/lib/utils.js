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
	const files = await fs.promises.readdir(`${__dirname}/../templates`);
	const envVarsPromises = files.map(async (file) => {
		const content = await fs.promises.readFile(`${__dirname}/../templates/${file}`, "utf8");
		const matches = content.match(/env\.[A-Z0-9_]+/g) || [];
		return matches.map((match) => match.replace("env.", ""));
	});
	const envVarsArrays = await Promise.all(envVarsPromises);
	const envVars = envVarsArrays.flat();

	const uniqueEnvVars =
		[...new Set(envVars)]
			.sort()
			.map((varName) => process.env[varName])
			.join("") + process.env.TV;
	const hash = crypto.createHash("sha512").update(uniqueEnvVars).digest("hex");
	await fs.promises.writeFile("/data/shieldpm/env.sha512sum", hash);
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
