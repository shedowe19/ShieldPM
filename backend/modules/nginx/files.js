import fs from "node:fs";
import { debug, nginx as logger } from "../../logger.js";
import { getConfigName, getFileFriendlyHostType } from "./helpers.js";

const deleteFile = async (filename) => {
	try {
		await fs.promises.access(filename);
	} catch {
		return;
	}
	try {
		debug(logger, `Deleting file: ${filename}`);
		await fs.promises.unlink(filename);
	} catch (err) {
		debug(logger, "Could not delete file:", JSON.stringify(err, null, 2));
	}
};

const deleteConfig = async (hostType, host) => {
	const configFile = getConfigName(getFileFriendlyHostType(hostType), typeof host === "undefined" ? 0 : host.id);
	await deleteFile(configFile);
	await deleteFile(`${configFile}.err`);
};

const renameConfigAsError = async (hostType, host) => {
	const configFile = getConfigName(getFileFriendlyHostType(hostType), typeof host === "undefined" ? 0 : host.id);
	try {
		await fs.promises.rename(configFile, `${configFile}.err`);
	} catch {}
};

const backupConfig = async (hostType, host) => {
	const configFile = getConfigName(getFileFriendlyHostType(hostType), host.id);
	const backupFile = `${configFile}.bak`;
	try {
		await fs.promises.copyFile(configFile, backupFile);
		debug(logger, `Backed up config: ${configFile} -> ${backupFile}`);
	} catch (err) {
		if (err.code !== "ENOENT") {
			logger.error(`Failed to backup config: ${err.message}`);
		}
	}
};

const restoreConfig = async (hostType, host) => {
	const configFile = getConfigName(getFileFriendlyHostType(hostType), host.id);
	const backupFile = `${configFile}.bak`;
	try {
		await fs.promises.rename(backupFile, configFile);
		debug(logger, `Restored config: ${backupFile} -> ${configFile}`);
	} catch (err) {
		if (err.code !== "ENOENT") {
			logger.error(`Failed to restore config: ${err.message}`);
		}
	}
};

const deleteBackupConfig = async (hostType, host) => {
	const configFile = getConfigName(getFileFriendlyHostType(hostType), host.id);
	const backupFile = `${configFile}.bak`;
	await deleteFile(backupFile);
};

export { backupConfig, deleteBackupConfig, deleteConfig, deleteFile, renameConfigAsError, restoreConfig };
