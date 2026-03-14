import express from "express";
import internalGitOps from "../internal/gitops.js";
import { isDemoMode } from "../lib/config.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Demo mode check middleware
 */
const demoCheck = (_req, res, next) => {
	if (isDemoMode()) {
		return res.status(403).json({
			error: {
				message: "GitOps is disabled in Demo Mode",
				code: 403,
			},
		});
	}
	next();
};

/**
 * Access check middleware
 */
const accessCheck = async (_req, res, next) => {
	try {
		await res.locals.access.can("settings:update", "gitops-config");
		next();
	} catch (err) {
		next(err);
	}
};

/**
 * GET /api/gitops/config
 * Get GitOps configuration
 */
router.get("/config", jwtdecode(), accessCheck, async (req, res, next) => {
	try {
		const config = await internalGitOps.getConfig();
		res.status(200).json(config);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * PUT /api/gitops/config
 * Update GitOps configuration
 */
router.put("/config", jwtdecode(), demoCheck, async (req, res, next) => {
	try {
		const config = await internalGitOps.updateConfig(res.locals.access, req.body);
		res.status(200).json(config);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * POST /api/gitops/test
 * Test repository connection
 */
router.post("/test", jwtdecode(), demoCheck, accessCheck, async (req, res, next) => {
	try {
		const result = await internalGitOps.testConnection();
		res.status(200).json(result);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * POST /api/gitops/export
 * Export current configuration to YAML files
 */
router.post("/export", jwtdecode(), demoCheck, accessCheck, async (req, res, next) => {
	try {
		const files = await internalGitOps.exportConfig();
		res.status(200).json({
			success: true,
			files_exported: files.length,
		});
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * POST /api/gitops/push
 * Commit and push changes to remote
 */
router.post("/push", jwtdecode(), demoCheck, accessCheck, async (req, res, next) => {
	try {
		const { message } = req.body;
		// First export, then push
		await internalGitOps.exportConfig();
		const result = await internalGitOps.commitAndPush(message);
		res.status(200).json(result);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * POST /api/gitops/pull
 * Pull from remote repository
 */
router.post("/pull", jwtdecode(), demoCheck, accessCheck, async (req, res, next) => {
	try {
		const result = await internalGitOps.pull();
		res.status(200).json(result);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * GET /api/gitops/history
 * Get commit history
 */
router.get("/history", jwtdecode(), accessCheck, async (req, res, next) => {
	try {
		const limit = Number.parseInt(/** @type {string} */ (req.query.limit), 10) || 20;
		const commits = await internalGitOps.getHistory(limit);
		res.status(200).json(commits);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * POST /api/gitops/revert
 * Revert to a specific commit
 */
router.post("/revert", jwtdecode(), demoCheck, async (req, res, next) => {
	try {
		const { sha } = req.body;
		if (!sha) {
			return res.status(400).json({
				error: { message: "SHA is required", code: 400 },
			});
		}
		const result = await internalGitOps.revertToCommit(res.locals.access, sha);
		res.status(200).json(result);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * POST /api/gitops/import
 * Import configuration from Git
 */
router.post("/import", jwtdecode(), demoCheck, async (req, res, next) => {
	try {
		const { overwrite } = req.body;
		const result = await internalGitOps.importConfig(res.locals.access, { overwrite: !!overwrite });
		res.status(200).json(result);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

export default router;
