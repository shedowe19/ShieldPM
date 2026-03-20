import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { isDemoMode } from "../../lib/config.js";
import errs from "../../lib/error.js";
import { global as logger } from "../../logger.js";
import ProxyHost from "../../models/proxy_host.js";
import { nginxService } from "../../modules/nginx/index.js";
import { getAuth, getWebsiteDir } from "./helpers.js";

const sync = async (access, hostId) => {
	if (access) await access.can("proxy_hosts:update", hostId);
	if (isDemoMode()) throw new errs.AuthError("Git Deploy is disabled in Demo Mode");
	const host = await ProxyHost.query().findById(hostId);
	if (!host) throw new errs.ItemNotFoundError(hostId);
	if (host.forward_scheme !== "path") throw new errs.ValidationError("Git Deploy is only available for path-based proxy hosts");
	if (!host.git_repo_url) throw new errs.ValidationError("Git repository URL not configured");
	const dir = getWebsiteDir(hostId);
	const gitDir = path.join(dir, ".git");
	try {
		let repoExists = fs.existsSync(gitDir);
		if (repoExists) {
			const currentBranch = await git.currentBranch({ fs, dir });
			const targetBranch = host.git_branch || "main";
			if (currentBranch !== targetBranch) {
				fs.rmSync(dir, { recursive: true, force: true });
				fs.mkdirSync(dir, { recursive: true });
				repoExists = false;
			}
		}
		if (fs.existsSync(gitDir)) {
			await git.pull({ fs, http, dir, ref: host.git_branch || "main", singleBranch: true, author: { name: "ShieldPM GitDeploy", email: "gitdeploy@shieldpm.local" }, ...getAuth(host.git_credentials) });
		} else {
			await git.clone({ fs, http, dir, url: host.git_repo_url, ref: host.git_branch || "main", singleBranch: true, depth: 1, ...getAuth(host.git_credentials) });
		}
		const commits = await git.log({ fs, dir, depth: 1 });
		const latestCommit = commits[0]?.oid || null;
		await ProxyHost.query().findById(hostId).patch({ git_last_sync: dayjs().format("YYYY-MM-DD HH:mm:ss"), git_last_commit: latestCommit, git_last_error: null });
		if (host.forward_host !== dir) {
			await ProxyHost.query().findById(hostId).patch({ forward_host: dir });
			const updatedHost = await ProxyHost.query().findById(hostId).withGraphFetched("access_list");
			await nginxService.configure(ProxyHost, "proxy_host", updatedHost);
		}
		logger.info(`[git-deploy] Sync complete for host ${hostId}, commit: ${latestCommit}`);
		return { success: true, commit: latestCommit };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : "Unknown error";
		logger.error(`[git-deploy] Sync failed for host ${hostId}:`, err);
		await ProxyHost.query().findById(hostId).patch({ git_last_error: errorMessage });
		return { success: false, message: errorMessage };
	}
};

const getStatus = async (access, hostId) => {
	if (access) await access.can("proxy_hosts:get", hostId);
	const host = await ProxyHost.query().findById(hostId);
	if (!host) throw new errs.ItemNotFoundError(hostId);
	return host;
};

export { getStatus, sync };
