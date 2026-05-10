import express from "express";
import multer from "multer";
import internalWasmModule from "../../internal/wasm_module.js";
import validator from "../../lib/validator.js";

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
	.all(validator())
	.get(async (req, res, next) => {
		try {
			const expand = typeof req.query.expand === "string" ? req.query.expand.split(",") : null;
			const searchQuery = typeof req.query.query === "string" ? req.query.query : null;

			const rows = await internalWasmModule.getAll(res.locals.access, expand, searchQuery);
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

			const data = {
				name: req.body.name,
				description: req.body.description || "",
				file_name: req.file.originalname,
				file_content: req.file.buffer,
				meta: req.body.meta ? JSON.parse(req.body.meta) : {},
			};

			const row = await internalWasmModule.create(res.locals.access, data);
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
	.all(validator({
		id: {
			in: ["params"],
			errorMessage: "ID is invalid",
			isInt: true,
			toInt: true,
		},
	}))
	.get(async (req, res, next) => {
		try {
			const expand = typeof req.query.expand === "string" ? req.query.expand.split(",") : null;
			const row = await internalWasmModule.get(res.locals.access, { id: req.params.id, expand });
			res.status(200).send(row);
		} catch (err) {
			next(err);
		}
	})
	.put(async (req, res, next) => {
		try {
			const row = await internalWasmModule.update(res.locals.access, {
				id: req.params.id,
				...req.body,
			});
			res.status(200).send(row);
		} catch (err) {
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await internalWasmModule.delete(res.locals.access, { id: req.params.id });
			res.status(200).send({ true: true });
		} catch (err) {
			next(err);
		}
	});

export default router;
