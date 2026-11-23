import { useQueryClient } from "@tanstack/react-query";
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useIntervalWhen } from "rooks";
import { getToken, loginAsUser, refreshToken, restoreSession, type TokenResponse } from "src/api/backend";
import * as api from "src/api/backend/base";
import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";
import { showError } from "src/notifications";

// Context
export interface AuthContextType {
	authenticated: boolean;
	completeLogin: (response: TokenResponse) => void;
	impersonating: boolean;
	login: (username: string, password: string) => Promise<void>;
	loginAs: (id: number) => Promise<void>;
	/** Ends the session completely. Never restores an impersonated administrator. */
	logout: () => void;
	/**
	 * Explicitly return from an impersonated session to the administrator.
	 * Never call this implicitly: ending a session must not raise privileges.
	 */
	restoreAdminSession: () => Promise<void>;
	loading?: boolean;
}

const initalValue = null;
const AuthContext = createContext<AuthContextType | null>(initalValue);

// Provider
interface Props {
	children?: ReactNode;
	tokenRefreshInterval?: number;
}
function AuthProvider({ children, tokenRefreshInterval = 5 * 60 * 1000 }: Props) {
	const queryClient = useQueryClient();
	const [authenticated, setAuthenticated] = useState(false);
	const [impersonating, setImpersonating] = useState(false);
	const [loading, setLoading] = useState(true);
	const [sessionVersion, setSessionVersion] = useState(0);
	const [isDuoCallback] = useState(
		() => window.location.pathname.replace(/\/+$/, "").toLowerCase() === "/duo-callback",
	);
	const sessionGeneration = useRef(0);
	const logoutRequest = useRef(0);
	const mounted = useRef(true);

	const handleTokenUpdate = useCallback((response: TokenResponse) => {
		AuthStore.set(response);
		setAuthenticated(true);
		setImpersonating(false);
	}, []);

	const completeLogin = useCallback(
		(response: TokenResponse) => {
			sessionGeneration.current += 1;
			queryClient.clear();
			handleTokenUpdate(response);
		},
		[handleTokenUpdate, queryClient],
	);

	// On mount, try to refresh token (via cookie) to restore session
	useEffect(() => {
		// Locale changes remount this provider. The retained refresh cookie belongs
		// to the administrator, so keep an in-memory impersonated session intact.
		if (AuthStore.isImpersonating) {
			setAuthenticated(true);
			setImpersonating(true);
			setLoading(false);
			return;
		}

		// Duo establishes its session through the callback. A competing refresh
		// could expire its newly issued cookies after the callback succeeds.
		if (isDuoCallback) {
			setLoading(false);
			return;
		}

		let active = true;
		const generation = sessionGeneration.current;
		refreshToken()
			.then((response) => {
				if (active && generation === sessionGeneration.current) {
					handleTokenUpdate(response);
				}
			})
			.catch(() => {
				// No session or expired
				if (active && generation === sessionGeneration.current) {
					setAuthenticated(false);
				}
			})
			.finally(() => {
				if (active) {
					setLoading(false);
				}
			});
		return () => {
			active = false;
		};
	}, [handleTokenUpdate, isDuoCallback]);

	useEffect(() => {
		mounted.current = true;
		const handleAuthenticationExpired = () => {
			sessionGeneration.current += 1;
			setAuthenticated(false);
			setImpersonating(false);
		};

		window.addEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
		return () => {
			// A locale change replaces this provider while its requests may still be pending.
			mounted.current = false;
			logoutRequest.current += 1;
			sessionGeneration.current += 1;
			window.removeEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
		};
	}, []);

	const login = async (identity: string, secret: string) => {
		const generation = ++sessionGeneration.current;
		const response = await getToken(identity, secret);
		if (generation !== sessionGeneration.current) return;
		// If the server requires 2FA, it returns an object with requires_2fa: true.
		// We surface this to the caller as a thrown value so the Login page can
		// switch to the 2FA step without treating it as an error.
		if (response && typeof response === "object" && "requires2fa" in response) {
			// Throw the challenge payload — Login/index.tsx catches it
			throw response;
		}
		completeLogin(response);
	};

	const loginAs = async (id: number) => {
		const generation = ++sessionGeneration.current;
		const response = await loginAsUser(id);
		if (generation !== sessionGeneration.current) return;
		sessionGeneration.current += 1;
		AuthStore.add(response, true);
		setImpersonating(true);
		queryClient.clear();
		setSessionVersion((version) => version + 1);
	};

	/**
	 * Perform a real logout. This is the only path behind the "Sign out" action and
	 * intentionally never calls `restoreSession`: after an impersonation it must not
	 * silently turn the target user back into the administrator. `/tokens/logout`
	 * also clears the backup administrator cookie.
	 */
	const startFullLogout = async () => {
		const request = ++logoutRequest.current;
		setLoading(true);
		AuthStore.clear();
		setAuthenticated(false);
		setImpersonating(false);
		queryClient.clear();
		try {
			// Keep Login unmounted until this response has cleared the old cookies.
			await api.post({ url: "/tokens/logout", silentAuth: true });
		} catch (error) {
			if (mounted.current && request === logoutRequest.current) {
				showError(error instanceof Error ? error.message : String(error));
			}
		} finally {
			if (mounted.current && request === logoutRequest.current) {
				setLoading(false);
			}
		}
	};

	const logout = async () => {
		sessionGeneration.current += 1;
		await startFullLogout();
	};

	/**
	 * Explicitly leave an impersonated session and resume the administrator.
	 * Only wire this to a clearly labelled confirmation ("Return to administrator"),
	 * never to the regular sign-out action. If the backup session is gone, the user
	 * is signed out completely instead of staying on the impersonated identity.
	 */
	const restoreAdminSession = async () => {
		const generation = ++sessionGeneration.current;
		try {
			const response = await restoreSession();
			if (generation !== sessionGeneration.current) return;
			sessionGeneration.current += 1;
			AuthStore.add(response);
			setImpersonating(false);
			queryClient.clear();
			setSessionVersion((version) => version + 1);
		} catch (_err) {
			if (generation !== sessionGeneration.current) return;
			sessionGeneration.current += 1;
			await startFullLogout();
		}
	};

	const refresh = async () => {
		// Impersonation only replaces the access cookie; refreshing would silently
		// restore the administrator's identity without resetting the target's UI.
		if (AuthStore.isImpersonating) return;
		const generation = sessionGeneration.current;
		try {
			const response = await refreshToken();
			if (generation === sessionGeneration.current) {
				handleTokenUpdate(response);
			}
		} catch {
			// The silent refresh client clears AuthStore on 401. Network failures keep
			// the current session so the next interval can retry without logging out.
			if (generation === sessionGeneration.current && !AuthStore.active) {
				setAuthenticated(false);
			}
		}
	};

	useIntervalWhen(
		() => {
			if (authenticated) {
				return refresh();
			}
		},
		tokenRefreshInterval,
		authenticated,
	);

	const value = { authenticated, completeLogin, impersonating, login, logout, loginAs, loading, restoreAdminSession };

	return (
		<AuthContext.Provider value={value}>
			<Fragment key={sessionVersion}>{children}</Fragment>
		</AuthContext.Provider>
	);
}

function useAuthState() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuthState must be used within a AuthProvider");
	}
	return context;
}

export { AuthProvider, useAuthState };
export default AuthContext;
