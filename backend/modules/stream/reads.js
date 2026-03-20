import _ from "lodash";
import errs from "../../lib/error.js";
import { castJsonIfNeed } from "../../lib/helpers.js";
import utils from "../../lib/utils.js";
import streamModel from "../../models/stream.js";
import { hostService } from "../../modules/host/index.js";
import { omissions } from "./helpers.js";

const get = async (access, data) => {
	const thisData = data || {};
	const accessData = await access.can("streams:get", thisData.id);
	const query = streamModel
		.query()
		.where("is_deleted", 0)
		.andWhere("id", thisData.id)
		.allowGraph("[owner,certificate]")
		.first();
	if (accessData.permission_visibility !== "all") query.andWhere("owner_user_id", access.token.getUserId(1));
	if (typeof thisData.expand !== "undefined" && thisData.expand !== null)
		query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
	let row = await query;
	row = utils.omitRow(omissions())(row);
	if (!row || !row.id) throw new errs.ItemNotFoundError(thisData.id);
	row = hostService.cleanRowCertificateMeta(row);
	if (typeof thisData.omit !== "undefined" && thisData.omit !== null) return _.omit(row, thisData.omit);
	return row;
};

const getAll = async (access, expand, searchQuery) => {
	const accessData = await access.can("streams:list");
	const query = streamModel
		.query()
		.where("is_deleted", 0)
		.groupBy("id")
		.allowGraph("[owner,certificate]")
		.orderBy("incoming_port", "ASC");
	if (accessData.permission_visibility !== "all") query.andWhere("owner_user_id", access.token.getUserId(1));
	if (typeof searchQuery === "string" && searchQuery.length > 0) {
		query.where(function () {
			this.where(castJsonIfNeed("incoming_port"), "like", `%${searchQuery}%`);
		});
	}
	if (typeof expand !== "undefined" && expand !== null) query.withGraphFetched(`[${expand.join(", ")}]`);
	let rows = await query;
	rows = utils.omitRows(omissions())(rows);
	if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
		return hostService.cleanAllRowsCertificateMeta(rows);
	}
	return rows;
};

const getCount = async (userId, visibility) => {
	const query = streamModel.query().count("id AS count").where("is_deleted", 0);
	if (visibility !== "all") query.andWhere("owner_user_id", userId);
	const row = await query.first();
	return Number.parseInt(row.count, 10);
};

export { get, getAll, getCount };
