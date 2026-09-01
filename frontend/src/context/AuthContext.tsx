import { useQueryClient } from "@tanstack/react-query";
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useIntervalWhen } from "rooks";
import { getToken, loginAsUser, refreshToken, restoreSession, type TokenResponse } from "src/api/backend";
import * as api from "src/api/backend/base";
import { ApiError } from "src/api/backend/base";
import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";
import { serializeSessionMutation } from "src/modules/SessionMutationQueue";

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

	const handleTokenUpdate = useCallback((response: TokenResponse) => {
		setAuthenticated(AuthStore.set(response));
	}, []);

	const completeLogin = useCallback(
		(response: TokenResponse) => {
			queryClient.clear();
			handleTokenUpdate(response);
		},
		[handleTokenUpdate, queryClient],
	);

	const refreshSession = useCallback(async () => {
		const retryDelays = [150, 350, 750];
		for (let attempt = 0; ; attempt += 1) {
			try {
				return await serializeSessionMutation(refreshToken);
			} catch (error) {
				if (!(error instanceof ApiError) || error.status !== 409 || attempt >= retryDelays.length) {
					throw error;
				}
				await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
			}
		}
	}, []);

	// On mount, try to refresh token (via cookie) to restore session
	useEffect(() => {
		refreshSession()
			.then(handleTokenUpdate)
			.catch(() => {
				// No session or expired
				setAuthenticated(false);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [handleTokenUpdate, refreshSession]);

	useEffect(() => {
		const handleAuthenticationExpired = () => setAuthenticated(false);

		window.addEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
		return () => window.removeEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
	}, []);

	const login = async (identity: string, secret: string) => {
		const response = await serializeSessionMutation(() => getToken(identity, secret));
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
		const response = await serializeSessionMutation(() => loginAsUser(id));
		AuthStore.add(response);
		queryClient.clear();
		setSessionVersion((version) => version + 1);
	};

	const logout = async () => {
		await serializeSessionMutation(async () => {
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
		});
	};

	const refresh = async () => {
		try {
			const response = await refreshSession();
			handleTokenUpdate(response);
		} catch (error) {
			if (!(error instanceof ApiError) || error.status !== 401) {
				console.warn("Session refresh failed", error);
			}
		}
	};

	useIntervalWhen(
		() => {
			if (authenticated) {
				refresh();
			}
		},
		tokenRefreshInterval,
		true,
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
