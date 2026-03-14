import Access from "../access.js";

export default () => {
	return async (req, res, next) => {
		res.locals.access = null;
		const access = /** @type {any} */ (new Access(res.locals.token || null));
		// Allow unauthenticated access to get the oidc configuration
		const tokenUserId =
			access.token && typeof access.token.getUserId === "function" ? access.token.getUserId() : null;
		const oidc_access = req.url === "/oidc-config" && req.method === "GET" && !tokenUserId;
		await access.load(oidc_access);
		res.locals.access = access;
		next();
	};
};
