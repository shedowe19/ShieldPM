export const TOR_ONION_STATUS = {
	STOPPED: 0,
	STARTING: 1,
	RUNNING: 2,
	ERROR: 3,
} as const;
export type TorOnionStatus = (typeof TOR_ONION_STATUS)[keyof typeof TOR_ONION_STATUS];

export const ICON_TYPE = {
	AUTO: "auto",
	CUSTOM: "custom",
	NONE: "none",
} as const;
export type IconType = (typeof ICON_TYPE)[keyof typeof ICON_TYPE];

export const APP_THEME = {
	LIGHT: "light",
	DARK: "dark",
} as const;
export type AppTheme = (typeof APP_THEME)[keyof typeof APP_THEME];

export const AI_PROVIDER = {
	GEMINI: "gemini",
	LOCAL: "local",
} as const;
export type AiProvider = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

export const ACCESS_DIRECTIVE = {
	ALLOW: "allow",
	DENY: "deny",
} as const;
export type AccessDirective = (typeof ACCESS_DIRECTIVE)[keyof typeof ACCESS_DIRECTIVE];

export const DDNS_PROVIDER_NAME = {
	CLOUDFLARE: "cloudflare",
	DUCKDNS: "duckdns",
	CUSTOM: "custom",
} as const;
export type DdnsProviderName = (typeof DDNS_PROVIDER_NAME)[keyof typeof DDNS_PROVIDER_NAME];

export const IP_VERSION = {
	V4: "v4",
	V6: "v6",
	DUAL: "dual",
} as const;
export type IpVersion = (typeof IP_VERSION)[keyof typeof IP_VERSION];

export const CERTIFICATE_PROVIDER = {
	LETSENCRYPT: "letsencrypt",
	OTHER: "other",
	INTERNAL: "internal",
} as const;
export type CertificateProvider = (typeof CERTIFICATE_PROVIDER)[keyof typeof CERTIFICATE_PROVIDER];

export const GIT_POLL_UNIT = {
	SECONDS: "s",
	MINUTES: "m",
	HOURS: "h",
} as const;
export type GitPollUnit = (typeof GIT_POLL_UNIT)[keyof typeof GIT_POLL_UNIT];

export const TERMINAL_AUTH_TYPE = {
	PASSWORD: "password",
	KEY: "key",
} as const;
export type TerminalAuthType = (typeof TERMINAL_AUTH_TYPE)[keyof typeof TERMINAL_AUTH_TYPE];

export const AI_ROLE = {
	USER: "user",
	ASSISTANT: "assistant",
	MODEL: "model",
} as const;
export type AiRole = (typeof AI_ROLE)[keyof typeof AI_ROLE];

export const DB_ENGINE = {
	SQLITE: "sqlite",
	MYSQL: "mysql",
	POSTGRESQL: "postgresql",
	UNKNOWN: "unknown",
} as const;
export type DbEngine = (typeof DB_ENGINE)[keyof typeof DB_ENGINE];

export const GITOPS_AUTH_TYPE = {
	SSH: "ssh",
	HTTPS: "https",
} as const;
export type GitOpsAuthType = (typeof GITOPS_AUTH_TYPE)[keyof typeof GITOPS_AUTH_TYPE];

export const CERT_CUSTOM_MODE = {
	UPLOAD: "upload",
	PASTE: "paste",
} as const;
export type CertCustomMode = (typeof CERT_CUSTOM_MODE)[keyof typeof CERT_CUSTOM_MODE];

export const SETTINGS_TAB = {
	DEFAULT_SITE: "default-site",
	AI: "ai",
	GITOPS: "gitops",
	OIDC: "oidc",
} as const;
export type SettingsTab = (typeof SETTINGS_TAB)[keyof typeof SETTINGS_TAB];

export const FORWARD_SCHEME = {
	AUTO: "auto",
	HTTP: "http",
	HTTPS: "https",
	PATH: "path",
	GRPC: "grpc",
	GRPCS: "grpcs",
	TERMINAL: "terminal",
} as const;
export type ForwardScheme = (typeof FORWARD_SCHEME)[keyof typeof FORWARD_SCHEME];

export const PHP_VERSION = {
	PHP81: "81",
	PHP82: "82",
	PHP83: "83",
	PHP84: "84",
} as const;
export type PhpVersion = (typeof PHP_VERSION)[keyof typeof PHP_VERSION];

export const TIME_UNIT = {
	SECONDS: "s",
	MINUTES: "m",
	HOURS: "h",
} as const;
export type TimeUnit = (typeof TIME_UNIT)[keyof typeof TIME_UNIT];

export const INTERNAL_CERT_TYPE = {
	SERVER: "server",
	CLIENT: "client",
} as const;
export type InternalCertType = (typeof INTERNAL_CERT_TYPE)[keyof typeof INTERNAL_CERT_TYPE];

export const BUTTON_ACTION_TYPE = {
	PRIMARY: "primary",
	SECONDARY: "secondary",
	SUCCESS: "success",
	WARNING: "warning",
	DANGER: "danger",
	INFO: "info",
	LIGHT: "light",
	DARK: "dark",
} as const;
export type ButtonActionType = (typeof BUTTON_ACTION_TYPE)[keyof typeof BUTTON_ACTION_TYPE];

export const BUTTON_VARIANT = {
	GHOST: "ghost",
	OUTLINE: "outline",
	PILL: "pill",
	SQUARE: "square",
	ACTION: "action",
} as const;
export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT];

export const BUTTON_SIZE = {
	SM: "sm",
	MD: "md",
	LG: "lg",
	XL: "xl",
} as const;
export type ButtonSize = (typeof BUTTON_SIZE)[keyof typeof BUTTON_SIZE];

export const UI_COLOR = {
	BLUE: "blue",
	AZURE: "azure",
	INDIGO: "indigo",
	PURPLE: "purple",
	PINK: "pink",
	RED: "red",
	ORANGE: "orange",
	YELLOW: "yellow",
	LIME: "lime",
	GREEN: "green",
	TEAL: "teal",
	CYAN: "cyan",
	GRAY: "gray",
} as const;
export type UiColor = (typeof UI_COLOR)[keyof typeof UI_COLOR];

export const PEM_TYPE = {
	KEY: "PRIVATE KEY",
	CERT: "CERTIFICATE",
} as const;
export type PemType = (typeof PEM_TYPE)[keyof typeof PEM_TYPE];

export const BADGE_VARIANT = {
	DEFAULT: "default",
	SECONDARY: "secondary",
	SUCCESS: "success",
	WARNING: "warning",
	DESTRUCTIVE: "destructive",
	OUTLINE: "outline",
} as const;
export type BadgeVariant = (typeof BADGE_VARIANT)[keyof typeof BADGE_VARIANT];

export const SHADCN_VARIANT = {
	DEFAULT: "default",
	DESTRUCTIVE: "destructive",
	OUTLINE: "outline",
	SECONDARY: "secondary",
	GHOST: "ghost",
	LINK: "link",
} as const;
export type ShadcnVariant = (typeof SHADCN_VARIANT)[keyof typeof SHADCN_VARIANT];

export const ACCESS_LIST_AUTH_TYPE = {
	NONE: "none",
	AUTHENTIK_PROXY: "authentik_proxy",
	OAUTH2_PROXY: "oauth2_proxy",
	OIDC: "oidc",
} as const;
export type AccessListAuthType = (typeof ACCESS_LIST_AUTH_TYPE)[keyof typeof ACCESS_LIST_AUTH_TYPE];

export const USER_ROLE = {
	ADMIN: "admin",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const AUDIT_LOG_OBJECT_TYPE = {
	ACCESS_LIST: "access-list",
	FIREWALL_LIST: "firewall-list",
	USER: "user",
	PROXY_HOST: "proxy-host",
	REDIRECTION_HOST: "redirection-host",
	DEAD_HOST: "dead-host",
	STREAM: "stream",
	CERTIFICATE: "certificate",
	DDNS_PROVIDER: "ddns-provider",
	TERMINAL_HOST: "terminal-host",
	CLOUDFLARED_TUNNEL: "cloudflared-tunnel",
	SETTING: "setting",
	DASHBOARD_NOTE: "dashboard_note",
	TOR_ONION: "tor-onion",
	WIREGUARD_PEER: "wireguard-peer",
	WIREGUARD_SETTINGS: "wireguard-settings",
	AUTH_SESSION: "auth-session",
	AUTH: "auth",
	SECURITY_INCIDENT: "security-incident",
	CHAT_INTEGRATION: "chat-integration",
} as const;
export type AuditLogObjectType = (typeof AUDIT_LOG_OBJECT_TYPE)[keyof typeof AUDIT_LOG_OBJECT_TYPE];

export const AUDIT_LOG_ACTION = {
	CREATED: "created",
	CLIENT_CERTIFICATE_CREATED: "client_certificate.created",
	DELETED: "deleted",
	UPDATED: "updated",
	ENABLED: "enabled",
	DISABLED: "disabled",
	RENEWED: "renewed",
	DOWNLOADED: "downloaded",
	RESTORED: "restored",
	REFRESH_REPLAY_DETECTED: "refresh_replay_detected",
	LOGIN_SUCCEEDED: "auth.login_succeeded",
	LOGIN_FAILED: "auth.login_failed",
	LOGIN_PENDING_2FA: "auth.login_pending_2fa",
	LOGIN_BLOCKED: "auth.login_blocked",
	LOGOUT: "auth.logout",
	TOKEN_ISSUED: "auth.token_issued",
	TOKEN_REFRESHED: "auth.token_refreshed",
	TWO_FACTOR_ENABLED: "auth.2fa_enabled",
	TWO_FACTOR_DISABLED: "auth.2fa_disabled",
	TWO_FACTOR_BACKUP_CODES_REGENERATED: "auth.2fa_backup_codes_regenerated",
	USER_ROLES_CHANGED: "user.roles_changed",
	USER_PERMISSIONS_CHANGED: "user.permissions_changed",
	OIDC_LOGIN_STARTED: "oidc.login_started",
	OIDC_LOGIN_SUCCEEDED: "oidc.login_succeeded",
	OIDC_LOGIN_FAILED: "oidc.login_failed",
	CERTIFICATE_ROOT_CA_DOWNLOADED: "root_ca_downloaded",
	WIREGUARD_CONFIG_EXPORTED: "config_exported",
	TERMINAL_OPENED: "terminal.session_opened",
	TERMINAL_CLOSED: "terminal.session_closed",
	TERMINAL_DENIED: "terminal.session_denied",
	GITOPS_IMPORTED: "imported",
	GITOPS_PULLED: "pulled",
	GITOPS_REVERTED: "reverted",
	GIT_DEPLOY_SYNCED: "git_sync",
	DOCKER_DISCOVERED: "discovered",
	CHATOPS_COMMAND: "command",
	CERTIFICATE_RENEW_FAILED: "renew_failed",
	USER_IMPERSONATED: "user.impersonated",
	USER_OIDC_LINK_DENIED: "user.oidc_link_denied",
	USER_OIDC_STEP_UP_REQUIRED: "user.oidc_step_up_required",
	SECURITY_INCIDENT_RESOLVED: "security.incident_resolved",
} as const;
export type AuditLogAction = (typeof AUDIT_LOG_ACTION)[keyof typeof AUDIT_LOG_ACTION];

export const PROXY_HOST_TAB = {
	DETAILS: "details",
	LOCATIONS: "locations",
	SSL: "ssl",
	SECURITY: "security",
	ADVANCED: "advanced",
	MAINTENANCE: "maintenance",
	NOTES: "notes",
	GIT_SYNC: "git-sync",
} as const;
export type ProxyHostTab = (typeof PROXY_HOST_TAB)[keyof typeof PROXY_HOST_TAB];

export const REDIRECTION_HOST_TAB = {
	DETAILS: "details",
	SSL: "ssl",
	ADVANCED: "advanced",
	NOTES: "notes",
} as const;
export type RedirectionHostTab = (typeof REDIRECTION_HOST_TAB)[keyof typeof REDIRECTION_HOST_TAB];

export const STREAM_TAB = {
	DETAILS: "details",
	SSL: "ssl",
	NOTES: "notes",
} as const;
export type StreamTab = (typeof STREAM_TAB)[keyof typeof STREAM_TAB];

export const ACCESS_LIST_TAB = {
	DETAILS: "details",
	AUTH: "auth",
	RULES: "rules",
	SSO: "sso",
	MTLS: "mtls",
} as const;
export type AccessListTab = (typeof ACCESS_LIST_TAB)[keyof typeof ACCESS_LIST_TAB];

export const DEAD_HOST_TAB = {
	DETAILS: "details",
	SSL: "ssl",
	ADVANCED: "advanced",
	NOTES: "notes",
} as const;
export type DeadHostTab = (typeof DEAD_HOST_TAB)[keyof typeof DEAD_HOST_TAB];

export const PERMISSION_LEVEL = {
	MANAGE: "manage",
	VIEW: "view",
	HIDDEN: "hidden",
} as const;
export type PermissionLevel = (typeof PERMISSION_LEVEL)[keyof typeof PERMISSION_LEVEL];

export const PERMISSION_SCOPE = {
	USER: "user",
	ALL: "all",
} as const;
export type PermissionScope = (typeof PERMISSION_SCOPE)[keyof typeof PERMISSION_SCOPE];

export const AVATAR_TYPE = {
	GRAVATAR: "gravatar",
	URL: "url",
	UPLOAD: "upload",
} as const;
export type AvatarType = (typeof AVATAR_TYPE)[keyof typeof AVATAR_TYPE];
export const CHAT_PROVIDER = {
	TELEGRAM: "telegram",
} as const;
export type ChatProvider = (typeof CHAT_PROVIDER)[keyof typeof CHAT_PROVIDER];
