import type { ProxyHost } from "src/api/backend";
import { FORWARD_SCHEME, ICON_TYPE, PHP_VERSION, TERMINAL_AUTH_TYPE, TIME_UNIT } from "src/types/enums";

export interface ProxyHostFormValues extends Omit<Partial<ProxyHost>, "advLimitReqRate" | "advLimitReqBurst"> {
	advLimitReqRate?: number | string;
	advLimitReqBurst?: number | string;
	crowdsecEnabled?: boolean;
	anubisEnabled?: boolean;
	anubisRules?: ProxyHost["anubisRules"];
	gitCredentials?: string;
	php_override_ini?: string;
}

export const createProxyHostInitialValues = (data: Partial<ProxyHost> = {}): ProxyHostFormValues => ({
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
	terminalPassword: data.terminalPassword || "",
	terminalPrivateKey: data.terminalPrivateKey || "",
	terminalHostKeyFingerprint: data.terminalHostKeyFingerprint || "",

	accessListId: data.accessListId || 0,
	cachingEnabled: data.cachingEnabled || false,
	disableBuffering: data.disableBuffering || false,
	blockExploits: data.blockExploits || false,
	allowWebsocketUpgrade: data.allowWebsocketUpgrade || false,
	maintenanceOnFailure: data.maintenanceOnFailure || false,
	// PHP hosting (for scheme=path)
	phpEnabled: data.phpEnabled || false,
	phpVersion: data.phpVersion || PHP_VERSION.PHP83,
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
	advLimitReqRate: data.advLimitReqRate || undefined,
	advLimitReqUnit: data.advLimitReqUnit || TIME_UNIT.SECONDS,
	advLimitReqBurst: data.advLimitReqBurst || undefined,
	forwardQuery: data.forwardQuery || "",
	maintenanceActive: data.maintenanceActive || false,
	// datetime-local requires format: YYYY-MM-DDTHH:mm:ss (no timezone)
	// API returns ISO format with 'Z' suffix, so we strip it
	maintenanceStart: data.maintenanceStart ? data.maintenanceStart.replace("Z", "").split(".")[0] : "",
	maintenanceEnd: data.maintenanceEnd ? data.maintenanceEnd.replace("Z", "").split(".")[0] : "",
	maintenanceReason: data.maintenanceReason || "",
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
