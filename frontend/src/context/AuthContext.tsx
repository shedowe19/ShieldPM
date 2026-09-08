import { useQueryClient } from "@tanstack/react-query";
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useIntervalWhen } from "rooks";
import { getToken, loginAsUser, refreshToken, restoreSession, type TokenResponse } from "src/api/backend";
import * as api from "src/api/backend/base";
import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";

// Context
export interface AuthContextType {
	authenticated: boolean;
	completeLogin: (response: TokenResponse) => void;
	login: (username: string, password: string) => Promise<void>;
	loginAs: (id: number) => Promise<void>;
	logout: () => void;
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
	const [loading, setLoading] = useState(true);
	const [sessionVersion, setSessionVersion] = useState(0);
	const [isDuoCallback] = useState(
		() => window.location.pathname.replace(/\/+$/, "").toLowerCase() === "/duo-callback",
	);
	const sessionGeneration = useRef(0);

	const handleTokenUpdate = useCallback((response: TokenResponse) => {
		AuthStore.set(response);
		setAuthenticated(true);
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
		const handleAuthenticationExpired = () => {
			sessionGeneration.current += 1;
			setAuthenticated(false);
		};

		window.addEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
		return () => window.removeEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
	}, []);

	const login = async (identity: string, secret: string) => {
		const response = await getToken(identity, secret);
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
		const response = await loginAsUser(id);
		sessionGeneration.current += 1;
		AuthStore.add(response, true);
		queryClient.clear();
		setSessionVersion((version) => version + 1);
	};

	const logout = async () => {
		sessionGeneration.current += 1;
		try {
			// Check if we have a backup admin session cookie on the backend
			const response = await restoreSession();
			AuthStore.add(response);
			queryClient.clear();
			setSessionVersion((version) => version + 1);
		} catch (_err) {
			// No backup session found or failed to restore, do a full logout
			AuthStore.clear();
			setAuthenticated(false);
			queryClient.clear();
			// Call API to clear cookie (uses internal client for CSRF)
			await api.post({ url: "/tokens/logout", silentAuth: true });
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

	const value = { authenticated, completeLogin, login, logout, loginAs, loading };

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
