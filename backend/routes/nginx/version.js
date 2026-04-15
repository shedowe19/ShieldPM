import express from "express";
import internalNginx from "../../internal/nginx.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET /api/nginx/version
 */
router.get("/", async (req, res) => {
	try {
		const version = await internalNginx.getVersion();
		res.status(200).send({ version });
	} catch (error) {
		res.status(500).send({ error: error.message });
	}
});

export default router;
