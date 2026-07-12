import type { AuditLog } from "src/api/backend";

export interface AuditLogCsvHeaders {
	action: string;
	createdOn: string;
	metadata: string;
	objectId: string;
	objectType: string;
	user: string;
}

const escapeCsvCell = (value: string | number) => {
	const stringValue = String(value);
	const safeValue = /^[\t\r\n ]*[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;

	return `"${safeValue.replace(/"/g, '""')}"`;
};

export const createAuditLogCsv = (auditLogs: AuditLog[], headers: AuditLogCsvHeaders) => {
	const rows = auditLogs.map((auditLog) => [
		auditLog.createdOn,
		auditLog.user?.name || auditLog.userId,
		auditLog.action,
		auditLog.objectType,
		auditLog.objectId,
		JSON.stringify(auditLog.meta),
	]);

	return [
		[headers.createdOn, headers.user, headers.action, headers.objectType, headers.objectId, headers.metadata],
		...rows,
	]
		.map((row) => row.map(escapeCsvCell).join(","))
		.join("\r\n");
};
