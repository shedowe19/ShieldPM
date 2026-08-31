#!/usr/bin/env node

import { createVerifiedSqliteBackup, restoreVerifiedSqliteBackup } from "../lib/sqlite-backup.js";

const readArguments = (args) => {
	const options = { mode: "backup" };
	const takeValue = (index, option) => {
		const value = args[index + 1];
		if (typeof value === "undefined" || value === "" || value.startsWith("--")) {
			throw new Error(`${option} requires a value`);
		}
		return value;
	};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--source") {
			options.source = takeValue(index, argument);
			index += 1;
		} else if (argument === "--destination-directory") {
			options.destinationDirectory = takeValue(index, argument);
			index += 1;
		} else if (argument === "--retention") {
			const retention = takeValue(index, argument);
			if (!/^[1-9]\d*$/.test(retention)) throw new Error("--retention must be a positive integer");
			options.retention = Number(retention);
			index += 1;
		} else if (argument === "--restore") {
			options.mode = "restore";
			options.backup = takeValue(index, argument);
			index += 1;
		} else if (argument === "--destination") {
			options.destination = takeValue(index, argument);
			index += 1;
		} else throw new Error(`Unknown or incomplete option: ${argument}`);
	}
	return options;
};

try {
	const options = readArguments(process.argv.slice(2));
	const result =
		options.mode === "restore"
			? await restoreVerifiedSqliteBackup({ backup: options.backup, destination: options.destination })
			: await createVerifiedSqliteBackup(options);
	process.stdout.write(`${result}\n`);
} catch (error) {
	process.stderr.write(`SQLite backup error: ${error.message}\n`);
	process.exitCode = 1;
}
