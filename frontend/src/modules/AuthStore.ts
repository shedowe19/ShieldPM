export const TOKEN_KEY = "authentications";

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

	// Set session details from login response
	set(data: { expires: number; user?: { id: number } }) {
		this.state = {
			expires: data.expires,
			userId: data.user?.id
		};
	}

	// Add is alias for Set in cookie mode
	add(data: { expires: number; user?: { id: number } }) {
		this.set(data);
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
}

export default new AuthStore();
