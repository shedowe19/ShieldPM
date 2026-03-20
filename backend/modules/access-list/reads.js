import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import accessListModel from "../../models/access_list.js";
import { maskItems, omissions } from "./helpers.js";

const get = async (access, data, skipMasking) => {
	const thisData = data || {};
	const accessData = await access.can("access_lists:get", thisData.id);
	const query = accessListModel
		.query()
		.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
		.leftJoin("proxy_host", function () {
			this.on("proxy_host.access_list_id", "=", "access_list.id").andOnVal("proxy_host.is_deleted", "=", 0);
		})
		.where("access_list.is_deleted", 0)
		.andWhere("access_list.id", thisData.id)
		.groupBy("access_list.id")
		.allowGraph("[owner,items,clients,proxy_hosts.[certificate,access_list.[clients,items]]]")
		.first();
	if (accessData.permission_visibility !== "all") {
		query.andWhere("access_list.owner_user_id", access.token.getUserId(1));
	}
	if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
		query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
	}
	let row = await query;
	if (!row || !row.id) throw new errs.ItemNotFoundError(thisData.id);
	row = utils.omitRow(omissions())(row);
	if (!skipMasking && typeof row.items !== "undefined" && row.items) row = maskItems(row);
	if (typeof data.omit !== "undefined" && data.omit !== null) row = _.omit(row, data.omit);
	return row;
};

const getAll = async (access, expand, searchQuery) => {
	const accessData = await access.can("access_lists:list");
	const query = accessListModel
		.query()
		.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
		.leftJoin("proxy_host", function () {
			this.on("proxy_host.access_list_id", "=", "access_list.id").andOnVal("proxy_host.is_deleted", "=", 0);
		})
		.where("access_list.is_deleted", 0)
		.groupBy("access_list.id")
		.allowGraph("[owner,items,clients]")
		.orderBy("access_list.name", "ASC");
	if (accessData.permission_visibility !== "all") query.andWhere("access_list.owner_user_id", access.token.getUserId(1));
	if (typeof searchQuery === "string") {
		query.where(function () {
			this.where("name", "like", `%${searchQuery}%`);
		});
	}
	if (typeof expand !== "undefined" && expand !== null) query.withGraphFetched(`[${expand.join(", ")}]`);
	let rows = await query;
	rows = utils.omitRows(omissions())(rows);
	if (rows) {
		rows.map((row, idx) => {
			if (typeof row.items !== "undefined" && row.items) rows[idx] = maskItems(row);
			return true;
		});
	}
	return rows;
};

const getCount = async (userId, visibility) => {
	const query = accessListModel.query().count("id as count").where("is_deleted", 0);
	if (visibility !== "all") query.andWhere("owner_user_id", userId);
	const row = await query.first();
	return row.count || 0;
};

export { get, getAll, getCount };
