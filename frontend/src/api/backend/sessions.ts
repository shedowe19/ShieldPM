import * as api from "./base";

export interface BrowserSession {
	familyId: string;
	current: boolean;
	createdAt: string | null;
	lastActiveAt: string | null;
	expiresAt: string | null;
	ip: string | null;
	userAgent: string | null;
}

export interface BrowserSessions {
	sessions: BrowserSession[];
	hasMore: boolean;
	accessTokenTtlMinutes: number;
}

export const getBrowserSessions = (signal?: AbortSignal): Promise<BrowserSessions> =>
	api.get({ url: "/tokens/sessions" }, signal ? { signal } : undefined);

export const revokeBrowserSession = (familyId: string): Promise<{ revoked: boolean }> =>
	api.del({ url: `/tokens/sessions/${encodeURIComponent(familyId)}` });

export const revokeOtherBrowserSessions = (): Promise<{ revoked: number }> =>
	api.del({ url: "/tokens/sessions/others" });
