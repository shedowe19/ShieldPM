import type { FirewallPolicy, ProxyHost } from "src/api/backend";
import { formatMaintenanceDateTime } from "src/lib/maintenanceDateTime";
import { FORWARD_SCHEME, ICON_TYPE, PHP_VERSION, TERMINAL_AUTH_TYPE, TIME_UNIT } from "src/types/enums";

export interface ProxyHostFormValues extends Omit<Partial<ProxyHost>, "advLimitReqRate" | "advLimitReqBurst"> {
	advLimitReqRate?: number | string;
	advLimitReqBurst?: number | string;
	crowdsecEnabled?: boolean;
	anubisEnabled?: boolean;
	anubisRules?: ProxyHost["anubisRules"];
	gitCredentials?: string;
}

export const parseProxyHostMeta = (value: unknown): ProxyHost["meta"] => {
	if (typeof value === "string") {
		try {
			return parseProxyHostMeta(JSON.parse(value));
		} catch {
			return {};
		}
	}
	return value && typeof value === "object" && !Array.isArray(value) ? (value as ProxyHost["meta"]) : {};
};

export const createProxyHostFirewallPolicy = (policy?: Partial<FirewallPolicy>): FirewallPolicy => ({
	...policy,
	enabled: policy?.enabled === true,
	listIds: Array.isArray(policy?.listIds) ? [...policy.listIds] : [],
	allowlist: Array.isArray(policy?.allowlist) ? [...policy.allowlist] : [],
	denylist: Array.isArray(policy?.denylist) ? policy.denylist.map((entry) => ({ ...entry })) : [],
	asnDenylist: Array.isArray(policy?.asnDenylist)
		? policy.asnDenylist.map((entry) => ({ ...entry, reason: entry.reason ?? "" }))
		: [],
	countryDenylist: Array.isArray(policy?.countryDenylist) ? [...policy.countryDenylist] : [],
	countryReason: policy?.countryReason ?? "",
	blockUnknownCountry: policy?.blockUnknownCountry === true,
	publicMessage: policy?.publicMessage ?? "",
	supportUrl: policy?.supportUrl ?? "",
	internalNote: policy?.internalNote ?? "",
});

const createProxyHostInitialMeta = (value: unknown): ProxyHost["meta"] => {
	const meta = parseProxyHostMeta(value);
	return { ...meta, ipFirewall: createProxyHostFirewallPolicy(meta.ipFirewall) };
};

export const createProxyHostInitialValues = (data: Partial<ProxyHost> = {}): ProxyHostFormValues => ({
	meta: createProxyHostInitialMeta(data.meta),
	// Details tab
	domainNames: data.domainNames || [],
	forwardScheme: data.forwardScheme || FORWARD_SCHEME.HTTP,
	forwardHost: data.forwardHost || "",
	forwardPort: data.forwardPort || undefined,
	indexFile: data.indexFile || "",
	// Terminal Fields
	terminalHost: data.terminalHost || "",
	terminalPort: data.terminalPort || 22,
	terminalUsername: data.terminalUsername || "",
	terminalAuthType: data.terminalAuthType || TERMINAL_AUTH_TYPE.PASSWORD,
	terminalPassword: "",
	terminalPrivateKey: "",

	accessListId: data.accessListId || 0,
	cachingEnabled: data.cachingEnabled || false,
	zstdEnabled: data.zstdEnabled || false,
	disableBuffering: data.disableBuffering || false,
	blockExploits: data.blockExploits || false,
	allowWebsocketUpgrade: data.allowWebsocketUpgrade || false,
	maintenanceOnFailure: data.maintenanceOnFailure || false,
	// PHP hosting (for scheme=path)
	phpEnabled: data.phpEnabled || false,
	phpVersion: data.phpVersion || PHP_VERSION.PHP83,
	phpOverrideIni: data.phpOverrideIni || "",
	// Locations tab
	locations: data.locations || [],
	// SSL tab
	certificateId: data.certificateId || 0,
	sslForced: data.sslForced || false,
	http2Support: data.http2Support || false,
	hstsEnabled: data.hstsEnabled || false,
	hstsSubdomains: data.hstsSubdomains || false,
	// Advanced tab
	advancedConfig: data.advancedConfig || "",
	bandwidthLimit: data.bandwidthLimit || "",
	turboLoader: data.turboLoader || false,
	advLimitReqRate: data.advLimitReqRate ?? undefined,
	advLimitReqUnit: data.advLimitReqUnit || TIME_UNIT.SECONDS,
	advLimitReqBurst: data.advLimitReqBurst ?? undefined,
	forwardQuery: data.forwardQuery || "",
	maintenanceActive: data.maintenanceActive || false,
	maintenanceStart: formatMaintenanceDateTime(data.maintenanceStart),
	maintenanceEnd: formatMaintenanceDateTime(data.maintenanceEnd),
	maintenanceReason: data.maintenanceReason || "",
	// Upload relay
	uploadRelayEnabled: data.uploadRelayEnabled || false,
	uploadRelayPath: data.uploadRelayPath || "/_shieldpm-upload",
	uploadRelayTargetPath: data.uploadRelayTargetPath || "/",
	uploadRelayChunkSize: data.uploadRelayChunkSize || 80 * 1024 * 1024,
	uploadRelayMaxFileSize: data.uploadRelayMaxFileSize || 10 * 1024 * 1024 * 1024,
	uploadRelayMaxPendingBytes: data.uploadRelayMaxPendingBytes || 20 * 1024 * 1024 * 1024,
	uploadRelayCleanupHours: data.uploadRelayCleanupHours || 24,
	// Git Sync
	gitRepoUrl: data.gitRepoUrl || "",
	gitBranch: data.gitBranch || "main",
	gitSyncEnabled: data.gitSyncEnabled || false,
	gitPollInterval: data.gitPollInterval || 60,
	gitPollUnit: data.gitPollUnit || TIME_UNIT.MINUTES,
	gitCredentials: "", // Do not fill credentials for security
	// Service Icon
	iconType: data.iconType || ICON_TYPE.AUTO,
	iconUrl: data.iconUrl || "",
	// CrowdSec
	crowdsecEnabled: data.securityCrowdsec || false,
	// Anubis
	anubisEnabled: data.anubisEnabled || false,
	anubisRules: data.anubisRules || [],
	// Note
	note: data.note || "",
});
