export enum TorOnionStatus {
	STOPPED = 0,
	STARTING = 1,
	RUNNING = 2,
	ERROR = 3,
}

export enum IconType {
	Auto = "auto",
	Custom = "custom",
	None = "none",
}

export enum AppTheme {
	Light = "light",
	Dark = "dark",
}

export enum AiProvider {
	Gemini = "gemini",
	Local = "local",
}

export enum AccessDirective {
	Allow = "allow",
	Deny = "deny",
}

export enum DdnsProviderName {
	Cloudflare = "cloudflare",
	DuckDNS = "duckdns",
	Custom = "custom",
}

export enum IpVersion {
	V4 = "v4",
	V6 = "v6",
	Dual = "dual",
}
