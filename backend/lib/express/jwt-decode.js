import Access from "../access.js";

export default () => {
	return async (req, res, next) => {
		res.locals.access = null;
		const access = /** @type {any} */ (new /** @type {any} */ (Access)(res.locals.token || null));
		// Allow unauthenticated access to get the oidc configuration
		const tokenUserId =
			access.token && typeof access.token.getUserId === "function" ? access.token.getUserId() : null;
		const oidcAccess = req.url === "/oidc-config" && req.method === "GET" && !tokenUserId;
		await access.load(oidcAccess);
		res.locals.access = access;
		next();
	};
};
