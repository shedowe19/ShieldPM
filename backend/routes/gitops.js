import express from "express";
import { gitOpsService } from "../modules/gitops/index.js";
import { isDemoMode } from "../lib/config.js";
import { auth } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";

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
const accessCheck = asyncHandler(async (_req, res, next) => {
	await res.locals.access.can("settings:update", "gitops-config");
	next();
});

/**
 * GET /api/gitops/config
 * Get GitOps configuration
 */
router.get(
	"/config",
	auth(),
	accessCheck,
	asyncHandler(async (_req, res) => {
		const config = await gitOpsService.getConfig();
		res.status(200).json(config);
	}),
);

/**
 * PUT /api/gitops/config
 * Update GitOps configuration
 */
router.put(
	"/config",
	auth(),
	demoCheck,
	asyncHandler(async (req, res) => {
		const config = await gitOpsService.updateConfig(res.locals.access, req.body);
		res.status(200).json(config);
	}),
);

/**
 * POST /api/gitops/test
 * Test repository connection
 */
router.post(
	"/test",
	auth(),
	demoCheck,
	accessCheck,
	asyncHandler(async (_req, res) => {
		const result = await gitOpsService.testConnection();
		res.status(200).json(result);
	}),
);

/**
 * POST /api/gitops/export
 * Export current configuration to YAML files
 */
router.post(
	"/export",
	auth(),
	demoCheck,
	accessCheck,
	asyncHandler(async (_req, res) => {
		const files = await gitOpsService.exportConfig();
		res.status(200).json({
			success: true,
			files_exported: files.length,
		});
	}),
);

/**
 * POST /api/gitops/push
 * Commit and push changes to remote
 */
router.post(
	"/push",
	auth(),
	demoCheck,
	accessCheck,
	asyncHandler(async (req, res) => {
		const { message } = req.body;
		// First export, then push
		await gitOpsService.exportConfig();
		const result = await gitOpsService.commitAndPush(message);
		res.status(200).json(result);
	}),
);

/**
 * POST /api/gitops/pull
 * Pull from remote repository
 */
router.post(
	"/pull",
	auth(),
	demoCheck,
	accessCheck,
	asyncHandler(async (_req, res) => {
		const result = await gitOpsService.pull();
		res.status(200).json(result);
	}),
);

/**
 * GET /api/gitops/history
 * Get commit history
 */
router.get(
	"/history",
	auth(),
	accessCheck,
	asyncHandler(async (req, res) => {
		const limit = Number.parseInt(/** @type {string} */ (req.query.limit), 10) || 20;
		const commits = await gitOpsService.getHistory(limit);
		res.status(200).json(commits);
	}),
);

/**
 * POST /api/gitops/revert
 * Revert to a specific commit
 */
router.post(
	"/revert",
	auth(),
	demoCheck,
	accessCheck,
	asyncHandler(async (req, res) => {
		const { sha } = req.body;
		if (!sha) {
			return res.status(400).json({
				error: { message: "SHA is required", code: 400 },
			});
		}
		const result = await gitOpsService.revertToCommit(res.locals.access, sha);
		res.status(200).json(result);
	}),
);

/**
 * POST /api/gitops/import
 * Import configuration from Git
 */
router.post(
	"/import",
	auth(),
	demoCheck,
	asyncHandler(async (req, res) => {
		const { overwrite } = req.body;
		const result = await gitOpsService.importConfig(res.locals.access, { overwrite: !!overwrite });
		res.status(200).json(result);
	}),
);

export default router;
