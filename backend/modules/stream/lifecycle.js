import _ from "lodash";
import errs from "../../lib/error.js";
import streamModel from "../../models/stream.js";
import internalAuditLog from "../audit-log/service.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { omissions } from "./helpers.js";
import { get } from "./reads.js";

const remove = async (access, data) => {
	await access.can("streams:delete", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	await streamModel.query().where("id", row.id).patch({ is_deleted: 1 });
	await nginxService.deleteConfig("stream", row);
	await nginxService.reload();
	await internalAuditLog.add(access, {
		action: "deleted",
		object_type: "stream",
		object_id: row.id,
		meta: _.omit(row, omissions()),
	});
	gitOpsService.triggerAutoPush("stream");
	return true;
};

const enable = async (access, data) => {
	await access.can("streams:update", data.id);
	const row = await get(access, { id: data.id, expand: ["certificate", "owner"] });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	if (row.enabled) throw new errs.ValidationError("Stream is already enabled");
	row.enabled = 1;
	await streamModel.query().where("id", row.id).patch({ enabled: 1 });
	await nginxService.configure(streamModel, "stream", row);
	await internalAuditLog.add(access, {
		action: "enabled",
		object_type: "stream",
		object_id: row.id,
		meta: _.omit(row, omissions()),
	});
	return true;
};

const disable = async (access, data) => {
	await access.can("streams:update", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	if (!row.enabled) throw new errs.ValidationError("Stream is already disabled");
	row.enabled = 0;
	await streamModel.query().where("id", row.id).patch({ enabled: 0 });
	await nginxService.deleteConfig("stream", row);
	await nginxService.reload();
	await internalAuditLog.add(access, {
		action: "disabled",
		object_type: "stream",
		object_id: row.id,
		meta: _.omit(row, omissions()),
	});
	return true;
};

export { disable, enable, remove };
