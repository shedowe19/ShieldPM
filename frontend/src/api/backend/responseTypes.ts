import type { User } from "./models";

export interface HealthResponse {
	status: string;
	version: string;
	setup: boolean;
	demo: boolean;
}

export interface TokenResponse {
	expires: number | string;
	user?: Pick<User, "id">;
	csrfToken?: string;
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
