import express from "express";
import multer from "multer";
import os from "node:os";
import internalWasmModule from "../../internal/wasm-module.js";
import { jwtDecode } from "../../lib/express-middlewares.js";
import validator from "../../lib/validator.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const upload = multer({ dest: os.tmpdir() });

/**
 * /api/nginx/wasm-modules
 */
router
	.route("/")
	.options((req, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /api/nginx/wasm-modules
	 *
	 * Retrieve all WASM modules
	 */
	.get(jwtDecode(), async (req, res, next) => {
		try {
			const result = await internalWasmModule.getAll(res.locals.access, req.query.expand);
			res.status(200).send(result);
		} catch (err) {
			next(err);
		}
	})

	/**
	 * POST /api/nginx/wasm-modules
	 *
	 * Create a new WASM module
	 */
	.post(
		jwtDecode(),
		upload.single("wasm_file"),
		validator({
			type: "object",
			properties: {
				name: { type: "string" },
				description: { type: "string" },
			},
			required: ["name"],
		}),
		async (req, res, next) => {
			try {
				const result = await internalWasmModule.create(res.locals.access, req.body, req.file);
				res.status(201).send(result);
			} catch (err) {
				next(err);
			}
		},
	);

/**
 * Specific WASM module
 *
 * /api/nginx/wasm-modules/:id
 */
router
	.route("/:id")
	.options((req, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /api/nginx/wasm-modules/:id
	 *
	 * Retrieve a specific WASM module
	 */
	.get(jwtDecode(), async (req, res, next) => {
		try {
			const result = await internalWasmModule.get(res.locals.access, { id: Number.parseInt(req.params.id, 10) });
			res.status(200).send(result);
		} catch (err) {
			next(err);
		}
	})

	/**
	 * PUT /api/nginx/wasm-modules/:id
	 *
	 * Update an existing WASM module
	 */
	.put(
		jwtDecode(),
		validator({
			type: "object",
			properties: {
				id: { type: "integer" },
				name: { type: "string" },
				description: { type: "string" },
			},
			required: ["id", "name"],
		}),
		async (req, res, next) => {
			try {
				req.body.id = Number.parseInt(req.params.id, 10);
				const result = await internalWasmModule.update(res.locals.access, req.body);
				res.status(200).send(result);
			} catch (err) {
				next(err);
			}
		},
	)

	/**
	 * DELETE /api/nginx/wasm-modules/:id
	 *
	 * Delete a WASM module
	 */
	.delete(jwtDecode(), async (req, res, next) => {
		try {
			const result = await internalWasmModule.delete(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			next(err);
		}
	});

export default router;
