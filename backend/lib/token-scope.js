/**
 * Older NPMplus tokens used the scope "all" instead of "user".
 * Treat them as a normal user scope until they expire.
 *
 * @param   {String|Array} scope
 * @returns {String|Array}
 */
const normalizeScope = (scope) => {
	if (typeof scope === "string") {
		return scope === "all" ? ["user"] : scope;
	}

	if (Array.isArray(scope) && scope.includes("all")) {
		return ["user"];
	}

	return scope;
};

export default normalizeScope;
