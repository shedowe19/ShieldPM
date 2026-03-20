import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { isDemoMode } from "../../lib/config.js";
import { decrypt, encrypt } from "../../lib/encryption.js";
import errs from "../../lib/error.js";
import { global as logger } from "../../logger.js";
import settingModel from "../../models/setting.js";

const GITOPS_DIR = "/data/gitops";
const CONFIG_SUBDIR = "shieldpm-config";

const ensureDir = async () => {
	if (!fs.existsSync(GITOPS_DIR)) {
		await fs.promises.mkdir(GITOPS_DIR, { recursive: true });
	}
};

const getConfigDir = () => path.join(GITOPS_DIR, CONFIG_SUBDIR);

const getAuth = (config) => {
	if (!config.encrypted_credentials) return {};
	try {
		const credentials = decrypt(config.encrypted_credentials);
		return {
			onAuth: () => ({ username: "git", password: credentials }),
		};
	} catch (err) {
		logger.error("Failed to decrypt GitOps credentials:", err);
		return {};
	}
};

const getConfig = async () => {
	const setting = await settingModel.query().where("id", "gitops-config").first();
	if (!setting) throw new errs.ItemNotFoundError("gitops-config");
	const config = setting.meta;
	return { ...config, encrypted_credentials: config.encrypted_credentials ? "[REDACTED]" : "" };
};

const getConfigInternal = async () => {
	const setting = await settingModel.query().where("id", "gitops-config").first();
	if (!setting) throw new errs.ItemNotFoundError("gitops-config");
	return setting.meta;
};

const updateConfig = async (access, data) => {
	if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
	await access.can("settings:update", "gitops-config");
	const currentSetting = await settingModel.query().where("id", "gitops-config").first();
	if (!currentSetting) throw new errs.ItemNotFoundError("gitops-config");
	const currentConfig = currentSetting.meta;
	const newConfig = { ...currentConfig };
	if (data.enabled !== undefined) newConfig.enabled = data.enabled;
	if (data.repository_url !== undefined) newConfig.repository_url = data.repository_url;
	if (data.branch !== undefined) newConfig.branch = data.branch;
	if (data.auth_type !== undefined) newConfig.auth_type = data.auth_type;
	if (data.auto_push !== undefined) newConfig.auto_push = data.auto_push;
	if (data.auto_pull_on_startup !== undefined) newConfig.auto_pull_on_startup = data.auto_pull_on_startup;
	if (data.credentials) newConfig.encrypted_credentials = encrypt(data.credentials);
	await settingModel.query().where("id", "gitops-config").patch({ value: newConfig.enabled ? "enabled" : "disabled", meta: newConfig });
	logger.info("GitOps configuration updated");
	return getConfig();
};

const initRepo = async () => {
	await ensureDir();
	const configDir = getConfigDir();
	if (!fs.existsSync(configDir)) await fs.promises.mkdir(configDir, { recursive: true });
	const gitDir = path.join(GITOPS_DIR, ".git");
	if (!fs.existsSync(gitDir)) {
		await git.init({ fs, dir: GITOPS_DIR, defaultBranch: "main" });
		logger.info("Initialized local GitOps repository");
	}
};

const testConnection = async () => {
	if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
	const config = await getConfigInternal();
	if (!config.repository_url) return { success: false, message: "Repository URL not configured" };
	try {
		await initRepo();
		const info = await git.getRemoteInfo({ http, url: config.repository_url, ...getAuth(config) });
		let isPublic = false;
		try {
			await git.getRemoteInfo({ http, url: config.repository_url });
			isPublic = true;
		} catch {}
		const result = { success: true, message: `Connected successfully. Default branch: ${info.HEAD || "unknown"}` };
		if (isPublic) result.warning = "WARNING: This repository appears to be PUBLIC! Please use a PRIVATE repository.";
		return result;
	} catch (err) {
		logger.error("GitOps connection test failed:", err);
		return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
	}
};

export { CONFIG_SUBDIR, GITOPS_DIR, ensureDir, getAuth, getConfig, getConfigDir, getConfigInternal, initRepo, testConnection, updateConfig };
