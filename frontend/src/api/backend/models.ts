import type {
	AccessDirective,
	AiProvider,
	AiRole,
	AvatarType,
	CertificateProvider,
	ChatProvider,
	DdnsProviderName,
	ForwardScheme,
	GitPollUnit,
	IconType,
	IpVersion,
	PhpVersion,
	TerminalAuthType,
	TimeUnit,
	TorOnionStatus,
	UiColor,
} from "src/types/enums";

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
	cloudflaredTunnels: string;
	analytics: string;
	ddnsProviders: string;
	torOnions: string;
	dashboardNotes: string;
	chat: string;
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
	avatar_type: AvatarType;
	avatar_value: string | null;
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
	meta: Record<string, unknown>;
	// Expansions:
	user?: User;
}

export interface AccessList {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	ownerUserId: number;
	name: string;
	meta: Record<string, unknown>;
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
	meta?: Record<string, unknown>;
	hint?: string;
}

export type AccessListClient = {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	address: string;
	directive: AccessDirective;
	meta?: Record<string, unknown>;
};

export interface Certificate {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	provider: CertificateProvider | (string & {});
	niceName: string;
	domainNames: string[];
	expiresOn: string;
	meta: Record<string, unknown> & { years?: number };
	owner?: User;
	proxyHosts?: ProxyHost[];
	deadHosts?: DeadHost[];
	redirectionHosts?: RedirectionHost[];
	streams?: Stream[];
}

export interface AnubisRule {
	name?: string;
	path?: string;
	action: "ALLOW" | "DENY" | "CHALLENGE";
	userAgent?: string;
	headers?: Record<string, string>;
	remoteAddresses?: string[];
	challengeDifficulty?: number | null;
	challengeAlgorithm?: "fast" | "slow" | "metarefresh" | "preact";
}

export interface ProxyLocation {
	path: string;
	advancedConfig: string;
	forwardScheme: ForwardScheme;
	forwardHost: string;
	forwardPort: number;
	forwardQuery?: string;
}

export interface FirewallPolicy {
	id: number;
	createdOn: string;
	modifiedOn: string;
	name: string;
	enabled: boolean;
	action: "deny" | "drop";
	geoMode: "off" | "allow" | "block";
	geoCountries: string[];
	allowCidrs: string[];
	blockCidrs: string[];
	feedUrls: string[];
	refreshIntervalHours: number;
	feedStatus: Record<string, { count?: number; error?: string; lastSuccess?: string }>;
	totalCidrs: number;
	lastUpdatedOn?: string | null;
	lastError?: string | null;
}

export interface ProxyHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardScheme: ForwardScheme;
	forwardHost: string;
	forwardPort: number;
	forwardQuery?: string;
	accessListId: number;
	firewallPolicyId?: number | null;
	certificateId: number;
	sslForced: boolean;
	cachingEnabled: boolean;
	disableBuffering: boolean;
	blockExploits: boolean;
	securityCrowdsec: boolean;
	anubisEnabled: boolean;
	anubisRules?: AnubisRule[];
	advancedConfig: string;
	bandwidthLimit: string;
	turboLoader?: boolean;
	meta: Record<string, unknown>;
	maintenanceOnFailure: boolean;
	advLimitReqRate?: number;
	advLimitReqUnit?: TimeUnit;
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
	phpVersion?: PhpVersion;
	indexFile?: string; // Add indexFile
	// Git Sync (for scheme=path)
	gitRepoUrl?: string | null;
	gitBranch?: string;
	gitSyncEnabled?: boolean;
	gitPollInterval?: number;
	gitPollUnit?: GitPollUnit;
	gitLastSync?: string | null;
	gitLastCommit?: string | null;
	gitLastError?: string | null;
	// Service Icon
	iconUrl?: string | null;
	iconType?: IconType;
	// Terminal Fields
	terminalHost?: string;
	terminalPort?: number;
	terminalUsername?: string;
	terminalAuthType?: TerminalAuthType;
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
	meta: Record<string, unknown>;
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
	meta: Record<string, unknown>;
	http2Support: boolean;
	forwardScheme: ForwardScheme;
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
	meta: Record<string, unknown>;
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
	meta?: Record<string, unknown>;
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
	meta: Record<string, unknown>;
	owner?: User;
}

export interface AiConfig {
	enabled: boolean;
	provider: AiProvider;
	api_key?: string;
	base_url?: string;
	model?: string;
	num_ctx?: number;
	num_batch?: number;
	num_thread?: number;
	keep_alive?: string;
}

export interface AiChatMessage {
	role: AiRole;
	content: string;
	toolCalls?: unknown[];
	rawParts?: unknown[];
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
	provider: DdnsProviderName;
	domains: string[];
	config: Record<string, unknown>;
	ip_ver?: IpVersion;
	lastIpv4?: string;
	lastIpv6?: string;
	lastUpdatedOn?: string;
	lastError?: string;
	enabled: boolean;
	meta: Record<string, unknown>;
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
	status: TorOnionStatus;
	meta: Record<string, unknown>;
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
	color: UiColor;
	position: number;
}

export interface ChatIntegration {
	id: number;
	createdOn: string;
	modifiedOn: string;
	userId: number;
	provider: ChatProvider;
	token?: string;
	enabled: boolean;
	config: {
		allowed_ids: (string | number)[];
	};
	meta: Record<string, unknown>;
	user?: User;
}

export interface WireguardPeer {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	name: string;
	description?: string;
	clientAddress: string;
	clientPublicKey: string;
	serverPublicKey: string;
	endpoint?: string;
	allowedIps: string;
	persistentKeepalive: number;
	dns?: string;
	status: number;
	lastHandshake?: string;
	transferRx: number;
	transferTx: number;
	meta: Record<string, unknown>;
	owner?: User;
}

export interface WireguardServer {
	available: boolean;
	publicKey: string | null;
	endpoint: string | null;
	listenPort: number;
	subnet: string;
	interfaceUp: boolean;
}

export interface WireguardListResponse {
	peers: WireguardPeer[];
	server: WireguardServer;
}
