import _ from "lodash";
import errs from "../../lib/error.js";
import deadHostModel from "../../models/dead_host.js";
import internalAuditLog from "../audit-log/service.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { omissions } from "./helpers.js";
import { get } from "./reads.js";

const remove = async (access, data) => {
	const thisData = data;
	await access.can("dead_hosts:delete", thisData.id);
	const row = await get(access, { id: thisData.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(thisData.id);
	await deadHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
	await nginxService.deleteConfig("dead_host", row);
	await nginxService.reload();
	await internalAuditLog.add(access, {
		action: "deleted",
		object_type: "dead-host",
		object_id: row.id,
		meta: _.omit(row, omissions()),
	});
	gitOpsService.triggerAutoPush("dead-host");
	return true;
};

const enable = async (access, data) => {
	const thisData = data;
	await access.can("dead_hosts:update", thisData.id);
	const row = await get(access, { id: thisData.id, expand: ["certificate", "owner"] });
	if (!row || !row.id) throw new errs.ItemNotFoundError(thisData.id);
	if (row.enabled) throw new errs.ValidationError("Host is already enabled");
	row.enabled = 1;
	await deadHostModel.query().where("id", row.id).patch({ enabled: 1 });
	await nginxService.configure(deadHostModel, "dead_host", row);
	await internalAuditLog.add(access, {
		action: "enabled",
		object_type: "dead-host",
		object_id: row.id,
		meta: _.omit(row, omissions()),
	});
	return true;
};

const disable = async (access, data) => {
	const thisData = data;
	await access.can("dead_hosts:update", thisData.id);
	const row = await get(access, { id: thisData.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(thisData.id);
	if (!row.enabled) throw new errs.ValidationError("Host is already disabled");
	row.enabled = 0;
	await deadHostModel.query().where("id", row.id).patch({ enabled: 0 });
	await nginxService.deleteConfig("dead_host", row);
	await nginxService.reload();
	await internalAuditLog.add(access, {
		action: "disabled",
		object_type: "dead-host",
		object_id: row.id,
		meta: _.omit(row, omissions()),
	});
	return true;
};

export { disable, enable, remove };
