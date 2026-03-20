import _ from "lodash";
import errs from "../../lib/error.js";
import DdnsProvider from "../../models/ddns_provider.js";
import internalAuditLog from "../../internal/audit-log.js";
import { ddnsService } from "../../modules/ddns/index.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import { get } from "./reads.js";

const create = async (access, data) => {
	const thisData = _.cloneDeep(data);
	thisData.owner_user_id = access.token.getUserId(1);
	const row = await DdnsProvider.query().insertAndFetch(thisData);
	await internalAuditLog.add(access, { action: "created", object_type: "ddns-provider", object_id: row.id, meta: row });
	ddnsService.process(true);
	gitOpsService.triggerAutoPush("ddns-provider");
	return row;
};

const update = async (access, data) => {
	const existing = await get(access, { id: data.id });
	if (!existing) throw new errs.ItemNotFoundError(data.id);
	const thisData = _.cloneDeep(data);
	await DdnsProvider.query().patchAndFetchById(thisData.id, thisData);
	const row = await get(access, { id: thisData.id });
	await internalAuditLog.add(access, { action: "updated", object_type: "ddns-provider", object_id: row.id, meta: row });
	ddnsService.process(true);
	gitOpsService.triggerAutoPush("ddns-provider");
	return row;
};

const remove = async (access, data) => {
	const provider = await DdnsProvider.query().findById(data.id);
	if (!provider) throw new errs.NotFoundError("DDNS Provider not found");
	await DdnsProvider.query().deleteById(data.id);
	await internalAuditLog.add(access, { action: "deleted", object_type: "ddns-provider", object_id: data.id, meta: { name: provider.name } });
	gitOpsService.triggerAutoPush("ddns-provider");
	return true;
};

const test = async (access, data) => {
	const row = await get(access, { id: data.id });
	const ips = await ddnsService.getWanIps();
	try {
		await ddnsService.updateProvider(row, ips);
		return { status: "success", ips };
	} catch (e) {
		throw new Error(e.message);
	}
};

export { create, remove, test, update };
