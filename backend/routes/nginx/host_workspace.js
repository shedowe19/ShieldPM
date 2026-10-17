import express from "express";
import internalHostWorkspace from "../../internal/host-workspace.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import validator from "../../lib/validator/index.js";

const router = express.Router({ caseSensitive: true, strict: true });
router.use(jwtdecode());
const idSchema = {
	type: "object",
	required: ["id"],
	additionalProperties: false,
	properties: { id: { type: "integer", minimum: 1 } },
};
const tags = { type: "array", maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 32 } };
const filters = {
	type: "object",
	additionalProperties: false,
	properties: {
		query: { type: "string", maxLength: 255 },
		tags,
		enabled: { type: "boolean" },
		monitor: { enum: ["up", "down", "unknown", "paused"] },
		certificate_days: { type: "integer", minimum: 0, maximum: 365 },
		limit: { type: "integer", minimum: 1, maximum: 100 },
		page: { type: "integer", minimum: 1 },
	},
};
const itemSchema = {
	type: "object",
	required: ["kind", "name", "definition"],
	additionalProperties: false,
	properties: {
		kind: { enum: ["view", "profile"] },
		name: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" },
		definition: {
			type: "object",
			oneOf: [
				filters,
				{
					type: "object",
					required: ["settings"],
					additionalProperties: false,
					properties: { settings: { type: "object", minProperties: 1 } },
				},
			],
		},
	},
};
const previewSchema = {
	type: "object",
	required: ["profile_id", "host_ids"],
	additionalProperties: false,
	properties: {
		profile_id: { type: "integer", minimum: 1 },
		host_ids: {
			type: "array",
			minItems: 1,
			maxItems: 100,
			uniqueItems: true,
			items: { type: "integer", minimum: 1 },
		},
	},
};
const applySchema = {
	type: "object",
	required: ["plan"],
	additionalProperties: false,
	properties: { plan: { type: "string", minLength: 1, maxLength: 100000 } },
};
const parseId = async (raw) => (await validator(idSchema, { id: raw })).id;

router.get("/options", async (req, res) => {
	const data = await validator(
		{ type: "object", additionalProperties: false, properties: { query: { type: "string", maxLength: 255 } } },
		{ query: req.query.query ?? "" },
	);
	res.send(await internalHostWorkspace.options(res.locals.access, data.query));
});
router.get("/hosts", async (req, res) => {
	const data = await validator(filters, {
		...req.query,
		...(typeof req.query.tags === "string" ? { tags: req.query.tags ? req.query.tags.split(",") : [] } : {}),
	});
	res.send(await internalHostWorkspace.hosts(res.locals.access, data));
});
router.put("/hosts/:id/tags", async (req, res) => {
	const data = await validator(
		{ type: "object", required: ["tags"], additionalProperties: false, properties: { tags } },
		req.body,
	);
	res.send(await internalHostWorkspace.setTags(res.locals.access, await parseId(req.params.id), data.tags));
});
router.get("/items", async (_req, res) => res.send(await internalHostWorkspace.list(res.locals.access)));
router.post("/items", async (req, res) =>
	res.status(201).send(await internalHostWorkspace.save(res.locals.access, await validator(itemSchema, req.body))),
);
router.put("/items/:id", async (req, res) =>
	res.send(
		await internalHostWorkspace.save(res.locals.access, {
			...(await validator(itemSchema, req.body)),
			id: await parseId(req.params.id),
		}),
	),
);
router.delete("/items/:id", async (req, res) => {
	const data = await validator(
		{
			type: "object",
			required: ["kind"],
			additionalProperties: false,
			properties: { kind: { enum: ["view", "profile"] } },
		},
		{ kind: req.query.kind },
	);
	await internalHostWorkspace.remove(res.locals.access, await parseId(req.params.id), data.kind);
	res.sendStatus(204);
});
router.post("/bulk/preview", async (req, res) => {
	const data = await validator(previewSchema, req.body);
	res.send(await internalHostWorkspace.preview(res.locals.access, data.profile_id, data.host_ids));
});
router.post("/bulk/apply", async (req, res) =>
	res.send(await internalHostWorkspace.apply(res.locals.access, (await validator(applySchema, req.body)).plan)),
);
export default router;
