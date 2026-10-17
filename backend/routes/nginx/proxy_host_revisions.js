import express from "express";
import revisions from "../../internal/host-revisions.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import validator from "../../lib/validator/index.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
router.use(jwtdecode());
const ids = (req) =>
	validator(
		{
			type: "object",
			required: ["host_id", "revision_id"],
			additionalProperties: false,
			properties: { host_id: { $ref: "common#/properties/id" }, revision_id: { $ref: "common#/properties/id" } },
		},
		{ host_id: req.params.host_id, revision_id: req.params.revision_id },
	);
router.get("/", async (req, res) => {
	const result = await validator(
		{ type: "object", required: ["host_id"], properties: { host_id: { $ref: "common#/properties/id" } } },
		{ host_id: req.params.host_id },
	);
	res.send(await revisions.list(res.locals.access, Number(result.host_id)));
});
router.get("/:revision_id/plan", async (req, res) => {
	const result = await ids(req);
	res.send(await revisions.plan(res.locals.access, Number(result.host_id), Number(result.revision_id)));
});
router.post("/:revision_id/restore", async (req, res) => {
	const result = await ids(req);
	const body = await validator(
		{
			type: "object",
			required: ["expected_fingerprint"],
			additionalProperties: false,
			properties: { expected_fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" } },
		},
		req.body ?? {},
	);
	res.send(
		await revisions.restore(
			res.locals.access,
			Number(result.host_id),
			Number(result.revision_id),
			body.expected_fingerprint,
		),
	);
});
export default router;
