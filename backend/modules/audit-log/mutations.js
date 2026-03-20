import errs from "../../lib/error.js";
import auditLogModel from "../../models/audit-log.js";

const add = async (access, data) => {
	if (typeof data.user_id === "undefined" || !data.user_id) {
		data.user_id = access.token.getUserId(1);
	}
	if (typeof data.action === "undefined" || !data.action) {
		throw new errs.InternalValidationError("Audit log entry must contain an Action");
	}
	const accessId = typeof access.token.getUserId === "function" ? access.token.getUserId(1) : 0;
	return auditLogModel.query().insert({
		user_id: accessId,
		action: data.action,
		object_type: data.object_type,
		object_id: data.object_id,
		meta: data.meta || {},
	});
};

export { add };
