import cookieParser from "cookie-parser";
import express from "express";
import fileUpload from "express-fileupload";
import helmet from "helmet";
import analyticsService from "./internal/analytics.js";
import { doubleCsrf } from "csrf-csrf";
import jwt from "./lib/express/jwt.js";
import { debug, express as logger } from "./logger.js";
import mainRoutes from "./routes/main.js";

// Initialize Analytics Service (starts tailing logs)
analyticsService.init();

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
	getSessionIdentifier: (_req) => "stateless-session",
});

app.use(cookieParser());
app.use(doubleCsrfProtection);

// Generate Token and set cookie/local
app.use((req, res, next) => {
	const token = generateCsrfToken(req, res);
	res.locals.csrfToken = token;
	next();
});

app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * General Logging, BEFORE routes
 */

app.disable("x-powered-by");
app.set("trust proxy", true);
app.enable("strict routing");

// pretty print JSON when not live
app.set("json spaces", 2);

import checkDemoMode from "./lib/express/demo.js";

app.use(checkDemoMode);

app.use(jwt());
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
