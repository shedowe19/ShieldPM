import express from "express";
import internalGitOps from "../internal/gitops.js";
import { isDemoMode } from "../lib/config.js";
import jwtdecode from "../lib/express/jwt-decode.js";

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
	await res.locals.access.can("settings:update", "gitops-config");
	next();
};

/**
 * GET /api/gitops/config
 * Get GitOps configuration
 */
router.get("/config", jwtdecode(), accessCheck, async (_req, res) => {
	const config = await internalGitOps.getConfig();
	res.status(200).json(config);
});

/**
 * PUT /api/gitops/config
 * Update GitOps configuration
 */
router.put("/config", jwtdecode(), demoCheck, accessCheck, async (req, res) => {
	const config = await internalGitOps.updateConfig(res.locals.access, req.body);
	res.status(200).json(config);
});

/**
 * POST /api/gitops/test
 * Test repository connection
 */
router.post("/test", jwtdecode(), demoCheck, accessCheck, async (_req, res) => {
	const result = await internalGitOps.testConnection(res.locals.access);
	res.status(200).json(result);
});

/**
 * POST /api/gitops/export
 * Export current configuration to YAML files
 */
router.post("/export", jwtdecode(), demoCheck, accessCheck, async (_req, res) => {
	const files = await internalGitOps.exportConfig(res.locals.access);
	res.status(200).json({
		success: true,
		files_exported: files.length,
	});
});

/**
 * POST /api/gitops/push
 * Commit and push changes to remote
 */
router.post("/push", jwtdecode(), demoCheck, accessCheck, async (req, res) => {
	const { message } = req.body;
	// First export, then push
	await internalGitOps.exportConfig(res.locals.access);
	const result = await internalGitOps.commitAndPush(res.locals.access, message);
	res.status(200).json(result);
});

/**
 * POST /api/gitops/pull
 * Pull from remote repository
 */
router.post("/pull", jwtdecode(), demoCheck, accessCheck, async (_req, res) => {
	const result = await internalGitOps.pull(res.locals.access);
	res.status(200).json(result);
});

/**
 * GET /api/gitops/history
 * Get commit history
 */
router.get("/history", jwtdecode(), accessCheck, async (req, res) => {
	const limit = Number.parseInt(/** @type {string} */ (req.query.limit), 10) || 20;
	const commits = await internalGitOps.getHistory(res.locals.access, limit);
	res.status(200).json(commits);
});

/**
 * POST /api/gitops/revert
 * Revert to a specific commit
 */
router.post("/revert", jwtdecode(), demoCheck, accessCheck, async (req, res) => {
	const { sha } = req.body;
	if (!sha) {
		return res.status(400).json({
			error: { message: "SHA is required", code: 400 },
		});
	}
	const result = await internalGitOps.revertToCommit(res.locals.access, sha);
	res.status(200).json(result);
});

/**
 * POST /api/gitops/import
 * Import configuration from Git
 */
router.post("/import", jwtdecode(), demoCheck, accessCheck, async (req, res) => {
	const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
	const { overwrite, dry_run } = body;
	if (
		(overwrite !== undefined && typeof overwrite !== "boolean") ||
		(dry_run !== undefined && typeof dry_run !== "boolean") ||
		Object.keys(body).some((key) => !["overwrite", "dry_run"].includes(key))
	) {
		return res.status(400).json({ error: { message: "Invalid GitOps import options", code: 400 } });
	}
	const result = await internalGitOps.importConfig(res.locals.access, {
		overwrite: overwrite === true,
		dryRun: dry_run === true,
	});
	res.status(200).json(result);
});

export default router;
