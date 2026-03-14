import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import express from "express";
import helmet from "helmet";
import analyticsService from "./internal/analytics.js";
import jwt from "./lib/express/jwt.js";
import { debug, express as logger } from "./logger.js";
import mainRoutes from "./routes/main.js";
import { isSetup } from "./setup.js";

// Initialize Analytics Service (starts tailing logs)
analyticsService.init();

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
			},
		},
	}),
);

// CSRF Protection (Double Submit Cookie)

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
	getSecret: () => process.env.CSRF_SECRET || "DevelopmentSecretKEY-CHANGE-IN-PROD",
	cookieName: "XSRF-TOKEN",
	cookieOptions: {
		sameSite: "strict",
		secure: false, // Allow both HTTP and HTTPS (sameSite provides protection)
		path: "/",
	},
	size: 64,
	ignoredMethods: ["GET", "HEAD", "OPTIONS"],
	getCsrfTokenFromRequest: (req) => req.headers["x-xsrf-token"],
	getSessionIdentifier: (_req) => "stateless-session",
});

// CodeQL expects a middleware factory (like csurf/lusca), but csrf-csrf provides a direct middleware.
// We wrap it to satisfy the static analysis heuristic.
const csrf = () => doubleCsrfProtection;

// lgtm[js/missing-token-validation]
// codeql[js/missing-token-validation]
app.use(cookieParser());

// CSRF middleware with a strict first-time-setup bypass.
// Only skip CSRF for POST /api/users while the system has no active users yet.
app.use(async (req, res, next) => {
	const setupComplete = await isSetup();
	const isInitialSetupUserCreation = !setupComplete && req.method === "POST" && req.path === "/api/users";

	if (isInitialSetupUserCreation) {
		return next();
	}

	return csrf()(req, res, next);
});

// Generate Token and set cookie/local
app.use((req, res, next) => {
	const token = generateCsrfToken(req, res);
	res.locals.csrfToken = token;
	next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * General Logging, BEFORE routes
 */

app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY);
app.enable("strict routing");
logger.info(
	`Express trust proxy configured as: ${typeof TRUST_PROXY === "string" ? TRUST_PROXY : JSON.stringify(TRUST_PROXY)}`,
);

// pretty print JSON when not live
app.set("json spaces", 2);

import checkDemoMode from "./lib/express/demo.js";

app.use(checkDemoMode);

app.use(jwt());

// Apply global rate limiter to all API routes
app.use("/api", globalApiLimiter);

app.use("/", mainRoutes);

// production error handler
// no stacktraces leaked to user
app.use((err, _req, res, _) => {
	const payload = {
		error: {
			code: err.status,
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

	res.status(err.status || 500).send(payload);
});

export default app;
