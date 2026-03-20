import { isDemoMode } from "../../lib/config.js";
import errs from "../../lib/error.js";
import { global as logger } from "../../logger.js";
import ProxyHost from "../../models/proxy_host.js";
import { encrypt } from "./helpers.js";
import { startPollingForHost, stopPolling } from "./polling.js";
import { getStatus } from "./sync.js";

const updateConfig = async (access, hostId, data) => {
	if (isDemoMode()) throw new errs.AuthError("Git Deploy is disabled in Demo Mode");
	await access.can("proxy_hosts:update", hostId);
	const host = await ProxyHost.query().findById(hostId);
	if (!host) throw new errs.ItemNotFoundError(hostId);
	if (host.forward_scheme !== "path")
		throw new errs.ValidationError("Git Deploy is only available for path-based proxy hosts");
	const updateData = {};
	if (data.git_repo_url !== undefined) updateData.git_repo_url = data.git_repo_url || null;
	if (data.git_branch !== undefined) updateData.git_branch = data.git_branch || "main";
	if (data.git_sync_enabled !== undefined) updateData.git_sync_enabled = data.git_sync_enabled;
	if (data.git_poll_interval !== undefined) updateData.git_poll_interval = Math.max(10, data.git_poll_interval);
	if (data.git_poll_unit !== undefined && ["s", "m", "h"].includes(data.git_poll_unit))
		updateData.git_poll_unit = data.git_poll_unit;
	if (data.git_credentials) updateData.git_credentials = encrypt(data.git_credentials);
	else if (data.git_credentials === "") updateData.git_credentials = null;
	await ProxyHost.query().findById(hostId).patch(updateData);
	if (
		updateData.git_sync_enabled !== undefined ||
		updateData.git_poll_interval !== undefined ||
		updateData.git_poll_unit !== undefined
	) {
		const updatedHost = await ProxyHost.query().findById(hostId);
		if (updatedHost.git_sync_enabled && updatedHost.git_repo_url) startPollingForHost(updatedHost);
		else stopPolling(hostId);
	}
	logger.info(`[git-deploy] Config updated for host ${hostId}`);
	return getStatus(access, hostId);
};

export { updateConfig };
