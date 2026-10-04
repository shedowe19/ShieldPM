import { AUDIT_LOG_OBJECT_TYPE, type AuditLogObjectType } from "src/types/enums";

const auditLogObjectTypes = new Set<string>(Object.values(AUDIT_LOG_OBJECT_TYPE));
const auditLogObjectTypeMessageIds = new Map<string, string>([
	[AUDIT_LOG_OBJECT_TYPE.CLOUDFLARED_TUNNEL, "cloudflared.title"],
	[AUDIT_LOG_OBJECT_TYPE.TERMINAL_HOST, "terminal.host"],
	[AUDIT_LOG_OBJECT_TYPE.WIREGUARD_PEER, "audit-log.filter.wireguard-peer"],
	[AUDIT_LOG_OBJECT_TYPE.WIREGUARD_SETTINGS, "audit-log.filter.wireguard-settings"],
]);

export const isKnownAuditLogObjectType = (objectType: unknown): objectType is AuditLogObjectType =>
	typeof objectType === "string" && auditLogObjectTypes.has(objectType);

export const getAuditLogObjectTypeMessageId = (objectType: unknown): string => {
	if (!isKnownAuditLogObjectType(objectType)) return "audit-log.event";
	return auditLogObjectTypeMessageIds.get(objectType) ?? objectType;
};
