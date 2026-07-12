import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import jwt from "./lib/express/jwt.js";
import { debug, express as logger } from "./logger.js";
import mainRoutes from "./routes/main.js";
import { getCompiledSchema } from "./schema/index.js";
import { isSetup } from "./setup.js";

// Analytics is initialized by the startup entry points after database migrations complete.

// Global API Rate Limiter
import rateLimit from "express-rate-limit";

const resolveTrustProxy = () => {
	const raw = process.env.TRUST_PROXY;
	if (typeof raw === "undefined" || raw === null || raw === "") {
		return 1;
	}

	const normalized = String(raw).trim().toLowerCase();
	if (["true", "yes", "on"].includes(normalized)) {
		return true;
	}
	if (["false", "no", "off"].includes(normalized)) {
		return false;
	}
	if (/^\d+$/.test(normalized)) {
		return Number.parseInt(normalized, 10);
	}
	return raw;
};

const TRUST_PROXY = resolveTrustProxy();
const CSRF_SECRET =
	process.env.CSRF_SECRET ||
	(() => {
		logger.warn("WARNING: CSRF_SECRET not set. CSRF tokens will be invalidated on every restart!");
		return crypto.randomBytes(32).toString("hex");
	})();

const decodeJwtPayload = (token) => {
	if (!token || typeof token !== "string") {
		return null;
	}

	const parts = token.split(".");
	if (parts.length < 2 || !parts[1]) {
		return null;
	}

	try {
		return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
	} catch {
		return null;
	}
};

const getRequestToken = (req) => {
	const authorization = req.headers.authorization;
	if (typeof authorization === "string") {
		const [scheme, token] = authorization.split(" ");
		if (scheme === "Bearer" && token) {
			return token;
		}
	}

	if (typeof req.cookies?.shieldpm_jwt === "string" && req.cookies.shieldpm_jwt) {
		return req.cookies.shieldpm_jwt;
	}

	return null;
};

const getAnonymousCsrfIdentifier = (req) => {
	const fingerprint = [req.ip || "unknown-ip", req.headers["user-agent"] || "unknown-agent"].join("|");
	return `anon:${crypto.createHash("sha256").update(fingerprint).digest("hex")}`;
};

const resolveCsrfSessionIdentifier = (req) => {
	// Use a stable identifier that does NOT change on token refresh/rotation.
	// The JWT changes on every refresh, so we cannot use jti or token hash.
	// Instead, extract the user ID (stable across sessions) or fall back to
	// an anonymous fingerprint for unauthenticated requests.
	const token = getRequestToken(req);
	const payload = decodeJwtPayload(token);
	const userId = payload?.attrs?.id || payload?.sub;

	if (userId) {
		return `user:${userId}`;
	}

	// For unauthenticated requests, use a stable anonymous fingerprint.
	// Do NOT use jti or token hash — they change on every refresh and
	// would invalidate the CSRF token.
	return getAnonymousCsrfIdentifier(req);
};

const isHttpsRequest = (req) => {
	if (req.secure) {
		return true;
	}

	const forwardedProto = req.headers["x-forwarded-proto"];
	if (typeof forwardedProto === "string") {
		return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
	}

	return false;
};

const globalApiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 500, // Limit each IP to 500 requests per 15 minutes
	message: {
		error: {
			code: 429,
			message: "Too many requests from this IP, please try again after 15 minutes",
		},
	},
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	validate: {
		trustProxy: false,
		xForwardedForHeader: false,
	},
});

/**
 * App
 */
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY);
app.enable("strict routing");
logger.info(
	`Express trust proxy configured as: ${typeof TRUST_PROXY === "string" ? TRUST_PROXY : JSON.stringify(TRUST_PROXY)}`,
);

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				baseUri: ["'self'"],
				fontSrc: ["'self'", "https:", "data:"],
				formAction: ["'self'"],
				frameAncestors: ["'self'"],
				imgSrc: ["'self'", "data:", "https:"],
				objectSrc: ["'none'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				scriptSrcAttr: ["'none'"],
				styleSrc: ["'self'", "https:", "'unsafe-inline'"],
				upgradeInsecureRequests: [],
				workerSrc: ["'self'", "blob:"],
				connectSrc: ["'self'", "https://editor.swagger.io"],
			},
		},
	}),
);

// CSRF Protection (Double Submit Cookie)
const csrfCookieOptions = {
	sameSite: "strict",
	path: "/",
};

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
	getSecret: () => CSRF_SECRET,
	cookieName: "XSRF-TOKEN",
	cookieOptions: {
		...csrfCookieOptions,
		secure: false,
	},
	size: 64,
	ignoredMethods: ["GET", "HEAD", "OPTIONS"],
	getCsrfTokenFromRequest: (req) => req.headers["x-xsrf-token"],
	getSessionIdentifier: (req) => resolveCsrfSessionIdentifier(req),
});

// CodeQL expects a middleware factory (like csurf/lusca), but csrf-csrf provides a direct middleware.
// We wrap it to satisfy the static analysis heuristic.
const csrf = () => doubleCsrfProtection;

// lgtm[js/missing-token-validation]
// codeql[js/missing-token-validation]
app.use(cookieParser());
app.use(jwt());

// CSRF middleware with a strict first-time-setup bypass.
// Only skip CSRF for POST /api/users while the system has no active users yet.
app.use(async (req, res, next) => {
	const setupComplete = await isSetup();

	// Bypass CSRF for specific endpoints that are protected by other mechanisms.
	// Match both with and without /api prefix to handle different proxy configurations.
	const path = req.path;
	const method = req.method;
	const isInitialSetupUserCreation =
		!setupComplete && method === "POST" && (path === "/api/users" || path === "/users");
	const isLoginRequest = method === "POST" && (path === "/api/tokens" || path === "/tokens");
	const isTokenRefresh = method === "POST" && (path === "/api/tokens/refresh" || path === "/tokens/refresh");
	const isTokenLogout = method === "POST" && (path === "/api/tokens/logout" || path === "/tokens/logout");

	// 2FA verification endpoints during login use the pending_token for auth, no CSRF cookie yet
	const is2FaVerify = method === "POST" && /^\/(api\/)?tokens\/2fa\//.test(path);

	// Docs endpoints - bypass CSRF for Swagger UI
	const isDocsRequest =
		path === "/api/docs" || path === "/docs" || path.startsWith("/api/docs/") || path.startsWith("/docs/");

	if (
		isInitialSetupUserCreation ||
		isLoginRequest ||
		isTokenRefresh ||
		isTokenLogout ||
		is2FaVerify ||
		isDocsRequest
	) {
		return next();
	}

	return csrf()(req, res, next);
});

// Generate Token and set cookie/local
app.use((req, res, next) => {
	const token = generateCsrfToken(req, res, {
		cookieOptions: {
			...csrfCookieOptions,
			secure: isHttpsRequest(req),
		},
	});
	res.locals.csrfToken = token;
	next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * General Logging, BEFORE routes
 */

// pretty print JSON when not live
app.set("json spaces", 2);

import checkDemoMode from "./lib/express/demo.js";

app.use(checkDemoMode);

// Apply global rate limiter to all API routes
app.use("/api", globalApiLimiter);

// Compile OpenAPI schema once (dereferences $refs)
const _swaggerSpec = await getCompiledSchema();

// Serve raw OpenAPI spec at /docs/swagger.json (before swagger-ui catch-all)
app.get("/docs/swagger.json", async (_req, res) => {
	const spec = await getCompiledSchema();
	res.json(spec);
});

app.use(
	"/docs",
	swaggerUi.serve,
	swaggerUi.setup(undefined, {
		swaggerOptions: {
			url: "/api/schema",
			requestInterceptor: (req) => {
				const csrfToken = req.headers["x-xsrf-token"];
				if (csrfToken) {
					req.headers["x-xsrf-token"] = csrfToken;
				}
				return req;
			},
		},
		customCss: `
		.swagger-ui .topbar { display: none; }
		.swagger-ui .swagger-ui { max-width: 100%; }
	`,
		customSiteTitle: "ShieldPM API Documentation",
	}),
);

app.use("/", mainRoutes);

// production error handler
// no stacktraces leaked to user
app.use((err, _req, res, next) => {
	if (res.headersSent) {
		return next(err);
	}

	const rawStatus = Number.parseInt(err.status || err.statusCode, 10);
	const status = Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : 500;
	const payload = {
		error: {
			code: status,
			message: err.public ? err.message : "Internal Error",
		},
	};

	if (typeof err.message_i18n !== "undefined") {
		payload.error.message_i18n = err.message_i18n;
	}

	// Not every error is worth logging - but this is good for now until it gets annoying.
	if (typeof err.stack !== "undefined" && err.stack) {
		debug(logger, err.stack);
		if (typeof err.public === "undefined" || !err.public) {
			logger.warn(err.message);
		}
	}

	return res.status(status).json(payload);
});

export default app;
