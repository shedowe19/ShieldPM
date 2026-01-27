export const ACCESS_LIST_EXPANSION = {
	OWNER: "owner",
	ITEMS: "items",
	CLIENTS: "clients",
} as const;
export type AccessListExpansion = (typeof ACCESS_LIST_EXPANSION)[keyof typeof ACCESS_LIST_EXPANSION];

export const AUDIT_LOG_EXPANSION = {
	USER: "user",
} as const;
export type AuditLogExpansion = (typeof AUDIT_LOG_EXPANSION)[keyof typeof AUDIT_LOG_EXPANSION];

export const CERTIFICATE_EXPANSION = {
	OWNER: "owner",
	PROXY_HOSTS: "proxy_hosts",
	REDIRECTION_HOSTS: "redirection_hosts",
	DEAD_HOSTS: "dead_hosts",
	STREAMS: "streams",
} as const;
export type CertificateExpansion = (typeof CERTIFICATE_EXPANSION)[keyof typeof CERTIFICATE_EXPANSION];

export const HOST_EXPANSION = {
	OWNER: "owner",
	CERTIFICATE: "certificate",
} as const;
export type HostExpansion = (typeof HOST_EXPANSION)[keyof typeof HOST_EXPANSION];

export const PROXY_HOST_EXPANSION = {
	OWNER: "owner",
	ACCESS_LIST: "access_list",
	CERTIFICATE: "certificate",
} as const;
export type ProxyHostExpansion = (typeof PROXY_HOST_EXPANSION)[keyof typeof PROXY_HOST_EXPANSION];

export const USER_EXPANSION = {
	PERMISSIONS: "permissions",
} as const;
export type UserExpansion = (typeof USER_EXPANSION)[keyof typeof USER_EXPANSION];
