import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import yaml from "js-yaml";
import { isDemoMode } from "../../lib/config.js";
import errs from "../../lib/error.js";
import { global as logger } from "../../logger.js";
import AccessList from "../../models/access_list.js";
import Certificate from "../../models/certificate.js";
import CloudflaredTunnel from "../../models/cloudflared_tunnel.js";
import DdnsProvider from "../../models/ddns_provider.js";
import DeadHost from "../../models/dead_host.js";
import ProxyHost from "../../models/proxy_host.js";
import RedirectionHost from "../../models/redirection_host.js";
import settingModel from "../../models/setting.js";
import Stream from "../../models/stream.js";
import User from "../../models/user.js";
import { nginxService } from "../../modules/nginx/index.js";
import { exportConfig } from "./exporter.js";
import { GITOPS_DIR, getAuth, getConfigInternal, getConfigDir, initRepo } from "./helpers.js";

const commitAndPush = async (message) => {
	if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
	const config = await getConfigInternal();
	if (!config.enabled) return { success: false, message: "GitOps is not enabled" };
	try {
		await initRepo();
		await git.add({ fs, dir: GITOPS_DIR, filepath: "." });
		const status = await git.statusMatrix({ fs, dir: GITOPS_DIR });
		const hasChanges = status.some(([, head, workdir, stage]) => head !== workdir || head !== stage);
		if (!hasChanges) return { success: true, message: "No changes to commit" };
		const sha = await git.commit({
			fs,
			dir: GITOPS_DIR,
			message: message || `ShieldPM configuration backup - ${new Date().toISOString()}`,
			author: { name: "ShieldPM GitOps", email: "gitops@shieldpm.local" },
		});
		const remotes = await git.listRemotes({ fs, dir: GITOPS_DIR });
		const hasOrigin = remotes.some((r) => r.remote === "origin");
		if (!hasOrigin && config.repository_url)
			await git.addRemote({ fs, dir: GITOPS_DIR, remote: "origin", url: config.repository_url });
		else if (hasOrigin && config.repository_url) {
			await git.deleteRemote({ fs, dir: GITOPS_DIR, remote: "origin" });
			await git.addRemote({ fs, dir: GITOPS_DIR, remote: "origin", url: config.repository_url });
		}
		if (config.repository_url)
			await git.push({
				fs,
				http,
				dir: GITOPS_DIR,
				remote: "origin",
				ref: config.branch || "main",
				...getAuth(config),
			});
		await settingModel
			.query()
			.where("id", "gitops-config")
			.patch({ meta: { ...config, last_sync: new Date().toISOString(), last_error: null } });
		logger.info(`GitOps: Committed and pushed ${sha}`);
		return { success: true, commit: sha };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : "Unknown error";
		logger.error("GitOps commit/push failed:", err);
		await settingModel
			.query()
			.where("id", "gitops-config")
			.patch({ meta: { ...config, last_error: errorMessage } });
		return { success: false, message: errorMessage };
	}
};

const pull = async () => {
	if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
	const config = await getConfigInternal();
	if (!config.enabled || !config.repository_url)
		return { success: false, message: "GitOps is not enabled or repository not configured" };
	try {
		await initRepo();
		const remotes = await git.listRemotes({ fs, dir: GITOPS_DIR });
		if (!remotes.some((r) => r.remote === "origin"))
			await git.addRemote({ fs, dir: GITOPS_DIR, remote: "origin", url: config.repository_url });
		await git.pull({
			fs,
			http,
			dir: GITOPS_DIR,
			ref: config.branch || "main",
			singleBranch: true,
			author: { name: "ShieldPM GitOps", email: "gitops@shieldpm.local" },
			...getAuth(config),
		});
		await settingModel
			.query()
			.where("id", "gitops-config")
			.patch({ meta: { ...config, last_sync: new Date().toISOString(), last_error: null } });
		logger.info("GitOps: Pulled from remote");
		return { success: true, message: "Pull successful" };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : "Unknown error";
		logger.error("GitOps pull failed:", err);
		return { success: false, message: errorMessage };
	}
};

const getHistory = async (limit = 20) => {
	try {
		await initRepo();
		const commits = await git.log({ fs, dir: GITOPS_DIR, depth: limit });
		return commits.map((commit) => ({
			sha: commit.oid,
			message: commit.commit.message,
			author: commit.commit.author.name,
			date: new Date(commit.commit.author.timestamp * 1000).toISOString(),
		}));
	} catch (err) {
		logger.debug("GitOps: Could not get history:", err);
		return [];
	}
};

const importConfig = async (access, options = {}) => {
	if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
	await access.can("settings:update", "gitops-config");
	const configDir = getConfigDir();
	let imported = 0;
	let skipped = 0;
	let deleted = 0;
	const errors = [];
	const importModel = async (modelClass, dirName, hostType = null, relationGraph = null) => {
		const dirPath = path.join(configDir, dirName);
		const importedIds = [];
		if (fs.existsSync(dirPath)) {
			const yamlFiles = (await fs.promises.readdir(dirPath)).filter((f) => f.endsWith(".yaml"));
			await Promise.all(
				yamlFiles.map(async (file) => {
					try {
						const data = yaml.load(await fs.promises.readFile(path.join(dirPath, file), "utf8"));
						if (data && typeof data === "object") {
							const itemData = data;
							const existingId = itemData.id;
							if (existingId) {
								importedIds.push(existingId);
								const existing = await modelClass.query().findById(existingId);
								if (existing && !options.overwrite) {
									skipped++;
									return;
								}
							}
							itemData.is_deleted = 0;
							if (options.overwrite && existingId) {
								if (relationGraph)
									await modelClass.query().upsertGraph(itemData, {
										insertMissing: true,
										relate: true,
										update: true,
										noDelete: false,
									});
								else {
									const existing = await modelClass.query().findById(existingId);
									if (existing) await modelClass.query().patchAndFetchById(existingId, itemData);
									else await modelClass.query().insert(itemData);
								}
							} else {
								if (!options.overwrite) delete itemData.id;
								if (!itemData.owner_user_id) itemData.owner_user_id = access.token.getUserId();
								const newRow = relationGraph
									? await modelClass.query().insertGraph(itemData)
									: await modelClass.query().insert(itemData);
								if (itemData.id) importedIds.push(itemData.id);
								else if (newRow?.id) importedIds.push(newRow.id);
							}
							imported++;
						}
					} catch (err) {
						logger.error(`Import failed for ${dirName}/${file}:`, err);
						errors.push(`${dirName}/${file}: ${err instanceof Error ? err.message : "Unknown error"}`);
					}
				}),
			);
		}
		if (options.overwrite) {
			try {
				const staleItems = await modelClass.query().whereNotIn("id", importedIds);
				await Promise.allSettled(
					staleItems.map(async (item) => {
						if (hostType) await nginxService.deleteConfig(hostType, item);
						if (item.is_deleted !== undefined)
							await modelClass.query().patchAndFetchById(item.id, { is_deleted: 1 });
						else await modelClass.query().deleteById(item.id);
						deleted++;
						logger.info(`GitOps Full Sync: Deleted ${dirName} #${item.id}`);
					}),
				);
			} catch (err) {
				logger.warn(`GitOps Cleanup failed for ${dirName}:`, err);
			}
		}
	};
	try {
		await importModel(User, "users", null, "permissions");
		await importModel(Certificate, "certificates");
		await importModel(AccessList, "access-lists", null, "[items, clients]");
		await importModel(ProxyHost, "proxy-hosts", "proxy_host");
		await importModel(RedirectionHost, "redirection-hosts", "redirection_host");
		await importModel(DeadHost, "dead-hosts", "dead_host");
		await importModel(Stream, "streams", "stream");
		await importModel(CloudflaredTunnel, "cloudflared-tunnels");
		await importModel(DdnsProvider, "ddns-providers");
		const settingsDir = path.join(configDir, "settings");
		if (fs.existsSync(settingsDir)) {
			const yamlFiles = (await fs.promises.readdir(settingsDir)).filter((f) => f.endsWith(".yaml"));
			await Promise.all(
				yamlFiles.map(async (file) => {
					try {
						const data = yaml.load(await fs.promises.readFile(path.join(settingsDir, file), "utf8"));
						if (data && typeof data === "object") {
							const settingData = data;
							if (settingData.id === "gitops-config") return;
							const existing = await settingModel.query().findById(settingData.id);
							if (existing) await settingModel.query().patchAndFetchById(settingData.id, settingData);
							else await settingModel.query().insert(settingData);
							imported++;
						}
					} catch (err) {
						errors.push(`settings/${file}: ${err instanceof Error ? err.message : "Unknown error"}`);
					}
				}),
			);
		}
		await nginxService.bulkGenerateConfigs(ProxyHost, "proxy_host", await ProxyHost.query().where("is_deleted", 0));
		await nginxService.bulkGenerateConfigs(
			RedirectionHost,
			"redirection_host",
			await RedirectionHost.query().where("is_deleted", 0),
		);
		await nginxService.bulkGenerateConfigs(DeadHost, "dead_host", await DeadHost.query().where("is_deleted", 0));
		await nginxService.bulkGenerateConfigs(Stream, "stream", await Stream.query().where("is_deleted", 0));
		await nginxService.reload();
		logger.info(
			`GitOps import: ${imported} imported, ${skipped} skipped, ${deleted} deleted, ${errors.length} errors`,
		);
		return { success: true, imported, skipped, deleted, errors };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : "Unknown error";
		logger.error("GitOps import failed:", err);
		return { success: false, imported, skipped, deleted, errors: [...errors, errorMessage] };
	}
};

const revertToCommit = async (access, sha) => {
	if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
	try {
		await initRepo();
		await git.checkout({ fs, dir: GITOPS_DIR, ref: sha, force: true });
		logger.info(`GitOps: Reverted to commit ${sha}`);
		const importResult = await importConfig(access, { overwrite: true });
		if (importResult.success) {
			setTimeout(() => {
				try {
					process.kill(1, "SIGTERM");
				} catch (e) {
					logger.error("Failed to kill PID 1:", e);
					process.exit(1);
				}
			}, 1000);
			return { success: true, message: `Reverted to ${sha}. Container will restart now.` };
		}
		return { success: false, message: `Reverted to ${sha} but import failed: ${importResult.errors.join(", ")}` };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : "Unknown error";
		logger.error("GitOps revert failed:", err);
		return { success: false, message: errorMessage };
	}
};

let autoPushTimer = null;
const triggerAutoPush = (changeType = "configuration") => {
	if (autoPushTimer) clearTimeout(autoPushTimer);
	autoPushTimer = setTimeout(async () => {
		try {
			const config = await getConfigInternal();
			if (!config.enabled || !config.auto_push || !config.repository_url) return;
			logger.info(`GitOps: Auto-push triggered by ${changeType} change`);
			await exportConfig();
			const result = await commitAndPush(`Auto-backup: ${changeType} changed`);
			if (result.success) logger.info(`GitOps: Auto-push completed: ${result.commit || result.message}`);
			else logger.warn(`GitOps: Auto-push failed: ${result.message}`);
		} catch (err) {
			logger.error("GitOps: Auto-push error:", err);
		}
	}, 5000);
};

const init = async () => {
	try {
		const config = await getConfigInternal();
		if (config.enabled && config.auto_pull_on_startup && config.repository_url) {
			logger.info("GitOps: Auto-pulling on startup...");
			await pull();
		}
	} catch (err) {
		logger.warn("GitOps: Failed to initialize:", err);
	}
};

export { autoPushTimer, commitAndPush, getHistory, importConfig, init, pull, revertToCommit, triggerAutoPush };
