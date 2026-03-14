import express from "express";
import PACKAGE from "../package.json" with { type: "json" };
import { getCompiledSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /schema
	 */
	.get(async (req, res) => {
		const swaggerJSON = await getCompiledSchema();
		const origin = `${req.protocol}://${req.hostname}`;

		swaggerJSON.info.version = PACKAGE.version;
		swaggerJSON.servers[0].url = `${origin}/api`;
		res.status(200).send(swaggerJSON);
	});

export default router;
