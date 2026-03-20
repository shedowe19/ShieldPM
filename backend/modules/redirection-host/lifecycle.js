import _ from "lodash";
import errs from "../../lib/error.js";
import redirectionHostModel from "../../models/redirection_host.js";
import internalAuditLog from "../../internal/audit-log.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { omissions } from "./helpers.js";
import { get } from "./reads.js";

const remove = async (access, data) => {
	await access.can("redirection_hosts:delete", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	await redirectionHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
	await nginxService.deleteConfig("redirection_host", row);
	await nginxService.reload();
	await internalAuditLog.add(access, { action: "deleted", object_type: "redirection-host", object_id: row.id, meta: _.omit(row, omissions()) });
	gitOpsService.triggerAutoPush("redirection-host");
	return true;
};

const enable = async (access, data) => {
	await access.can("redirection_hosts:update", data.id);
	const row = await get(access, { id: data.id, expand: ["certificate", "owner"] });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	if (row.enabled) throw new errs.ValidationError("Host is already enabled");
	row.enabled = 1;
	await redirectionHostModel.query().where("id", row.id).patch({ enabled: 1 });
	await nginxService.configure(redirectionHostModel, "redirection_host", row);
	await internalAuditLog.add(access, { action: "enabled", object_type: "redirection-host", object_id: row.id, meta: _.omit(row, omissions()) });
	return true;
};

const disable = async (access, data) => {
	await access.can("redirection_hosts:update", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	if (!row.enabled) throw new errs.ValidationError("Host is already disabled");
	row.enabled = 0;
	await redirectionHostModel.query().where("id", row.id).patch({ enabled: 0 });
	await nginxService.deleteConfig("redirection_host", row);
	await nginxService.reload();
	await internalAuditLog.add(access, { action: "disabled", object_type: "redirection-host", object_id: row.id, meta: _.omit(row, omissions()) });
	return true;
};

export { disable, enable, remove };
