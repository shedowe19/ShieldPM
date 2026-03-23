import errs from "../../lib/error.js";
import settingModel from "../../models/setting.js";

const get = async (access, data) => {
	await access.can("settings:get", data.id);
	const row = await settingModel.query().where("id", data.id).first();
	if (row) return row;
	throw new errs.ItemNotFoundError(data.id);
};

const getCount = async (access) => {
	await access.can("settings:list");
	const row = await settingModel.query().count("id as count").first();
	return Number.parseInt(row.count, 10);
};

const getAll = async (access) => {
	await access.can("settings:list");
	return settingModel.query().orderBy("description", "ASC");
};

const getOidcConfig = async () => {
	return settingModel.query().where({ id: "oidc-config" }).first();
};

export { get, getAll, getCount, getOidcConfig };
