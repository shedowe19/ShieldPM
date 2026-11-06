import type { User } from "./models";

export interface HealthResponse {
	databaseSetupRequired?: boolean;
	databaseMaintenance?: boolean;
	status: string;
	version: string;
	setup: boolean;
	demo: boolean;
}

export interface TokenResponse {
	expires: number | string | null;
}

export interface ValidatedCertificateResponse {
	certificate: Record<string, unknown>;
	certificateKey: boolean;
}

export interface LoginAsTokenResponse extends TokenResponse {
	user: User;
}

export interface VersionCheckResponse {
	current: string | null;
	latest: string | null;
	updateAvailable: boolean;
}
