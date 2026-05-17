export default (req, res, next) => {
	if (req.params.user_id === "me" && res.locals.access) {
		const attrs = res.locals.access.token.get("attrs");
		req.params.user_id = Number(attrs?.id ? attrs.id : res.locals.access.token.getUserId(1));
	} else {
		req.params.user_id = Number.parseInt(req.params.user_id, 10);
	}
	next();
};
