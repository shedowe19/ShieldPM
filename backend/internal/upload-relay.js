import crypto from "node:crypto";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import errs from "../lib/error.js";

const DEFAULT_CHUNK_SIZE = 80 * 1024 * 1024;
const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const DEFAULT_CLEANUP_HOURS = 24;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;
const DEFAULT_MAX_PENDING_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_PENDING_UPLOADS = 32;
const MAX_CONCURRENT_FINALIZERS = 1;
const ORIGIN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_PATH = "/_shieldpm-upload";
const METADATA_FILE = "upload.json";
const FORWARDED_REQUEST_HEADERS = ["authorization", "cookie", "x-api-key", "x-upload-token", "x-request-id"];
const CALLER_CREDENTIAL_HEADERS = ["authorization", "cookie", "x-api-key", "x-upload-token"];

const asPositiveInteger = (value, name, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
	const normalized = value === undefined || value === null ? fallback : Number(value);
	if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
		throw new errs.ValidationError(`${name} must be a positive integer no greater than ${maximum}`);
	}
	return normalized;
};

const safeUploadPath = (value) => {
	const normalized = typeof value === "string" && value ? value : DEFAULT_PATH;
	if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(normalized)) {
		throw new errs.ValidationError("Upload relay path must be an absolute path without query strings or traversal");
	}
	return normalized;
};

const safeTargetPath = (value) => {
	const normalized = typeof value === "string" && value ? value : "/";
	if (!/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)$/.test(normalized) || normalized.startsWith("//")) {
		throw new errs.ValidationError("Upload relay target path must be an absolute origin path");
	}
	return normalized;
};

const normalizeHostname = (hostname) => {
	if (typeof hostname !== "string" || !hostname || /[/?#@\s]/.test(hostname)) {
		throw new errs.ValidationError("Upload relay requires a valid private upstream host");
	}
	return hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
};

const isUniversalAllowAddress = (address) => {
	if (typeof address !== "string") return false;
	const normalized = address.trim().toLowerCase();
	return ["*", "all", "0.0.0.0/0", "::/0"].includes(normalized) || /^(?:0\.0\.0\.0|::)\/0+$/.test(normalized);
};

const hasRestrictiveIpPolicy = (clients) =>
	Array.isArray(clients) &&
	clients.some((client) => client?.directive === "allow" && !isUniversalAllowAddress(client.address));

const hasUniversalAllowRule = (clients) =>
	Array.isArray(clients) &&
	clients.some((client) => client?.directive === "allow" && isUniversalAllowAddress(client.address));

const accessListEnforcesUploadAuthorization = (accessList) => {
	const authType = accessList?.meta?.auth_type || accessList?.meta?.authType;
	if (!accessList || accessList.is_deleted) return false;
	if (accessList.satisfy_any && hasUniversalAllowRule(accessList.clients)) return false;
	return Boolean(
		(Array.isArray(accessList.items) && accessList.items.length > 0) ||
			hasRestrictiveIpPolicy(accessList.clients) ||
			accessList.mtls_enabled ||
			["oauth2_proxy", "authentik_proxy"].includes(authType) ||
			(typeof accessList.meta?.authentik_host === "string" && accessList.meta.authentik_host),
	);
};

const canonicalizePolicyValue = (value) => {
	if (Array.isArray(value)) return value.map(canonicalizePolicyValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalizePolicyValue(entry)]),
		);
	}
	return value;
};

const accessPolicyFingerprint = (accessList, accessListId) => {
	const policy = {
		clients: (accessList.clients || [])
			.map((client) => ({
				address: typeof client.address === "string" ? client.address.trim().toLowerCase() : client.address,
				directive: client.directive,
			}))
			.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
		id: accessList.id || accessListId,
		items: (accessList.items || [])
			.map((item) => ({
				password: item.password,
				username: typeof item.username === "string" ? item.username : "",
			}))
			.sort((left, right) => left.username.localeCompare(right.username)),
		meta: accessList.meta || {},
		mtls_certificate: accessList.mtls_certificate,
		mtls_enabled: accessList.mtls_enabled,
		mtls_use_internal: accessList.mtls_use_internal,
		pass_auth: accessList.pass_auth,
		satisfy_any: accessList.satisfy_any,
	};
	return crypto
		.createHash("sha256")
		.update(JSON.stringify(canonicalizePolicyValue(policy)))
		.digest("hex");
};

const relayConfigForHost = (host, accessList = host?.access_list) => {
	if (!host || host.is_deleted || !host.upload_relay_enabled) {
		throw new errs.ItemNotFoundError("upload relay");
	}
	if (!Number.isSafeInteger(Number(host.access_list_id)) || Number(host.access_list_id) < 1) {
		throw new errs.ValidationError("Upload relay requires a Proxy Host access list");
	}
	if (!accessListEnforcesUploadAuthorization(accessList)) {
		throw new errs.ValidationError(
			"Upload relay requires an Access List with enforcing authentication or IP policy",
		);
	}
	if (!["http", "https"].includes(host.forward_scheme)) {
		throw new errs.ValidationError("Upload relay requires an HTTP or HTTPS upstream");
	}
	const chunkSize = asPositiveInteger(
		host.upload_relay_chunk_size,
		"Upload relay chunk size",
		DEFAULT_CHUNK_SIZE,
		90 * 1024 * 1024,
	);
	if (chunkSize < MIN_CHUNK_SIZE) {
		throw new errs.ValidationError("Upload relay chunk size must be at least 5 MiB");
	}
	const maxFileSize = asPositiveInteger(
		host.upload_relay_max_file_size,
		"Upload relay maximum file size",
		DEFAULT_MAX_FILE_SIZE,
	);
	if (maxFileSize < chunkSize) {
		throw new errs.ValidationError("Upload relay maximum file size must not be smaller than its chunk size");
	}
	const maxPendingBytes = asPositiveInteger(
		host.upload_relay_max_pending_bytes,
		"Upload relay pending-byte limit",
		DEFAULT_MAX_PENDING_BYTES,
	);
	if (maxPendingBytes < maxFileSize) {
		throw new errs.ValidationError("Upload relay pending-byte limit must not be smaller than its file size limit");
	}
	const cleanupHours = asPositiveInteger(
		host.upload_relay_cleanup_hours,
		"Upload relay cleanup hours",
		DEFAULT_CLEANUP_HOURS,
		720,
	);
	const hostname = normalizeHostname(host.forward_host);
	const port = asPositiveInteger(host.forward_port, "Upload relay upstream port", 443, 65535);
	const forwardAuthorization = !(accessList.pass_auth === false || accessList.pass_auth === 0);
	const origin = `${host.forward_scheme}://${hostname}:${port}${safeTargetPath(host.upload_relay_target_path)}`;
	const policyFingerprint = accessPolicyFingerprint(accessList, host.access_list_id);
	return {
		chunkSize,
		cleanupHours,
		forwardAuthorization,
		id: host.id,
		maxFileSize,
		maxPendingBytes,
		origin,
		originFingerprint: JSON.stringify({ forwardAuthorization, origin, policyFingerprint }),
		path: safeUploadPath(host.upload_relay_path),
	};
};

const validateRelayConfigForHost = async (host) => {
	let accessList = host?.access_list;
	if (!accessList) {
		const { default: AccessList } = await import("../models/access_list.js");
		accessList = await AccessList.query().findById(host?.access_list_id).withGraphFetched("[items, clients]");
	}
	return relayConfigForHost(host, accessList);
};

const safeFilename = (value) => {
	if (typeof value !== "string" || !value) return "upload.bin";
	return value.replaceAll(/[\r\n/\\]/g, "_").slice(0, 255) || "upload.bin";
};

const forwardedRequestHeaders = (requestHeaders, { forwardAuthorization = true } = {}) => {
	const headers = {};
	for (const name of FORWARDED_REQUEST_HEADERS) {
		if (name === "authorization" && !forwardAuthorization) continue;
		if (typeof requestHeaders?.[name] === "string" && requestHeaders[name]) headers[name] = requestHeaders[name];
	}
	return headers;
};

const requiresCallerAuthorization = (headers) => CALLER_CREDENTIAL_HEADERS.some((name) => Boolean(headers[name]));

const publicMetadata = (metadata) => ({
	createdAt: metadata.createdAt,
	failureCode: metadata.failureCode || undefined,
	filename: metadata.filename,
	id: metadata.id,
	length: metadata.length,
	offset: metadata.offset,
	path: metadata.config.path,
	state: metadata.state || "uploading",
	upstreamStatus: metadata.upstreamStatus || undefined,
});

/**
 * @typedef {{ access_list_id: number, enabled: boolean|number, forward_host: string, forward_port: number, forward_scheme: string, id: number, is_deleted?: boolean|number, upload_relay_chunk_size?: number, upload_relay_cleanup_hours?: number, upload_relay_enabled: boolean|number, upload_relay_max_file_size?: number, upload_relay_max_pending_bytes?: number, upload_relay_path?: string, upload_relay_target_path?: string }} UploadRelayHost
 */

/**
 * @param {{fetchImpl?: typeof fetch, getHost?: (hostId: number) => Promise<UploadRelayHost|undefined>, root?: string, schedule?: (task: () => void) => unknown}} [options]
 */
const createUploadRelay = ({
	fetchImpl = globalThis.fetch,
	getHost,
	root = join(process.env.DATA_PATH || "/data", "upload-relay"),
	schedule = setImmediate,
} = {}) => {
	if (typeof fetchImpl !== "function") throw new TypeError("Upload relay needs a fetch implementation");
	const resolveHost =
		getHost ||
		(async (hostId) => {
			const { default: ProxyHost } = await import("../models/proxy_host.js");
			return await ProxyHost.query()
				.findById(hostId)
				.where("is_deleted", 0)
				.withGraphFetched("access_list.[items, clients]");
		});
	const locks = new Map();
	const uploadDirectory = (hostId, uploadId) => join(root, `host-${hostId}`, uploadId);
	const metadataPath = (hostId, uploadId) => join(uploadDirectory(hostId, uploadId), METADATA_FILE);
	const chunkPath = (hostId, uploadId, offset) =>
		join(uploadDirectory(hostId, uploadId), `${String(offset).padStart(20, "0")}.part`);
	const syncFile = async (filename) => {
		const file = await fs.promises.open(filename, "r");
		try {
			await file.sync();
		} finally {
			await file.close();
		}
	};
	const syncDirectory = async (directory) => {
		const folder = await fs.promises.open(directory, "r");
		try {
			await folder.sync();
		} finally {
			await folder.close();
		}
	};

	const withLock = async (key, operation) => {
		const previous = locks.get(key) || Promise.resolve();
		const current = previous.catch(() => undefined).then(operation);
		locks.set(key, current);
		try {
			return await current;
		} finally {
			if (locks.get(key) === current) locks.delete(key);
		}
	};

	const writeMetadata = async (hostId, uploadId, metadata) => {
		const filename = metadataPath(hostId, uploadId);
		const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
		await fs.promises.mkdir(dirname(filename), { mode: 0o700, recursive: true });
		try {
			await fs.promises.writeFile(temporary, JSON.stringify(metadata), { flag: "wx", flush: true, mode: 0o600 });
			await fs.promises.rename(temporary, filename);
			await syncDirectory(dirname(filename));
		} finally {
			await fs.promises.rm(temporary, { force: true });
		}
	};

	const loadMetadata = async (hostId, uploadId) => {
		if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new errs.ItemNotFoundError(uploadId);
		try {
			const metadata = JSON.parse(await fs.promises.readFile(metadataPath(hostId, uploadId), "utf8"));
			if (metadata.hostId !== hostId || metadata.id !== uploadId) throw new errs.ItemNotFoundError(uploadId);
			return metadata;
		} catch (err) {
			if (err.code === "ENOENT" || err instanceof SyntaxError) throw new errs.ItemNotFoundError(uploadId);
			throw err;
		}
	};

	const pendingUploadStats = async (hostId) => {
		let entries;
		try {
			entries = await fs.promises.readdir(join(root, `host-${hostId}`), { withFileTypes: true });
		} catch (err) {
			if (err.code === "ENOENT") return { count: 0, reservedBytes: 0 };
			throw err;
		}
		let count = 0;
		let reservedBytes = 0;
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			try {
				const metadata = await loadMetadata(hostId, entry.name);
				if (metadata.state === "completed") continue;
				count += 1;
				reservedBytes += metadata.length;
			} catch (err) {
				if (!(err instanceof errs.ItemNotFoundError)) throw err;
			}
		}
		return { count, reservedBytes };
	};

	const getConfig = async (hostId) => {
		const host = await resolveHost(hostId);
		const config = await validateRelayConfigForHost(host);
		if (!host?.enabled) throw new errs.ItemNotFoundError("upload relay");
		return config;
	};
	let cleanupTimer = null;
	const finalizationQueue = [];
	const activeFinalizationControllers = new Map();
	const runningFinalizations = new Set();
	let activeFinalizers = 0;
	let finalizerScheduled = false;

	const cleanupExpired = async (now = Date.now()) => {
		let hostDirectories;
		try {
			hostDirectories = await fs.promises.readdir(root, { withFileTypes: true });
		} catch (err) {
			if (err.code === "ENOENT") return 0;
			throw err;
		}
		let removed = 0;
		for (const hostDirectory of hostDirectories) {
			if (!hostDirectory.isDirectory() || !/^host-\d+$/.test(hostDirectory.name)) continue;
			const hostId = Number(hostDirectory.name.slice("host-".length));
			const directory = join(root, hostDirectory.name);
			for (const uploadDirectoryEntry of await fs.promises.readdir(directory, { withFileTypes: true })) {
				if (!uploadDirectoryEntry.isDirectory()) continue;
				const uploadId = uploadDirectoryEntry.name;
				const wasRemoved = await withLock(`${hostId}:${uploadId}`, async () => {
					try {
						const metadata = await loadMetadata(hostId, uploadId);
						if (metadata.state === "forwarding") return false;
						const expiresAt =
							Date.parse(metadata.createdAt) + metadata.config.cleanupHours * 60 * 60 * 1000;
						if (!Number.isFinite(expiresAt) || expiresAt > now) return false;
						await fs.promises.rm(uploadDirectory(hostId, uploadId), { force: true, recursive: true });
						return true;
					} catch (err) {
						if (!(err instanceof errs.ItemNotFoundError)) throw err;
						await fs.promises.rm(uploadDirectory(hostId, uploadId), { force: true, recursive: true });
						return true;
					}
				});
				removed += Number(wasRemoved);
			}
		}
		return removed;
	};

	const finish = async (hostId, metadata, config, requestHeaders, signal) => {
		const chunks = [...metadata.chunks].sort((a, b) => a.offset - b.offset);
		const body = Readable.from(
			(async function* () {
				for (const chunk of chunks) yield* fs.createReadStream(chunkPath(hostId, metadata.id, chunk.offset));
			})(),
		);
		const headers = {
			"content-length": String(metadata.length),
			"content-type": metadata.mediaType || "application/octet-stream",
			"x-shieldpm-upload-filename": metadata.filename,
			"x-shieldpm-upload-id": metadata.id,
			"x-shieldpm-upload-relay": "1",
		};
		Object.assign(headers, forwardedRequestHeaders(requestHeaders, config));
		const response = await fetchImpl(
			config.origin,
			/** @type {RequestInit} */ ({
				body: /** @type {any} */ (body),
				duplex: "half",
				headers,
				method: "POST",
				redirect: "error",
				signal: AbortSignal.any([signal, AbortSignal.timeout(ORIGIN_TIMEOUT_MS)]),
			}),
		);
		if (!response.ok) throw new errs.InternalError("Upload relay origin rejected the completed upload");
		return response.status;
	};

	const removeChunks = async (hostId, metadata) => {
		await Promise.all(
			(metadata.chunks || []).map(async (chunk) => {
				await fs.promises.rm(chunkPath(hostId, metadata.id, chunk.offset), { force: true });
			}),
		);
	};

	const scheduleFinalizers = () => {
		if (finalizerScheduled || activeFinalizers >= MAX_CONCURRENT_FINALIZERS || finalizationQueue.length === 0)
			return;
		finalizerScheduled = true;
		schedule(() => {
			finalizerScheduled = false;
			while (activeFinalizers < MAX_CONCURRENT_FINALIZERS && finalizationQueue.length > 0) {
				const job = finalizationQueue.shift();
				activeFinalizers += 1;
				const finalization = finalizeInBackground(job)
					.catch(() => undefined)
					.finally(() => {
						runningFinalizations.delete(finalization);
						activeFinalizers -= 1;
						scheduleFinalizers();
					});
				runningFinalizations.add(finalization);
			}
		});
	};

	const enqueueFinalizer = (hostId, uploadId, requestHeaders) => {
		finalizationQueue.push({ hostId, requestHeaders, uploadId });
		scheduleFinalizers();
	};

	const finalizeInBackground = async ({ hostId, requestHeaders, uploadId }) => {
		const key = `${hostId}:${uploadId}`;
		const prepared = await withLock(key, async () => {
			const metadata = await loadMetadata(hostId, uploadId);
			if (metadata.state !== "queued") return null;
			let config;
			try {
				config = await getConfig(hostId);
			} catch {
				metadata.failureCode = "relay-disabled";
				metadata.state = "failed";
				metadata.updatedAt = new Date().toISOString();
				await writeMetadata(hostId, uploadId, metadata);
				return null;
			}
			if (metadata.config.originFingerprint !== config.originFingerprint) {
				metadata.failureCode = "configuration-changed";
				metadata.state = "failed";
				metadata.updatedAt = new Date().toISOString();
				await writeMetadata(hostId, uploadId, metadata);
				return null;
			}
			const controller = new AbortController();
			const leaseId = crypto.randomUUID();
			metadata.attempts = (metadata.attempts || 0) + 1;
			metadata.failureCode = undefined;
			metadata.leaseId = leaseId;
			metadata.state = "forwarding";
			metadata.updatedAt = new Date().toISOString();
			await writeMetadata(hostId, uploadId, metadata);
			activeFinalizationControllers.set(key, controller);
			return { config, controller, leaseId, metadata };
		});
		if (!prepared) return;
		let dispatchConfig;
		let dispatchFailureCode;
		try {
			dispatchConfig = await getConfig(hostId);
			if (dispatchConfig.originFingerprint !== prepared.config.originFingerprint) {
				dispatchFailureCode = "configuration-changed";
			}
		} catch {
			dispatchFailureCode = "relay-disabled";
		}
		if (dispatchFailureCode) {
			activeFinalizationControllers.delete(key);
			await withLock(key, async () => {
				const metadata = await loadMetadata(hostId, uploadId);
				if (metadata.state === "cancelled") {
					await fs.promises.rm(uploadDirectory(hostId, uploadId), { force: true, recursive: true });
					return;
				}
				if (metadata.state !== "forwarding" || metadata.leaseId !== prepared.leaseId) return;
				metadata.failureCode = dispatchFailureCode;
				metadata.state = "failed";
				metadata.updatedAt = new Date().toISOString();
				await writeMetadata(hostId, uploadId, metadata);
			});
			return;
		}

		let upstreamStatus;
		let failureCode;
		try {
			upstreamStatus = await finish(
				hostId,
				prepared.metadata,
				dispatchConfig,
				requestHeaders,
				prepared.controller.signal,
			);
		} catch {
			failureCode = "origin-rejected";
		} finally {
			activeFinalizationControllers.delete(key);
		}

		await withLock(key, async () => {
			let metadata;
			try {
				metadata = await loadMetadata(hostId, uploadId);
			} catch (err) {
				if (err instanceof errs.ItemNotFoundError) return;
				throw err;
			}
			if (metadata.state === "cancelled") {
				await fs.promises.rm(uploadDirectory(hostId, uploadId), { force: true, recursive: true });
				return;
			}
			if (metadata.state !== "forwarding" || metadata.leaseId !== prepared.leaseId) return;
			metadata.updatedAt = new Date().toISOString();
			if (failureCode) {
				metadata.failureCode = failureCode;
				metadata.state = "failed";
				await writeMetadata(hostId, uploadId, metadata);
				return;
			}
			metadata.completedAt = metadata.updatedAt;
			metadata.failureCode = undefined;
			metadata.state = "completed";
			metadata.upstreamStatus = upstreamStatus;
			await writeMetadata(hostId, uploadId, metadata);
			try {
				await removeChunks(hostId, metadata);
				metadata.chunks = [];
				await writeMetadata(hostId, uploadId, metadata);
			} catch {
				metadata.failureCode = "chunk-cleanup-pending";
				await writeMetadata(hostId, uploadId, metadata);
			}
		});
	};

	const queueFinalization = async (hostId, metadata, config, requestHeaders) => {
		if (metadata.state === "completed" || metadata.state === "queued" || metadata.state === "forwarding") {
			return publicMetadata(metadata);
		}
		const headers = forwardedRequestHeaders(requestHeaders, config);
		metadata.config = config;
		metadata.failureCode = undefined;
		metadata.requiresCallerAuthorization = Boolean(
			metadata.requiresCallerAuthorization || requiresCallerAuthorization(headers),
		);
		metadata.state = "queued";
		metadata.updatedAt = new Date().toISOString();
		await writeMetadata(hostId, metadata.id, metadata);
		enqueueFinalizer(hostId, metadata.id, headers);
		return publicMetadata(metadata);
	};

	const recoverInterruptedFinalizations = async () => {
		let recovered = 0;
		let hostDirectories;
		try {
			hostDirectories = await fs.promises.readdir(root, { withFileTypes: true });
		} catch (err) {
			if (err.code === "ENOENT") return recovered;
			throw err;
		}
		for (const hostDirectory of hostDirectories) {
			if (!hostDirectory.isDirectory() || !/^host-\d+$/.test(hostDirectory.name)) continue;
			const hostId = Number(hostDirectory.name.slice("host-".length));
			for (const entry of await fs.promises.readdir(join(root, hostDirectory.name), { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				await withLock(`${hostId}:${entry.name}`, async () => {
					let metadata;
					try {
						metadata = await loadMetadata(hostId, entry.name);
					} catch (err) {
						if (err instanceof errs.ItemNotFoundError) return;
						throw err;
					}
					if (metadata.state === "cancelled") {
						await fs.promises.rm(uploadDirectory(hostId, metadata.id), { force: true, recursive: true });
						return;
					}
					if (!["queued", "forwarding"].includes(metadata.state)) return;
					recovered += 1;
					if (metadata.state === "forwarding") {
						// A process crash after the origin received the request but before
						// this state transition was recorded is indeterminate. Never replay
						// it automatically; an authenticated client must explicitly retry.
						metadata.failureCode = "interrupted-forwarding";
						metadata.state = "failed";
						metadata.updatedAt = new Date().toISOString();
						await writeMetadata(hostId, metadata.id, metadata);
						return;
					}
					if (metadata.requiresCallerAuthorization) {
						metadata.failureCode = "restart-requires-authorization";
						metadata.state = "failed";
						metadata.updatedAt = new Date().toISOString();
						await writeMetadata(hostId, metadata.id, metadata);
						return;
					}
					metadata.state = "queued";
					metadata.updatedAt = new Date().toISOString();
					await writeMetadata(hostId, metadata.id, metadata);
					enqueueFinalizer(hostId, metadata.id, {});
				});
			}
		}
		return recovered;
	};

	const offsetConflict = (offset) => {
		const error = /** @type {{status?: number, uploadOffset?: number}} */ (
			new errs.ValidationError("Upload offset does not match the persisted upload state")
		);
		error.status = 409;
		error.uploadOffset = offset;
		return error;
	};

	const consumeRetryChunk = async (stream, expectedLength) => {
		let length = 0;
		for await (const chunk of stream) length += chunk.length;
		if (length !== expectedLength) throw new errs.ValidationError("Chunk length does not match Content-Length");
	};

	return {
		/**
		 * @param {number} hostId
		 * @param {{filename?: string, length?: number, mediaType?: string}} [upload]
		 */
		async create(hostId, { filename, length, mediaType } = {}) {
			return await withLock(`${hostId}:create`, async () => {
				const config = await getConfig(hostId);
				const normalizedLength = asPositiveInteger(length, "Upload length", undefined, config.maxFileSize);
				const pending = await pendingUploadStats(hostId);
				if (pending.count >= MAX_PENDING_UPLOADS) {
					throw new errs.ValidationError("Upload relay has reached its maximum number of pending uploads");
				}
				if (pending.reservedBytes + normalizedLength > config.maxPendingBytes) {
					throw new errs.ValidationError("Upload relay has reached its pending-byte limit");
				}
				const id = crypto.randomUUID();
				const metadata = {
					chunks: [],
					config,
					createdAt: new Date().toISOString(),
					filename: safeFilename(filename),
					hostId,
					id,
					length: normalizedLength,
					mediaType:
						typeof mediaType === "string" && mediaType
							? mediaType.slice(0, 255)
							: "application/octet-stream",
					offset: 0,
					state: "uploading",
				};
				await writeMetadata(hostId, id, metadata);
				return publicMetadata(metadata);
			});
		},

		async get(hostId, uploadId) {
			await getConfig(hostId);
			return publicMetadata(await loadMetadata(hostId, uploadId));
		},

		async append(hostId, uploadId, { contentLength, headers, offset, stream }) {
			return await withLock(`${hostId}:${uploadId}`, async () => {
				const config = await getConfig(hostId);
				const metadata = await loadMetadata(hostId, uploadId);
				const normalizedOffset = Number(offset);
				const normalizedLength = Number(contentLength);
				if (!Number.isSafeInteger(normalizedOffset) || normalizedOffset < 0) {
					throw new errs.ValidationError("Upload offset must be a non-negative integer");
				}
				if (
					!Number.isSafeInteger(normalizedLength) ||
					normalizedLength < 0 ||
					normalizedLength > metadata.config.chunkSize
				) {
					throw new errs.ValidationError("Chunk length exceeds the configured upload relay chunk size");
				}
				const lastChunk = metadata.chunks.at(-1);
				const isFinalChunkRetry =
					metadata.offset === metadata.length &&
					lastChunk &&
					normalizedOffset === lastChunk.offset &&
					normalizedLength === lastChunk.size;
				if (normalizedOffset !== metadata.offset && !isFinalChunkRetry) throw offsetConflict(metadata.offset);
				if (isFinalChunkRetry) {
					await consumeRetryChunk(stream, normalizedLength);
					return { completed: true, ...(await queueFinalization(hostId, metadata, config, headers)) };
				}
				if (normalizedLength === 0) {
					if (metadata.offset !== metadata.length)
						throw new errs.ValidationError(
							"Zero-length chunks are only valid when finalizing a complete upload",
						);
					return { completed: true, ...(await queueFinalization(hostId, metadata, config, headers)) };
				}
				if (metadata.offset + normalizedLength > metadata.length) {
					throw new errs.ValidationError("Chunk exceeds the declared upload length");
				}
				const directory = uploadDirectory(hostId, uploadId);
				const finalChunk = chunkPath(hostId, uploadId, metadata.offset);
				const temporaryChunk = `${finalChunk}.${process.pid}.${crypto.randomUUID()}.tmp`;
				await fs.promises.mkdir(directory, { mode: 0o700, recursive: true });
				try {
					await pipeline(stream, fs.createWriteStream(temporaryChunk, { flags: "wx", mode: 0o600 }));
					const stat = await fs.promises.stat(temporaryChunk);
					if (stat.size !== normalizedLength)
						throw new errs.ValidationError("Chunk length does not match Content-Length");
					await syncFile(temporaryChunk);
					await fs.promises.rename(temporaryChunk, finalChunk);
					await syncDirectory(directory);
				} finally {
					await fs.promises.rm(temporaryChunk, { force: true });
				}
				metadata.chunks.push({ offset: metadata.offset, size: normalizedLength });
				metadata.offset += normalizedLength;
				await writeMetadata(hostId, uploadId, metadata);
				if (metadata.offset !== metadata.length)
					return { completed: false, offset: metadata.offset, state: metadata.state };
				return { completed: true, ...(await queueFinalization(hostId, metadata, config, headers)) };
			});
		},

		async finalize(hostId, uploadId, headers) {
			return await withLock(`${hostId}:${uploadId}`, async () => {
				const config = await getConfig(hostId);
				const metadata = await loadMetadata(hostId, uploadId);
				if (metadata.offset !== metadata.length) throw new errs.ValidationError("Upload is incomplete");
				return { completed: true, ...(await queueFinalization(hostId, metadata, config, headers)) };
			});
		},

		async remove(hostId, uploadId) {
			await getConfig(hostId);
			return await withLock(`${hostId}:${uploadId}`, async () => {
				const metadata = await loadMetadata(hostId, uploadId);
				if (metadata.state === "forwarding") {
					metadata.failureCode = "cancelled";
					metadata.state = "cancelled";
					metadata.updatedAt = new Date().toISOString();
					await writeMetadata(hostId, uploadId, metadata);
					activeFinalizationControllers.get(`${hostId}:${uploadId}`)?.abort();
					return;
				}
				await fs.promises.rm(uploadDirectory(hostId, uploadId), { force: true, recursive: true });
			});
		},

		cleanupExpired,

		recoverInterruptedFinalizations,

		init() {
			if (cleanupTimer) return;
			void (async () => {
				await cleanupExpired();
				await recoverInterruptedFinalizations();
			})();
			cleanupTimer = setInterval(() => void cleanupExpired(), 60 * 60 * 1000);
			cleanupTimer.unref?.();
		},

		async stop() {
			if (cleanupTimer) clearInterval(cleanupTimer);
			cleanupTimer = null;
			for (const controller of activeFinalizationControllers.values()) controller.abort();
			await Promise.allSettled([...runningFinalizations]);
		},
	};
};

const internalUploadRelay = createUploadRelay();

export { createUploadRelay, relayConfigForHost, validateRelayConfigForHost };
export default internalUploadRelay;
