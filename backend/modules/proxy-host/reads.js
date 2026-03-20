import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import proxyHostModel from "../../models/proxy_host.js";
import { hostService } from "../../modules/host/index.js";
import { omissions } from "./helpers.js";

const get = async (access, data) => {
	const thisData = data || {};
	const accessData = await access.can("proxy_hosts:get", thisData.id);
	const query = proxyHostModel
		.query()
		.where("is_deleted", 0)
		.andWhere("id", thisData.id)
		.allowGraph("[owner,access_list.[clients,items],certificate,host_domains]")
		.withGraphFetched("host_domains")
		.first();

	if (accessData.permission_visibility !== "all") {
		query.andWhere("owner_user_id", access.token.getUserId(1));
	}
	if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
		query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
	}

	let row = await query;
	row = utils.omitRow(omissions())(row);
	if (!row || !row.id) {
		throw new errs.ItemNotFoundError(thisData.id);
	}
	const cleanRow = hostService.cleanRowCertificateMeta(row);
	if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
		return _.omit(row, thisData.omit);
	}
	return cleanRow;
};

const getAll = async (access, expand, searchQuery) => {
	const accessData = await access.can("proxy_hosts:list");
	const query = proxyHostModel
		.query()
		.where("is_deleted", 0)
		.groupBy("id")
		.allowGraph("[owner,access_list,certificate,host_domains]")
		.withGraphFetched("[host_domains, certificate, access_list]")
		.orderBy("id", "DESC");
	if (accessData.permission_visibility !== "all") {
		query.andWhere("owner_user_id", access.token.getUserId(1));
	}
	if (typeof searchQuery === "string") {
		query.whereExists(proxyHostModel.relatedQuery("host_domains").where("domain_name", "like", `%${searchQuery}%`));
	}
	if (typeof expand !== "undefined" && expand !== null) {
		query.withGraphFetched(`[${expand.join(", ")}]`);
	}
	const rows = await query;
	if (rows) {
		rows.map((row) => {
			row.access_list_id = Number.parseInt(String(row.access_list_id), 10);
			row.connected_tunnels = row.count || 0;
			delete row.count;
			return row;
		});
	}
	return rows;
};

const getCount = async (userId, visibility) => {
	const query = proxyHostModel.query().count("id as count").where("is_deleted", 0);
	if (visibility !== "all") {
		query.andWhere("owner_user_id", userId);
	}
	const row = await query.first();
	return Number.parseInt(row.count, 10);
};

export { get, getAll, getCount };
