import * as api from "./base";
import type { AuditLogExpansion } from "./expansions";
import type { AuditLog } from "./models";

export interface AuditLogListParams {
	action?: string;
	object_type?: string;
	user_id?: number;
	object_id?: number;
	created_after?: string;
	created_before?: string;
	query?: string;
}

export async function getAuditLogs(expand?: AuditLogExpansion[], params: AuditLogListParams = {}): Promise<AuditLog[]> {
	return await api.get({
		url: "/audit-log",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
