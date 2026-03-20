import _ from "lodash";
import error from "../../lib/error.js";
import utils from "../../lib/utils.js";
import certificateModel from "../../models/certificate.js";
import { cleanExpansions, omissions } from "./helpers.js";

const get = async (access, data) => {
	const thisData = data || {};
	const accessData = await access.can("certificates:get", thisData.id);
	const query = certificateModel.query().where("is_deleted", 0).andWhere("id", thisData.id).allowGraph("[owner,proxy_hosts,redirection_hosts,dead_hosts,streams]").first();
	if (accessData.permission_visibility !== "all") query.andWhere("owner_user_id", access.token.getUserId(1));
	if (typeof thisData.expand !== "undefined" && thisData.expand !== null) query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
	const row = await query.then(utils.omitRow(omissions()));
	if (!row || !row.id) throw new error.ItemNotFoundError(thisData.id);
	if (typeof thisData.omit !== "undefined" && thisData.omit !== null) return _.omit(row, [...thisData.omit]);
	return cleanExpansions(row);
};

const getAll = async (access, expand, searchQuery) => {
	const accessData = await access.can("certificates:list");
	const query = certificateModel.query().where("is_deleted", 0).groupBy("id").allowGraph("[owner,proxy_hosts,redirection_hosts,dead_hosts,streams]").orderBy("nice_name", "ASC");
	if (accessData.permission_visibility !== "all") query.andWhere("owner_user_id", access.token.getUserId(1));
	if (typeof searchQuery === "string") query.where(function () { this.where("nice_name", "like", `%${searchQuery}%`); });
	if (typeof expand !== "undefined" && expand !== null) query.withGraphFetched(`[${expand.join(", ")}]`);
	const rows = await query.then(utils.omitRows(omissions()));
	for (let i = 0; i < rows.length; i++) rows[i] = cleanExpansions(rows[i]);
	return rows;
};

const getCount = async (userId, visibility) => {
	const query = certificateModel.query().count("id as count").where("is_deleted", 0);
	if (visibility !== "all") query.andWhere("owner_user_id", userId);
	const row = await query.first();
	return Number.parseInt(row.count, 10);
};

export { get, getAll, getCount };
