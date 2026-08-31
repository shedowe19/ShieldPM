export const TOKEN_KEY = "authentications";
export const AUTHENTICATION_EXPIRED_EVENT = "shieldpm:authentication-expired";

// Model for memory store
interface AuthState {
	expires: number;
	userId?: number;
}

export class AuthStore {
	private state: AuthState | null = null;

	// Check if we have an active session in memory
	// Note: On page reload, this will be null until verified by API
	get active() {
		return this.state !== null;
	}

	get expires() {
		return this.state?.expires || null;
	}

	get userId() {
		return this.state?.userId || 0;
	}

	// Helper to check validity based on expiration
	hasActiveToken() {
		if (!this.state) return false;

		const now = Date.now();
		const oneMinuteBuffer = 60 * 1000;
		// TokenResponse.expires is number
		const expires = this.expires;

		if (expires && expires - oneMinuteBuffer > now) {
			return true;
		}

		this.clear();
		return false;
	}

	// Set session details from login/refresh response
	// Preserves existing userId if the response doesn't include user data (e.g. refresh)
	set(data: { expires: number | string; user?: { id: number } }) {
		const expires = typeof data.expires === "number" ? data.expires : new Date(data.expires).getTime();
		if (!Number.isFinite(expires) || expires <= Date.now()) {
			this.clear();
			return false;
		}
		this.state = {
			expires,
			userId: data.user?.id ?? this.state?.userId,
		};
		return true;
	}

	// Add is alias for Set in cookie mode
	add(data: { expires: number | string; user?: { id: number } }) {
		return this.set(data);
	}

	// Clear memory state
	clear() {
		this.state = null;
		// We can't clear httpOnly cookie here, API must do it
	}

	drop() {
		this.clear();
	}

	count() {
		return this.state ? 1 : 0;
	}

	// Legacy getter for backwards compat (returns null now)
	get token() {
		return null;
	}

	private _csrfToken: string | null = null;

	get csrfToken() {
		return this._csrfToken;
	}

	setCsrfToken(token: string) {
		this._csrfToken = token;
	}
}

export default new AuthStore();
