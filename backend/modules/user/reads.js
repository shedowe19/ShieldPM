import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import userModel from "../../models/user.js";
import { DEFAULT_AVATAR, omissions } from "./constants.js";

const get = async (access, data) => {
	const thisData = data || {};
	if (typeof thisData.id === "undefined" || !thisData.id) thisData.id = access.token.getUserId(0);
	await access.can("users:get", thisData.id);
	const query = userModel.query().where("is_deleted", 0).andWhere("id", thisData.id).allowGraph("[permissions]").first();
	if (typeof thisData.expand !== "undefined" && thisData.expand !== null) query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
	let row = await query;
	row = _.omit(row, omissions());
	if (!row || !row.id) throw new errs.ItemNotFoundError(thisData.id);
	if (typeof thisData.omit !== "undefined" && thisData.omit !== null) return _.omit(row, thisData.omit);
	if (row.avatar === "") row.avatar = DEFAULT_AVATAR;
	return row;
};

const getAll = async (access, expand, search_query) => {
	await access.can("users:list");
	const query = userModel.query().where("is_deleted", 0).groupBy("id").allowGraph("[permissions]").orderBy("name", "ASC");
	if (typeof search_query === "string") {
		query.where(function () {
			this.where("name", "like", `%${search_query}%`).orWhere("email", "like", `%${search_query}%`);
		});
	}
	if (typeof expand !== "undefined" && expand !== null) query.withGraphFetched(`[${expand.join(", ")}]`);
	const res = await query;
	return utils.omitRows(omissions())(res);
};

const getCount = async (access, search_query) => {
	await access.can("users:list");
	const query = userModel.query().count("id as count").where("is_deleted", 0).first();
	if (typeof search_query === "string") {
		query.where(function () {
			this.where("user.name", "like", `%${search_query}%`).orWhere("user.email", "like", `%${search_query}%`);
		});
	}
	const row = await query;
	return Number.parseInt(String(row.count), 10);
};

const isEmailAvailable = async (email, user_id) => {
	const query = userModel.query().where("email", "=", email.toLowerCase().trim()).where("is_deleted", 0).first();
	if (typeof user_id !== "undefined") query.where("id", "!=", user_id);
	const user = await query;
	return !user;
};

const getUserOmisionsByAccess = (access, idRequested) => {
	let response = [];
	if (!access.token.hasScope("admin") && access.token.getUserId(0) !== idRequested) response = ["is_deleted"];
	return response;
};

export { get, getAll, getCount, getUserOmisionsByAccess, isEmailAvailable };
