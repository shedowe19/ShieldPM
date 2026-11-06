import express from "express";
import rateLimit from "express-rate-limit";
import internalDatabase from "../internal/database.js";
import { authorizeOperation, cancelDatabaseOperation, publicOperation, readOperation } from "../lib/database-switch.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import schema from "../schema/components/database-input.json" with { type: "json" };

const router = express.Router({ caseSensitive: true, strict: true });
router.use((_req, res, next) => {
	res.setHeader("Cache-Control", "no-store");
	next();
});
router.get("/operation", (req, res) => {
	const operation = readOperation();
	if (!authorizeOperation(operation, req.query.id, req.headers["x-database-operation-token"]))
		throw new errs.PermissionError();
	res.send(publicOperation(operation));
});
router.post("/operation/cancel", (req, res) => {
	try {
		cancelDatabaseOperation(req.body?.id, req.headers["x-database-operation-token"]);
		res.send({ state: "cancelled" });
	} catch {
		throw new errs.ValidationError("Only a failed migration before activation can be acknowledged");
	}
});
router.use(jwtdecode());
router.use(
	rateLimit({
		windowMs: 60_000,
		limit: 20,
		keyGenerator: () => "database-administration",
		standardHeaders: "draft-8",
		legacyHeaders: false,
	}),
);
const validated = async (input, requestSchema) => {
	try {
		return await apiValidator(requestSchema, input);
	} catch {
		throw new errs.ValidationError("Invalid database request");
	}
};
router.get("/", async (_req, res) => res.send(await internalDatabase.get(res.locals.access)));
router.post("/test", async (req, res) =>
	res.send(await internalDatabase.test(res.locals.access, await validated(req.body, schema))),
);
router.post("/switch", async (req, res) => {
	const input = await validated(req.body, {
		type: "object",
		additionalProperties: false,
		required: ["target", "confirm", "confirmExclusive"],
		properties: { target: schema, confirm: { const: true }, confirmExclusive: { const: true } },
	});
	const operation = await internalDatabase.switch(res.locals.access, input);
	res.once("finish", () => process.exit(75));
	res.status(202).send(operation);
});
export default router;
