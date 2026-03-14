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
		const clonedSwaggerJSON = structuredClone(swaggerJSON);
		const origin = `${req.protocol}://${req.get("host")}`;

		clonedSwaggerJSON.info = clonedSwaggerJSON.info || {};
		clonedSwaggerJSON.info.version = PACKAGE.version;
		if (!clonedSwaggerJSON.servers?.[0]) {
			clonedSwaggerJSON.servers = [{}];
		}
		clonedSwaggerJSON.servers[0].url = `${origin}/api`;
		res.status(200).send(clonedSwaggerJSON);
	});

export default router;
