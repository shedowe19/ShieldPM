import express from "express";
import internalUploadRelay from "../../internal/upload-relay.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";

const TUS_VERSION = "1.0.0";

const readHeader = (headers, name) => {
	const value = headers[name];
	return Array.isArray(value) ? value[0] : value;
};

const parseIntegerHeader = (headers, name, { allowZero = false } = {}) => {
	const value = readHeader(headers, name);
	if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
		throw new errs.ValidationError(`${name} header is required and must be an integer`);
	}
	const number = Number(value);
	if (!Number.isSafeInteger(number) || (!allowZero && number < 1)) {
		throw new errs.ValidationError(`${name} header is outside the supported range`);
	}
	return number;
};

const requireTusVersion = (req, res) => {
	const version = readHeader(req.headers, "tus-resumable");
	if (version === TUS_VERSION) return;
	res.set("Tus-Version", TUS_VERSION);
	throw Object.assign(new errs.ValidationError("Unsupported Tus-Resumable version"), { status: 412 });
};

const parseMetadata = (header) => {
	if (typeof header !== "string" || !header) return {};
	const metadata = {};
	for (const pair of header.split(",")) {
		const [key, encodedValue = ""] = pair.trim().split(/\s+/, 2);
		if (!/^[a-z0-9-]{1,64}$/i.test(key)) throw new errs.ValidationError("Upload-Metadata contains an invalid key");
		if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encodedValue))
			throw new errs.ValidationError("Upload-Metadata contains invalid Base64");
		metadata[key.toLowerCase()] = Buffer.from(encodedValue, "base64").toString("utf8");
	}
	return metadata;
};

const parseHostId = (value) => {
	if (!/^\d+$/.test(value)) throw new errs.ItemNotFoundError(value);
	const hostId = Number(value);
	if (!Number.isSafeInteger(hostId) || hostId < 1) throw new errs.ItemNotFoundError(value);
	return hostId;
};

const setTusHeaders = (res) => {
	res.set("Tus-Resumable", TUS_VERSION);
	res.set("Tus-Version", TUS_VERSION);
	res.set("Tus-Extension", "creation,termination");
};

const setRelayStateHeader = (res, upload) => {
	if (typeof upload?.state === "string") res.set("Upload-Relay-State", upload.state);
};

const sendOffsetConflict = (error, res) => {
	const uploadOffset = Number(/** @type {any} */ (error).uploadOffset);
	if (!Number.isSafeInteger(uploadOffset) || uploadOffset < 0) return false;
	setTusHeaders(res);
	res.set("Upload-Offset", String(uploadOffset));
	res.status(409).end();
	return true;
};

const createUploadRelayRouter = (relay = internalUploadRelay) => {
	const router = express.Router({ caseSensitive: true, mergeParams: true, strict: true });
	router.use((req, res, next) => {
		if (req.method !== "OPTIONS") res.set("Tus-Resumable", TUS_VERSION);
		next();
	});

	router.options("/", (_req, res) => {
		setTusHeaders(res);
		res.sendStatus(204);
	});

	router.options("/:uploadId", (_req, res) => {
		setTusHeaders(res);
		res.sendStatus(204);
	});

	router.options("/:uploadId/finalize", (_req, res) => {
		setTusHeaders(res);
		res.sendStatus(204);
	});
	// This backend API is separate from the public Nginx upload location, which
	// forwards directly to the origin. Only users allowed to access this host
	// may inspect uploads; writes require the host update permission.
	router.use(jwtdecode());
	router.use(async (req, res, next) => {
		try {
			const hostId = parseHostId(req.params.hostId);
			const permission = req.method === "GET" || req.method === "HEAD" ? "get" : "update";
			await res.locals.access.can(`proxy_hosts:${permission}`, hostId);
			next();
		} catch (error) {
			next(error);
		}
	});

	router.post("/", async (req, res, next) => {
		try {
			requireTusVersion(req, res);
			const hostId = parseHostId(req.params.hostId);
			const metadata = parseMetadata(readHeader(req.headers, "upload-metadata"));
			const upload = await relay.create(hostId, {
				filename: metadata.filename,
				length: parseIntegerHeader(req.headers, "upload-length"),
				mediaType: metadata["content-type"],
			});
			setTusHeaders(res);
			res.location(`${upload.path}/${upload.id}`);
			res.set("Upload-Offset", String(upload.offset));
			res.status(201).end();
		} catch (error) {
			next(error);
		}
	});

	router.head("/:uploadId", async (req, res, next) => {
		try {
			requireTusVersion(req, res);
			const upload = await relay.get(parseHostId(req.params.hostId), req.params.uploadId);
			setTusHeaders(res);
			res.set("Cache-Control", "no-store");
			res.set("Upload-Length", String(upload.length));
			res.set("Upload-Offset", String(upload.offset));
			setRelayStateHeader(res, upload);
			res.sendStatus(200);
		} catch (error) {
			next(error);
		}
	});

	router.get("/:uploadId", async (req, res, next) => {
		try {
			requireTusVersion(req, res);
			const upload = await relay.get(parseHostId(req.params.hostId), req.params.uploadId);
			setTusHeaders(res);
			setRelayStateHeader(res, upload);
			res.status(200).json(upload);
		} catch (error) {
			next(error);
		}
	});

	router.post("/:uploadId/finalize", async (req, res, next) => {
		try {
			requireTusVersion(req, res);
			const result = await relay.finalize(parseHostId(req.params.hostId), req.params.uploadId, req.headers);
			setTusHeaders(res);
			res.set("Upload-Offset", String(result.offset));
			setRelayStateHeader(res, result);
			res.sendStatus(204);
		} catch (error) {
			next(error);
		}
	});

	router.patch("/:uploadId", async (req, res, next) => {
		try {
			requireTusVersion(req, res);
			if (!/^application\/offset\+octet-stream(?:;|$)/i.test(readHeader(req.headers, "content-type") || "")) {
				throw new errs.ValidationError("PATCH uploads require Content-Type application/offset+octet-stream");
			}
			const hostId = parseHostId(req.params.hostId);
			const result = await relay.append(hostId, req.params.uploadId, {
				contentLength: parseIntegerHeader(req.headers, "content-length", { allowZero: true }),
				headers: req.headers,
				offset: parseIntegerHeader(req.headers, "upload-offset", { allowZero: true }),
				stream: req,
			});
			setTusHeaders(res);
			res.set("Upload-Offset", String(result.offset));
			setRelayStateHeader(res, result);
			res.sendStatus(204);
		} catch (error) {
			if (sendOffsetConflict(error, res)) return;
			next(error);
		}
	});

	router.delete("/:uploadId", async (req, res, next) => {
		try {
			requireTusVersion(req, res);
			await relay.remove(parseHostId(req.params.hostId), req.params.uploadId);
			setTusHeaders(res);
			res.sendStatus(204);
		} catch (error) {
			next(error);
		}
	});

	return router;
};

export { createUploadRelayRouter };
export default createUploadRelayRouter();
