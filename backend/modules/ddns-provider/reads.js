import errs from "../../lib/error.js";
import DdnsProvider from "../../models/ddns_provider.js";

const get = async (access, data) => {
	const accessData = await access.can("ddns_providers:get", data.id);
	const query = DdnsProvider.query().where("id", data.id);
	if (accessData.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
	const row = await query.first();
	if (!row) throw new errs.ItemNotFoundError(data.id);
	return row;
};

const getAll = async (access) => {
	const accessData = await access.can("ddns_providers:list");
	const query = DdnsProvider.query().orderBy("name", "ASC");
	if (accessData.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
	return query;
};

export { get, getAll };
