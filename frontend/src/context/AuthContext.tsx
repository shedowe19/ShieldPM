import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useIntervalWhen } from "rooks";
import { getToken, loginAsUser, refreshToken, restoreSession, type TokenResponse } from "src/api/backend";
import * as api from "src/api/backend/base";
import AuthStore from "src/modules/AuthStore";

// Context
export interface AuthContextType {
	authenticated: boolean;
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

	const handleTokenUpdate = useCallback((response: TokenResponse) => {
		AuthStore.set(response);
		setAuthenticated(true);
	}, []);

	// On mount, try to refresh token (via cookie) to restore session
	useEffect(() => {
		refreshToken()
			.then(handleTokenUpdate)
			.catch(() => {
				// No session or expired
				setAuthenticated(false);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [handleTokenUpdate]);

	const login = async (identity: string, secret: string) => {
		const response = await getToken(identity, secret);
		// If the server requires 2FA, it returns an object with requires_2fa: true.
		// We surface this to the caller as a thrown value so the Login page can
		// switch to the 2FA step without treating it as an error.
		if (response && typeof response === "object" && "requires2fa" in response) {
			// Throw the challenge payload — Login/index.tsx catches it
			throw response;
		}
		handleTokenUpdate(response);
	};

	const loginAs = async (id: number) => {
		const response = await loginAsUser(id);
		AuthStore.add(response);
		queryClient.clear();
		window.location.reload();
	};

	const logout = async () => {
		try {
			// Check if we have a backup admin session cookie on the backend
			const response = await restoreSession();
			AuthStore.add(response);
			queryClient.clear();
			window.location.reload();
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
		const response = await refreshToken();
		handleTokenUpdate(response);
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

	const value = { authenticated, login, logout, loginAs, loading };

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
