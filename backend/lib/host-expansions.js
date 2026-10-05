import errs from "./error.js";

/** Resolve each expanded host type independently of the parent resource's permissions. */
const hostVisibility = async (access, type) => {
	try {
		return (await access.can(`${type}:list`)).permission_visibility;
	} catch (error) {
		if (error instanceof errs.PermissionError) return null;
		throw error;
	}
};

/** Restrict public relation queries without restricting trusted configuration queries. */
export const restrictHostExpansions = async (query, access, relations) => {
	const graph = query.graphExpressionObject();
	for (const [relation, type] of Object.entries(relations)) {
		if (!graph?.[relation]) continue;
		const visibility = await hostVisibility(access, type);
		query.modifyGraph(relation, (builder) => {
			if (visibility === null) builder.whereRaw("1 = 0");
			else if (visibility !== "all") builder.where("owner_user_id", access.token.getUserId(1));
		});
	}
};

/** Filter already loaded configuration relations before returning a mutation response. */
export const filterHostExpansions = async (row, access, relations) => {
	for (const [relation, type] of Object.entries(relations)) {
		if (!Array.isArray(row[relation])) continue;
		const visibility = await hostVisibility(access, type);
		if (visibility === null) row[relation] = [];
		else if (visibility !== "all") {
			row[relation] = row[relation].filter((host) => host.owner_user_id === access.token.getUserId(1));
		}
	}
	return row;
};
