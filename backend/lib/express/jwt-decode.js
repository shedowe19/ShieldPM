import Access from "../access.js";

export default () => {
	return async (req, res, next) => {
		res.locals.access = null;
		// This route returns only the public provider label and enabled flag.
		// Stale browser credentials must not prevent choosing a new login method.
		const oidcAccess = req.path === "/oidc-config" && req.method === "GET" && req.baseUrl.endsWith("/settings");
		const access = /** @type {ReturnType<typeof Access>} */ (
			Reflect.construct(Access, [oidcAccess ? null : res.locals.token || null])
		);
		await access.load(oidcAccess);
		res.locals.access = access;
		next();
	};
};
