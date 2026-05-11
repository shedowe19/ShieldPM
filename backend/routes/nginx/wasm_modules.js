import express from "express";
import multer from "multer";
import internalWasmModule from "../../internal/wasm_module.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import validator from "../../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const upload = multer({ storage: multer.memoryStorage() });

router
	.route("/")
	.options((_req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						expand: { $ref: "common#/properties/expand" },
						query: { $ref: "common#/properties/query" },
					},
				},
				{
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
					query: typeof req.query.query === "string" ? req.query.query : null,
				},
			);
			const rows = await internalWasmModule.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		} catch (err) {
			next(err);
		}
	})
	.post(upload.single("wasm_file"), async (req, res, next) => {
		try {
			if (!req.file || !req.file.buffer) {
				return res.status(400).send({ error: "Missing wasm_file" });
			}

			const payload = await apiValidator(
				{
					required: ["name"],
					additionalProperties: false,
					properties: {
						name: { type: "string", minLength: 1 },
						description: { type: "string" },
						meta: { type: "object" },
					},
				},
				{
					name: req.body.name,
					description: req.body.description || "",
					meta: req.body.meta ? JSON.parse(req.body.meta) : {},
				},
			);

			const row = await internalWasmModule.create(res.locals.access, {
				...payload,
				file_name: req.file.originalname,
				file_content: req.file.buffer,
			});
			res.status(201).send(row);
		} catch (err) {
			next(err);
		}
	});

router
	.route("/:id")
	.options((_req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["id"],
					additionalProperties: false,
					properties: {
						id: { $ref: "common#/properties/id" },
						expand: { $ref: "common#/properties/expand" },
					},
				},
				{
					id: req.params.id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await internalWasmModule.get(res.locals.access, {
				id: Number.parseInt(data.id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		} catch (err) {
			next(err);
		}
	})
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(
				{
					additionalProperties: false,
					properties: {
						name: { type: "string", minLength: 1 },
						description: { type: "string" },
						meta: { type: "object" },
					},
				},
				req.body,
			);
			const row = await internalWasmModule.update(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
				...payload,
			});
			res.status(200).send(row);
		} catch (err) {
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["id"],
					additionalProperties: false,
					properties: {
						id: { $ref: "common#/properties/id" },
					},
				},
				{ id: req.params.id },
			);
			await internalWasmModule.delete(res.locals.access, { id: Number.parseInt(data.id, 10) });
			res.status(200).send({ true: true });
		} catch (err) {
			next(err);
		}
	});

export default router;
