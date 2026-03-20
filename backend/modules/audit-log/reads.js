import errs from "../../lib/error.js";
import { castJsonIfNeed } from "../../lib/helpers.js";
import auditLogModel from "../../models/audit-log.js";

const getAll = async (access, expand, searchQuery) => {
	await access.can("auditlog:list");
	const query = auditLogModel
		.query()
		.orderBy("created_on", "DESC")
		.orderBy("id", "DESC")
		.limit(100)
		.allowGraph("[user]");
	if (typeof searchQuery === "string" && searchQuery.length > 0) {
		query.where(function () {
			this.where(castJsonIfNeed("meta"), "like", `%${searchQuery}`);
		});
	}
	if (typeof expand !== "undefined" && expand !== null) query.withGraphFetched(`[${expand.join(", ")}]`);
	return query;
};

const get = async (access, data) => {
	await access.can("auditlog:list");
	const query = auditLogModel.query().andWhere("id", data.id).allowGraph("[user]").first();
	if (typeof data.expand !== "undefined" && data.expand !== null)
		query.withGraphFetched(`[${data.expand.join(", ")}]`);
	const row = await query;
	if (!row?.id) throw new errs.ItemNotFoundError(data.id);
	return row;
};

export { get, getAll };
