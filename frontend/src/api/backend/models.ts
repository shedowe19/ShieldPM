export interface UserPermissions {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	userId?: number;
	visibility: string;
	proxyHosts: string;
	redirectionHosts: string;
	deadHosts: string;
	streams: string;
	accessLists: string;
	certificates: string;
}

export interface User {
	id: number;
	createdOn: string;
	modifiedOn: string;
	isDisabled: boolean;
	email: string;
	name: string;
	nickname: string;
	avatar: string;
	roles: string[];
	permissions?: UserPermissions;
}

export interface AuditLog {
	id: number;
	createdOn: string;
	modifiedOn: string;
	userId: number;
	objectType: string;
	objectId: number;
	action: string;
	meta: Record<string, any>;
	// Expansions:
	user?: User;
}

export interface AccessList {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	ownerUserId: number;
	name: string;
	meta: Record<string, any>;
	mtlsEnabled?: boolean;
	mtlsUseInternal?: boolean;
	mtlsCertificate?: string;
	satisfyAny: boolean;
	passAuth: boolean;
	proxyHostCount?: number;
	// Expansions:
	owner?: User;
	items?: AccessListItem[];
	clients?: AccessListClient[];
}

export interface AccessListItem {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	username: string;
	password: string;
	meta?: Record<string, any>;
	hint?: string;
}

export type AccessListClient = {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	address: string;
	directive: "allow" | "deny";
	meta?: Record<string, any>;
};

export interface Certificate {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	provider: "letsencrypt" | "other" | "internal" | string;
	niceName: string;
	domainNames: string[];
	expiresOn: string;
	meta: Record<string, any> & { years?: number };
	owner?: User;
	proxyHosts?: ProxyHost[];
	deadHosts?: DeadHost[];
	redirectionHosts?: RedirectionHost[];
	streams?: Stream[];
}

export interface ProxyLocation {
	path: string;
	advancedConfig: string;
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	forwardQuery?: string;
}

export interface ProxyHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	forwardQuery?: string;
	accessListId: number;
	certificateId: number;
	sslForced: boolean;
	cachingEnabled: boolean;
	disableBuffering: boolean;
	blockExploits: boolean;
	securityCrowdsec: boolean;
	advancedConfig: string;
	bandwidthLimit: string;
	meta: Record<string, any>;
	maintenanceOnFailure: boolean;
	advLimitReqRate?: number;
	advLimitReqUnit?: string;
	advLimitReqBurst?: number;
	allowWebsocketUpgrade: boolean;

	http2Support: boolean;
	enabled: boolean;
	locations?: ProxyLocation[];
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	maintenanceActive: boolean;
	maintenanceStart?: string;
	maintenanceEnd?: string;
	maintenanceReason?: string;
	// PHP hosting (for scheme=path)
	phpEnabled?: boolean;
	phpVersion?: string;
	indexFile?: string; // Add indexFile
	// Git Sync (for scheme=path)
	gitRepoUrl?: string | null;
	gitBranch?: string;
	gitSyncEnabled?: boolean;
	gitPollInterval?: number;
	gitPollUnit?: "s" | "m" | "h";
	gitLastSync?: string | null;
	gitLastCommit?: string | null;
	gitLastError?: string | null;
	// Service Icon
	iconUrl?: string | null;
	iconType?: "auto" | "custom" | "none";
	// Terminal Fields
	terminalHost?: string;
	terminalPort?: number;
	terminalUsername?: string;
	terminalAuthType?: "password" | "key";
	terminalPassword?: string;
	terminalPrivateKey?: string;
	// Expansions:
	owner?: User;
	accessList?: AccessList;
	certificate?: Certificate;
	note?: string;
}

export interface DeadHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	certificateId: number;
	sslForced: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	http2Support: boolean;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
	note?: string;
}

export interface RedirectionHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardDomainName: string;
	preservePath: boolean;
	certificateId: number;
	sslForced: boolean;
	blockExploits: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	http2Support: boolean;
	forwardScheme: string;
	forwardHttpCode: number;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
	note?: string;
}

export interface Stream {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	incomingPort: number;
	forwardingHost: string;
	forwardingPort: number;
	tcpForwarding: boolean;
	udpForwarding: boolean;
	meta: Record<string, any>;
	enabled: boolean;
	certificateId: number;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
	note?: string;
}

export interface Setting {
	id: string;
	name?: string;
	description?: string;
	value: string;
	meta?: Record<string, any>;
}

export interface DNSProvider {
	id: string;
	name: string;
	credentials: string;
}

export interface CloudflaredTunnel {
	id: number;
	createdOn: string;
	modifiedOn: string;
	userId: number;
	name: string;
	token: string;
	status: number;
	meta: Record<string, any>;
	owner?: User;
}

export interface AiConfig {
	enabled: boolean;
	provider: "gemini" | "local";
	api_key?: string;
	base_url?: string;
	model?: string;
	num_ctx?: number;
	num_batch?: number;
	num_thread?: number;
	keep_alive?: string;
}

export interface AiChatMessage {
	role: "user" | "assistant" | "model";
	content: string;
	toolCalls?: any[];
	rawParts?: any[];
}

export interface AiChatResponse {
	role: "assistant";
	content: string;
}

export interface DdnsProvider {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	name: string;
	provider: "cloudflare" | "duckdns" | "custom";
	domains: string[];
	config: Record<string, any>;
	ip_ver?: "v4" | "v6" | "dual";
	lastIpv4?: string;
	lastIpv6?: string;
	lastUpdatedOn?: string;
	lastError?: string;
	enabled: boolean;
	meta: Record<string, any>;
}

export interface TorOnion {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	name: string;
	proxyHostId?: number | null;
	onionAddress?: string | null;
	virtualPort: number;
	targetPort: number;
	status: number; // 0=Stopped, 1=Starting, 2=Running, 3=Error
	meta: Record<string, any>;
	// Expansions:
	proxyHost?: ProxyHost;
}

export interface TorOnionListResponse {
	services: TorOnion[];
	tor: {
		available: boolean;
		version: string | null;
	};
}

export interface DashboardNote {
	id: number;
	createdOn: string;
	modifiedOn: string;
	content: string;
	color: string;
	position: number;
}
