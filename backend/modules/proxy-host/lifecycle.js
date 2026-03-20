import _ from "lodash";
import errs from "../../lib/error.js";
import proxyHostModel from "../../models/proxy_host.js";
import internalAuditLog from "../audit-log/service.js";
import internalGitDeploy from "../git-deploy/service.js";
import internalGitOps from "../gitops/service.js";
import { hostService } from "../../modules/host/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { cleanupOAuth2Proxy, omissions } from "./helpers.js";
import { get } from "./reads.js";

const remove = async (access, data) => {
	await access.can("proxy_hosts:delete", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	await proxyHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
	await nginxService.deleteConfig("proxy_host", row);
	await nginxService.reload();
	await internalAuditLog.add(access, { action: "deleted", object_type: "proxy-host", object_id: row.id, meta: _.omit(row, omissions()) });
	internalGitOps.triggerAutoPush("proxy-host");
	internalGitDeploy.stopPolling(data.id);
	await cleanupOAuth2Proxy(row.access_list_id);
	return true;
};

const enable = async (access, data) => {
	await access.can("proxy_hosts:update", data.id);
	const row = await get(access, { id: data.id, expand: ["certificate", "owner", "access_list", "host_domains"] });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	if (row.enabled) throw new errs.ValidationError("Host is already enabled");
	row.enabled = 1;
	await proxyHostModel.query().where("id", row.id).patch({ enabled: 1 });
	await nginxService.configure(proxyHostModel, "proxy_host", row);
	if (row.git_sync_enabled && row.git_repo_url) internalGitDeploy.startPollingForHost(row);
	await internalAuditLog.add(access, { action: "enabled", object_type: "proxy-host", object_id: row.id, meta: _.omit(row, omissions()) });
	return true;
};

const disable = async (access, data) => {
	await access.can("proxy_hosts:update", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	if (!row.enabled) throw new errs.ValidationError("Host is already disabled");
	row.enabled = 0;
	await proxyHostModel.query().where("id", row.id).patch({ enabled: 0 });
	await nginxService.deleteConfig("proxy_host", row);
	await nginxService.reload();
	internalGitDeploy.stopPolling(data.id);
	await internalAuditLog.add(access, { action: "disabled", object_type: "proxy-host", object_id: row.id, meta: _.omit(row, omissions()) });
	return true;
};

export { disable, enable, remove };
