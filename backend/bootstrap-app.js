import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { databaseDirectory, inspectDatabaseSelection } from "./lib/database-config.js";
import {
	authorizeOperation,
	cancelDatabaseOperation,
	commitDatabaseOperation,
	databaseStatus,
	executeDatabaseOperation,
	needsDatabaseSetup,
	publicOperation,
	readOperation,
	requestDatabaseOperation,
	testDatabase,
} from "./lib/database-switch.js";
import apiValidator from "./lib/validator/api.js";
import pjson from "./package.json" with { type: "json" };
import databaseSchema from "./schema/components/database-input.json" with { type: "json" };

const safeEqual = (left, right) =>
	typeof left === "string" &&
	typeof right === "string" &&
	left.length === right.length &&
	crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));

/** This app deliberately imports no model, JWT, settings service or normal route. */
export const createBootstrapApp = ({
	setupRequired = false,
	unavailable = false,
	onSetup = () => {},
	onCancel = () => {},
} = {}) => {
	const app = express();
	let showSetup = setupRequired;
	const csrfSecret = crypto.randomBytes(32).toString("hex");
	const csrfValue = (value) => crypto.createHmac("sha256", csrfSecret).update(value).digest("hex");
	app.disable("x-powered-by");
	app.use(helmet());
	// A Unix socket has no remote IP. Bootstrap is intentionally bounded globally,
	// without trusting caller-provided forwarded addresses before normal app startup.
	app.use(
		rateLimit({
			windowMs: 60_000,
			limit: 120,
			keyGenerator: () => "database-bootstrap",
			standardHeaders: "draft-8",
			legacyHeaders: false,
		}),
	);
	app.use(cookieParser());
	app.use(express.json({ limit: "16kb" }));
	app.use((req, res, next) => {
		res.setHeader("Cache-Control", "no-store");
		if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
		const value = req.cookies["DB-SETUP-CSRF"];
		if (!value || !safeEqual(req.headers["x-xsrf-token"], csrfValue(value)))
			return res
				.status(403)
				.send({ error: { code: 403, message: "Invalid CSRF token", reason: "EBADCSRFTOKEN" } });
		if (req.headers["sec-fetch-site"] === "cross-site")
			return res.status(403).send({ error: { code: 403, message: "Cross-site request rejected" } });
		next();
	});
	const router = express.Router();
	router.get("/", (req, res) => {
		const existing = req.cookies["DB-SETUP-CSRF"];
		const value =
			typeof existing === "string" && /^[0-9a-f]{64}$/.test(existing)
				? existing
				: crypto.randomBytes(32).toString("hex");
		res.cookie("DB-SETUP-CSRF", value, { httpOnly: true, sameSite: "strict", path: "/" });
		res.send({
			status: unavailable ? "UNAVAILABLE" : showSetup ? "OK" : "MAINTENANCE",
			setup: false,
			version: pjson.version,
			demo: process.env.DEMO_MODE === "true",
			databaseSetupRequired: showSetup,
			databaseMaintenance: !showSetup,
			csrfToken: csrfValue(value),
		});
	});
	router.get("/database", (_req, res) => {
		if (!showSetup)
			return res.status(503).send({ error: { code: 503, message: "Database maintenance in progress" } });
		res.send({
			...databaseStatus(),
			engine: null,
			configured: false,
			connection: null,
			supportedTransitions: ["sqlite", "mysql2", "pg"],
		});
	});
	router.get("/database/operation", (req, res) => {
		const operation = readOperation();
		if (!authorizeOperation(operation, req.query.id, req.headers["x-database-operation-token"]))
			return res.status(403).send({ error: { code: 403, message: "Permission denied" } });
		res.send(publicOperation(operation));
	});
	router.post("/database/test", async (req, res) => {
		if (!showSetup) return res.sendStatus(503);
		try {
			res.send(await testDatabase(await apiValidator(databaseSchema, req.body)));
		} catch {
			res.status(400).send({
				error: {
					code: 400,
					message:
						"Cannot use the target database. Check connectivity, credentials, TLS and that it is empty.",
				},
			});
		}
	});
	let choosing = false;
	router.post("/database/setup", async (req, res) => {
		if (!showSetup || choosing) return res.sendStatus(409);
		try {
			const operation = requestDatabaseOperation(await apiValidator(databaseSchema, req.body), true);
			choosing = true;
			res.once("finish", () => onSetup());
			res.status(202).send(operation);
		} catch {
			res.status(400).send({ error: { code: 400, message: "Invalid database setup request" } });
		}
	});
	router.post("/database/operation/cancel", (req, res) => {
		try {
			const kind = cancelDatabaseOperation(req.body?.id, req.headers["x-database-operation-token"]);
			choosing = false;
			if (kind === "setup") showSetup = true;
			else res.once("finish", () => onCancel());
			res.send({ state: "cancelled" });
		} catch {
			res.status(409).send({
				error: { code: 409, message: "Only a failed migration before activation can be acknowledged" },
			});
		}
	});
	app.use("/api", router);
	app.use("/", router);
	app.use((_req, res) =>
		res.status(503).send({ error: { code: 503, message: "Database setup or maintenance required" } }),
	);
	app.use((_error, _req, res, _next) =>
		res.status(400).send({ error: { code: 400, message: "Invalid database request" } }),
	);
	return app;
};

/** Fence processes sharing this data volume; independently hosted writers require operator shutdown. */
export const claimStartupLock = () => {
	fs.mkdirSync(databaseDirectory(), { recursive: true, mode: 0o700 });
	const filename = path.join(databaseDirectory(), "database-runtime-lock.sqlite");
	const lock = new Database(filename, { timeout: 0 });
	fs.chmodSync(filename, 0o600);
	try {
		lock.exec("BEGIN IMMEDIATE");
	} catch {
		lock.close();
		throw new Error("Another ShieldPM process holds the database runtime lock");
	}
	// Kernel locks disappear on process death; no PID reuse or stale-file deletion race.
	process.once("exit", () => lock.close());
};

/** Resolves only when DB selection/recovery is safe; normal app imports must follow this await. */
export const prepareDatabaseStartup = async ({ development = false } = {}) => {
	claimStartupLock();
	let setupRequired = false;
	let unavailable = false;
	try {
		setupRequired = await needsDatabaseSetup();
	} catch {
		unavailable = true;
	}
	const operation = readOperation();
	const failedSetup = operation?.kind === "setup" && operation.state === "failed";
	if (operation?.kind === "setup" && operation.state === "cancelled") setupRequired = true;
	const pending = operation && !["completed", "cancelled", "failed"].includes(operation.state);
	if (!setupRequired && !unavailable && !pending && !failedSetup) return;
	await new Promise((resolve) => {
		let server;
		let working = false;
		const run = async () => {
			if (working) return;
			working = true;
			try {
				await executeDatabaseOperation();
				// Durably pin the target before analytics/setup/services may write to it.
				commitDatabaseOperation();
				server.close(resolve);
			} catch {
				working = false;
			}
		};
		const app = createBootstrapApp({
			setupRequired: setupRequired && !pending && !unavailable && !failedSetup,
			unavailable,
			onSetup: run,
			onCancel: () => server.close(resolve),
		});
		if (development)
			server = app.listen(3000, "127.0.0.1", () => {
				if (pending) void run();
			});
		else {
			fs.mkdirSync("/run/shieldpm", { recursive: true });
			server = app.listen("/run/shieldpm/shieldpm.sock", () => {
				if (pending) void run();
			});
		}
		server.on("error", () => process.exit(1));
	});
	inspectDatabaseSelection();
};
