import fs from "node:fs";
import bcrypt from "bcryptjs";
import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import { access as logger } from "../../logger.js";
import accessListModel from "../../models/access_list.js";
import accessListAuthModel from "../../models/access_list_auth.js";
import accessListClientModel from "../../models/access_list_client.js";
import now from "../../models/now_helper.js";
import proxyHostModel from "../../models/proxy_host.js";
import internalAuditLog from "../audit-log/service.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { oauth2ProxyService } from "../../modules/oauth2-proxy/index.js";
import { build, getFilename, maskItems, omissions } from "./helpers.js";
import { get } from "./reads.js";

const create = async (access, data) => {
	await access.can("access_lists:create", data);
	const row = await accessListModel.query().insertAndFetch({
		name: data.name,
		satisfy_any: data.satisfy_any,
		pass_auth: data.pass_auth,
		mtls_enabled: data.mtls_enabled || false,
		mtls_use_internal: data.mtls_use_internal || false,
		mtls_certificate: data.mtls_certificate || "",
		meta: data.meta,
		owner_user_id: access.token.getUserId(1),
	});
	const omittedRow = utils.omitRow(omissions())(row);
	data.id = omittedRow.id;
	const promises = [];
	const itemsPromises = data.items.map(async (item) => {
		let password = item.password;
		if (password && !password.startsWith("$2")) password = await bcrypt.hash(password, 13);
		return accessListAuthModel.query().insert({ access_list_id: omittedRow.id, username: item.username, password });
	});
	promises.push(...itemsPromises);
	data.clients?.map((client) => {
		promises.push(
			accessListClientModel
				.query()
				.insert({
					access_list_id: data.id,
					address: client.address,
					directive: client.directive,
					created_on: now(),
					modified_on: now(),
				}),
		);
		return true;
	});
	await Promise.all(promises);
	const freshRow = await get(
		access,
		{ id: data.id, expand: ["owner", "items", "clients", "proxy_hosts.access_list.[clients,items]"] },
		true,
	);
	data.meta = _.assign({}, data.meta || {}, freshRow.meta);
	await build(freshRow);
	if (Number.parseInt(freshRow.proxy_host_count, 10))
		await nginxService.bulkGenerateConfigs(proxyHostModel, "proxy_host", freshRow.proxy_hosts);
	if (freshRow.meta && freshRow.meta.auth_type === "oauth2_proxy") await oauth2ProxyService.start(freshRow);
	await internalAuditLog.add(access, {
		action: "created",
		object_type: "access-list",
		object_id: freshRow.id,
		meta: maskItems(data),
	});
	gitOpsService.triggerAutoPush("access-list");
	return maskItems(freshRow);
};

const update = async (access, data) => {
	await access.can("access_lists:update", data);
	const row = await get(access, { id: data.id });
	if (row.id !== data.id)
		throw new errs.InternalValidationError(
			`Access List could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
		);
	if (typeof data.name !== "undefined" && data.name) {
		logger.info(`[Update] Access List #${data.id} meta: ${JSON.stringify(data.meta)}`);
		await accessListModel
			.query()
			.where({ id: data.id })
			.patch({
				name: data.name,
				satisfy_any: data.satisfy_any,
				pass_auth: data.pass_auth,
				mtls_enabled: data.mtls_enabled,
				mtls_use_internal: data.mtls_use_internal,
				meta: data.meta,
			});
	}
	if (typeof data.items !== "undefined" && data.items) {
		const promises = [];
		const itemsToKeep = [];
		const itemPromises = data.items.map(async (item) => {
			if (item.password) {
				let finalPass = item.password;
				if (!finalPass.startsWith("$2")) finalPass = await bcrypt.hash(item.password, 13);
				return accessListAuthModel
					.query()
					.insert({ access_list_id: data.id, username: item.username, password: finalPass });
			}
			itemsToKeep.push(item.username);
			return null;
		});
		promises.push(...(await Promise.all(itemPromises)).filter(Boolean));
		const query = accessListAuthModel.query().delete().where("access_list_id", data.id);
		if (itemsToKeep.length) query.andWhere("username", "NOT IN", itemsToKeep);
		await query;
		if (promises.length) await Promise.all(promises);
	}
	if (typeof data.clients !== "undefined" && data.clients) {
		const clientPromises = [];
		data.clients.map((client) => {
			if (client.address) clientPromises.push(accessListClientModel.query().insert(client));
			return true;
		});
		await accessListClientModel.query().delete().where("access_list_id", data.id);
		if (clientPromises.length) await Promise.all(clientPromises);
	}
	await internalAuditLog.add(access, {
		action: "updated",
		object_type: "access-list",
		object_id: data.id,
		meta: maskItems(data),
	});
	const freshRow = await get(
		access,
		{ id: data.id, expand: ["owner", "items", "clients", "proxy_hosts.[certificate,access_list.[clients,items]]"] },
		true,
	);
	logger.info(`[Update Result] Access List #${data.id} fresh meta: ${JSON.stringify(freshRow.meta)}`);
	await build(freshRow);
	if (Number.parseInt(freshRow.proxy_host_count, 10))
		await nginxService.bulkGenerateConfigs(proxyHostModel, "proxy_host", freshRow.proxy_hosts);
	if (freshRow.meta && freshRow.meta.auth_type === "oauth2_proxy") await oauth2ProxyService.restart(freshRow);
	else await oauth2ProxyService.stop(freshRow.id);
	await nginxService.reload();
	gitOpsService.triggerAutoPush("access-list");
	return maskItems(freshRow);
};

const remove = async (access, data) => {
	await access.can("access_lists:delete", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
	await accessListModel.query().where("id", row.id).patch({ is_deleted: 1 });
	if (row.proxy_hosts) {
		await proxyHostModel.query().where("access_list_id", "=", row.id).patch({ access_list_id: 0 });
		row.proxy_hosts.map((_val, idx) => {
			row.proxy_hosts[idx].access_list_id = 0;
			return true;
		});
		await nginxService.bulkGenerateConfigs(proxyHostModel, "proxy_host", row.proxy_hosts);
	}
	await nginxService.reload();
	try {
		await fs.promises.unlink(getFilename(row));
	} catch {}
	await oauth2ProxyService.stop(row.id);
	await internalAuditLog.add(access, {
		action: "deleted",
		object_type: "access-list",
		object_id: row.id,
		meta: _.omit(maskItems(row), ["is_deleted", "proxy_hosts"]),
	});
	gitOpsService.triggerAutoPush("access-list");
	return true;
};

export { create, remove, update };
