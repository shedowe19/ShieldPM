import fs from "node:fs/promises";
import express from "express";
import fileUpload from "express-fileupload";
import rateLimit from "express-rate-limit";
import dnsPlugins from "../../certbot/dns-plugins.json" with { type: "json" };
import internalCertificate from "../../internal/certificate.js";
import internalPki from "../../internal/pki.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import validator from "../../lib/validator/index.js";
import { express as logger } from "../../logger.js";
import { getValidationSchema } from "../../schema/index.js";

const certificateUpload = fileUpload({
	limits: {
		fileSize: 10 * 1024 * 1024,
	},
	abortOnLimit: true,
	useTempFiles: false,
});

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});
// Rate limiter for certificate downloads: max 10 downloads per 15 minutes per IP
const downloadLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10, // limit each IP to 10 download requests per windowMs
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	message: { error: "Too many download requests from this IP, please try again later." },
	validate: {
		trustProxy: false,
	},
});

// Rate limiter for client certificate generation (CPU intensive)
const createCertLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // limit each IP to 5 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many certificate generation requests, please try again later." },
	validate: {
		trustProxy: false,
	},
});

/**
 * /api/nginx/certificates
 */

/**
 * GET /api/nginx/certificates/root-ca
 *
 * Download Root CA
 */
router.get("/root-ca", async (_req, res) => {
	const certContent = await internalPki.getRootCa();
	res.status(200)
		.header("Content-Type", "application/x-pem-file")
		.header("Content-Disposition", 'attachment; filename="root_ca.crt"')
		.send(certContent);
});

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/certificates
	 *
	 * Retrieve all certificates
	 */
	.get(async (req, res) => {
		const data = await validator(
			{
				additionalProperties: false,
				properties: {
					expand: {
						$ref: "common#/properties/expand",
					},
					query: {
						$ref: "common#/properties/query",
					},
				},
			},
			{
				expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				query: typeof req.query.query === "string" ? req.query.query : null,
			},
		);
		const rows = await internalCertificate.getAll(res.locals.access, data.expand, data.query);
		res.status(200).send(rows);
	})

	/**
	 * POST /api/nginx/certificates
	 *
	 * Create a new certificate
	 */
	.post(async (req, res, _next) => {
		const payload = await apiValidator(getValidationSchema("/nginx/certificates", "post"), req.body);
		req.setTimeout(900000); // 15 minutes timeout
		const result = await internalCertificate.create(res.locals.access, payload);
		res.status(201).send(result);
	});

router
	.route("/internal/client")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(createCertLimiter)
	.all(jwtdecode())
	.post(async (req, res, next) => {
		const payload = await validator(
			{
				type: "object",
				additionalProperties: false,
				required: ["common_name", "password"],
				properties: {
					common_name: { type: "string", minLength: 1, maxLength: 255 },
					password: { type: "string", minLength: 1, maxLength: 1024 },
					years: { type: "integer", minimum: 1, maximum: 10 },
				},
			},
			{
				common_name: req.body?.common_name,
				password: req.body?.password,
				years: req.body?.years === undefined ? 1 : Number(req.body.years),
			},
		);

		const tmpDir = `/tmp/client-cert-${Date.now()}`;
		const cleanupTmpDir = async () => {
			try {
				await fs.rm(tmpDir, { recursive: true, force: true });
			} catch (cleanupErr) {
				logger.warn(`Cleanup failed for ${tmpDir}: ${cleanupErr.message}`);
			}
		};

		let p12Path;
		try {
			p12Path = await internalPki.createClientCert(
				{
					common_name: payload.common_name,
					password: payload.password,
					years: payload.years,
				},
				tmpDir,
			);
		} catch (err) {
			await cleanupTmpDir();
			throw err;
		}

		res.download(p12Path, `${payload.common_name}.p12`, async (err) => {
			await cleanupTmpDir();
			if (err) {
				next(err);
			}
		});
	});

/**
 * /api/nginx/certificates/dns-providers
 */
router
	.route("/dns-providers")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/certificates/dns-providers
	 *
	 * Get list of all supported DNS providers
	 */
	.get(async (_req, res, _next) => {
		if (!res.locals.access.token.getUserId()) {
			throw new errs.PermissionError("Login required");
		}
		const clean = Object.keys(dnsPlugins).map((key) => ({
			id: key,
			name: dnsPlugins[key].name,
			credentials: dnsPlugins[key].credentials,
		}));

		clean.sort((a, b) => a.name.localeCompare(b.name));
		res.status(200).send(clean);
	});

/**
 * Test HTTP challenge for domains
 *
 * /api/nginx/certificates/test-http
 */
router
	.route("/test-http")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/certificates/test-http
	 *
	 * Test HTTP challenge for domains
	 */
	.post(async (req, res, _next) => {
		const payload = await apiValidator(getValidationSchema("/nginx/certificates/test-http", "post"), req.body);
		req.setTimeout(60000); // 1 minute timeout

		const result = await internalCertificate.testHttpsChallenge(res.locals.access, payload);
		res.status(200).send(result);
	});

/**
 * Validate Certs before saving
 *
 * /api/nginx/certificates/validate
 */
router
	.route("/validate")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/certificates/validate
	 *
	 * Validate certificates
	 */
	.post(certificateUpload, async (req, res) => {
		if (!req.files) {
			res.status(400).send({ error: "No files were uploaded" });
			return;
		}

		const result = await internalCertificate.validate({
			files: req.files,
		});
		res.status(200).send(result);
	});

/**
 * Retrieve a specific certificate (POST to avoid sensitive query params)
 *
 * /api/nginx/certificates/retrieve
 */
router.post("/retrieve", jwtdecode(), async (req, res) => {
	const { id, expand } = req.body;
	const certificateId = Number.parseInt(id, 10);
	if (Number.isNaN(certificateId) || certificateId < 1) {
		throw new errs.ValidationError("id must be an integer greater than 0");
	}

	const row = await internalCertificate.get(res.locals.access, {
		id: certificateId,
		expand: expand,
	});
	res.status(200).send(row);
});

/**
 * Specific certificate
 *
 * /api/nginx/certificates/123
 */
router
	.route("/:certificate_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * PUT /api/nginx/certificates/123
	 *
	 * Updates a specific certificate
	 */
	.put(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/certificates/{certID}", "put"), {
			...req.body,
			id: req.params.certificate_id,
		});
		const result = await internalCertificate.update(res.locals.access, payload);
		res.status(201).send(result);
	})

	/**
	 * DELETE /api/nginx/certificates/123
	 *
	 * Update and existing certificate
	 */
	.delete(async (req, res) => {
		const parsedId = Number.parseInt(req.params.certificate_id, 10);
		if (Number.isNaN(parsedId)) {
			return res.status(400).send({ error: { code: 400, message: "Invalid certificate id" } });
		}
		const result = await internalCertificate.delete(res.locals.access, {
			id: parsedId,
		});
		res.status(200).send(result);
	});

/**
 * Upload Certs
 *
 * /api/nginx/certificates/123/upload
 */
router
	.route("/:certificate_id/upload")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/certificates/123/upload
	 *
	 * Upload certificates
	 */
	.post(certificateUpload, async (req, res) => {
		if (!req.files) {
			res.status(400).send({ error: "No files were uploaded" });
			return;
		}

		const result = await internalCertificate.upload(res.locals.access, {
			id: Number.parseInt(req.params.certificate_id, 10),
			files: req.files,
		});
		res.status(200).send(result);
	});

/**
 * Renew certbot Certs
 *
 * /api/nginx/certificates/123/renew
 */
router
	.route("/:certificate_id/renew")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/certificates/123/renew
	 *
	 * Renew certificate
	 */
	.post(async (req, res) => {
		req.setTimeout(900000); // 15 minutes timeout
		const result = await internalCertificate.renew(res.locals.access, {
			id: Number.parseInt(req.params.certificate_id, 10),
		});
		res.status(200).send(result);
	});

/**
 * Download certbot Certs
 *
 * /api/nginx/certificates/download
 */
router
	.route("/download")
	.options((_req, res) => {
		res.sendStatus(204);
	})
	.all(downloadLimiter)
	.all(jwtdecode())

	/**
	 * POST /api/nginx/certificates/download
	 *
	 * Download certificate
	 */
	.post(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/certificates/download", "post"), req.body);
		const result = await internalCertificate.download(res.locals.access, {
			id: Number.parseInt(payload.id, 10),
		});
		res.status(200).download(result.fileName);
	});

export default router;
