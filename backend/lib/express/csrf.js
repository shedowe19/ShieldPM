import { doubleCsrf } from "csrf-csrf";

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
	getSecret: () => "DevelopmentSecretKEYChangedInProd", // TODO: Move to config/env
	cookieName: "XSRF-TOKEN",
	cookieOptions: {
		sameSite: "strict",
		secure: true,
		path: "/",
	},
	size: 64,
	ignoredMethods: ["GET", "HEAD", "OPTIONS"],
	getCsrfTokenFromRequest: (req) => req.headers["x-xsrf-token"],
	// We are stateless (JWT in cookie), so we don't have a server-side session ID.
	// But double-csrf requires this if we want to bind the token to a user session.
	// Since we are using the Double Submit Cookie pattern, the "session" is effectively the browser context.
	// We can return a constant or random value here if we don't want session binding,
	// OR we can decrypt the JWT here and use the user ID.
	// For now, to satisfy the type and replicate previous behavior (which wasn't bound to session either),
	// we'll return a constant or undefined if allowed. The library uses this to hash with the secret.
	// If it's constant, then the token is valid for any user (if they have the cookie).
	// This is standard for simple Double Submit Cookie.
	getSessionIdentifier: (_req) => "stateless-session",
});

export const csrfToken = generateCsrfToken;
export default () => doubleCsrfProtection;
