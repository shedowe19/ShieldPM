import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import http from "isomorphic-git/http/node";

const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const REDACTED = "[REDACTED]";
const SECRET_KEY =
	/(?:^|_)(?:api_?key|auth|authorization|credential|hash|password|passwd|private|secret|token)(?:$|_)/i;
const PEM_OR_SECRET_VALUE =
	/(?:-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----|\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\b[a-f0-9]{64,128}\b|\$(?:2[aby]|argon2(?:id|i|d))\$[^\s]{20,})/i;

/**
 * Validate a GitOps repository URL before it can reach the Git client.
 *
 * @param {string} value
 * @returns {URL}
 */
export const validateRepositoryUrl = (value) => {
	let url;
	try {
		url = new URL(value);
	} catch (_err) {
		throw new TypeError("Repository URL must be a valid absolute HTTPS URL");
	}

	if (url.protocol !== "https:") {
		throw new TypeError("GitOps supports HTTPS repositories with a PAT only");
	}
	if (url.username || url.password) {
		throw new TypeError("Repository URL must not contain embedded credentials");
	}
	if (url.search || url.hash) {
		throw new TypeError("Repository URL must not contain a query string or fragment");
	}
	if (!url.hostname || url.pathname === "/") {
		throw new TypeError("Repository URL must identify a repository");
	}
	return url;
};

/**
 * Validate a branch name as a single bounded Git ref component.
 *
 * @param {string} value
 * @returns {string}
 */
export const validateBranch = (value) => {
	const hasInvalidCharacter =
		typeof value === "string" &&
		[...value].some(
			(character) =>
				character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || "~^:?*\\[]".includes(character),
		);
	const components = typeof value === "string" ? value.split("/") : [];
	if (
		typeof value !== "string" ||
		value.length < 1 ||
		value.length > 200 ||
		value.startsWith("-") ||
		value.startsWith("/") ||
		value.endsWith("/") ||
		value === "@" ||
		value.includes("..") ||
		value.includes("@{") ||
		components.some(
			(component) =>
				!component || component.startsWith(".") || component.endsWith(".") || component.endsWith(".lock"),
		) ||
		hasInvalidCharacter
	) {
		throw new TypeError("Invalid Git branch name");
	}
	return value;
};

/**
 * Produce a public-only deep copy. Secret-shaped keys and secret material in
 * nested strings are replaced instead of merely being hidden at the top level.
 *
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
export const redactSecrets = (value, seen = new WeakSet()) => {
	if (typeof value === "string") {
		return PEM_OR_SECRET_VALUE.test(value) ? REDACTED : value;
	}
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (seen.has(value)) {
		return REDACTED;
	}
	seen.add(value);

	if (Array.isArray(value)) {
		return value.map((entry) => redactSecrets(entry, seen));
	}

	const result = {};
	for (const [key, entry] of Object.entries(value)) {
		result[key] = SECRET_KEY.test(key) ? REDACTED : redactSecrets(entry, seen);
	}
	return result;
};

/**
 * Reject an imported object that contains a redaction marker or secret
 * material. A redacted export is intentionally not treated as a credential.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export const containsSecretMaterial = (value) => {
	if (typeof value === "string") {
		return value === REDACTED || PEM_OR_SECRET_VALUE.test(value);
	}
	if (value === null || typeof value !== "object") {
		return false;
	}
	if (Array.isArray(value)) {
		return value.some(containsSecretMaterial);
	}
	return Object.entries(value).some(([key, entry]) => SECRET_KEY.test(key) || containsSecretMaterial(entry));
};

/**
 * Read one regular file through an O_NOFOLLOW descriptor and verify that its
 * identity and size did not change while it was being read.
 *
 * @param {string} filePath
 * @param {number} [maxBytes]
 * @returns {Promise<Buffer>}
 */
export const readRegularFile = async (filePath, maxBytes = DEFAULT_MAX_FILE_BYTES) => {
	const noFollow = fs.constants.O_NOFOLLOW || 0;
	const nonBlocking = fs.constants.O_NONBLOCK || 0;
	let handle;
	try {
		handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | noFollow | nonBlocking);
		const before = await handle.stat();
		if (!before.isFile()) {
			throw new TypeError("Snapshot entry is not a regular file");
		}
		if (before.size < 1 || before.size > maxBytes) {
			throw new RangeError(`Snapshot file size must be between 1 and ${maxBytes} bytes`);
		}

		const buffer = Buffer.alloc(before.size);
		let offset = 0;
		while (offset < buffer.length) {
			const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
			if (bytesRead === 0) {
				throw new Error("Snapshot file ended before its declared size");
			}
			offset += bytesRead;
		}

		const after = await handle.stat();
		if (
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			before.size !== after.size ||
			before.mtimeMs !== after.mtimeMs
		) {
			throw new Error("Snapshot file changed while it was being read");
		}
		return buffer;
	} finally {
		await handle?.close();
	}
};

/**
 * @param {Buffer|string} value
 * @returns {string}
 */
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/**
 * Resolve a manifest path while preventing absolute paths and traversal.
 *
 * @param {string} root
 * @param {string} relativePath
 * @returns {string}
 */
export const resolveSnapshotPath = (root, relativePath) => {
	if (
		typeof relativePath !== "string" ||
		relativePath.length < 1 ||
		relativePath.length > 240 ||
		path.isAbsolute(relativePath) ||
		relativePath.includes("\\") ||
		relativePath.split("/").some((part) => !part || part === "." || part === "..")
	) {
		throw new TypeError("Invalid snapshot path");
	}
	const resolvedRoot = path.resolve(root);
	const resolved = path.resolve(root, relativePath);
	if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
		throw new TypeError("Snapshot path escapes its root");
	}
	return resolved;
};

/**
 * Verify that a snapshot root and every parent directory of an entry are real
 * directories, not symlink redirects.
 *
 * @param {string} root
 * @param {string} [relativePath]
 * @returns {Promise<string>}
 */
export const assertSafeSnapshotPath = async (root, relativePath = "") => {
	const rootStats = await fs.promises.lstat(root);
	if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
		throw new TypeError("Snapshot root must be a real directory");
	}
	const canonicalRoot = await fs.promises.realpath(root);
	if (!relativePath) return canonicalRoot;
	const resolved = resolveSnapshotPath(root, relativePath);
	let current = root;
	for (const component of relativePath.split("/").slice(0, -1)) {
		current = path.join(current, component);
		const stats = await fs.promises.lstat(current);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new TypeError("Snapshot path contains a redirected parent directory");
		}
		const canonicalParent = await fs.promises.realpath(current);
		if (!canonicalParent.startsWith(`${canonicalRoot}${path.sep}`)) {
			throw new TypeError("Snapshot parent directory escapes its root");
		}
	}
	return resolved;
};

const limitBody = (body, maxBytes) => {
	if (!body || typeof body[Symbol.asyncIterator] !== "function") {
		return body;
	}
	return {
		async *[Symbol.asyncIterator]() {
			let received = 0;
			for await (const chunk of body) {
				received += Buffer.byteLength(chunk);
				if (received > maxBytes) {
					throw new RangeError("Git response exceeded the configured size limit");
				}
				yield chunk;
			}
		},
	};
};

const collectBoundedBody = async (body, maxBytes) => {
	if (!body) return undefined;
	const chunks = [];
	let total = 0;
	for await (const chunk of body) {
		total += Buffer.byteLength(chunk);
		if (total > maxBytes) throw new RangeError("Git request exceeded the configured size limit");
		chunks.push(chunk);
	}
	return chunks;
};

/**
 * HTTP adapter that refuses cross-origin redirects before the response body is
 * consumed and bounds all Git protocol responses.
 *
 * @param {URL} repositoryUrl
 * @param {number} [maxBytes]
 * @returns {{request: Function}}
 */
export const createSecureGitHttp = (repositoryUrl, maxBytes = DEFAULT_MAX_RESPONSE_BYTES) => ({
	request: async (request) => {
		let requestedUrl = new URL(request.url);
		if (
			requestedUrl.origin !== repositoryUrl.origin ||
			requestedUrl.protocol !== "https:" ||
			requestedUrl.username ||
			requestedUrl.password ||
			requestedUrl.hash
		) {
			throw new TypeError("Git request attempted to leave the configured repository origin");
		}
		const body = await collectBoundedBody(request.body, maxBytes);
		let method = request.method || "GET";
		for (let redirects = 0; redirects <= 5; redirects++) {
			const response = await http.request({
				...request,
				url: requestedUrl.toString(),
				method,
				body,
				fetchOptions: {
					...(request.fetchOptions || {}),
					followRedirects: false,
					maxRedirects: 0,
					timeout: 30_000,
				},
			});
			const location = response.headers?.location;
			if (![301, 302, 303, 307, 308].includes(response.statusCode) || !location) {
				if (response.url) {
					const responseUrl = new URL(response.url);
					if (responseUrl.origin !== repositoryUrl.origin || responseUrl.protocol !== "https:") {
						throw new TypeError("Cross-origin Git redirect refused");
					}
				}
				return { ...response, body: limitBody(response.body, maxBytes) };
			}
			for await (const _chunk of limitBody(response.body, maxBytes) || []) {
				// Drain the refused redirect response before reusing the connection.
			}
			const redirected = new URL(location, requestedUrl);
			if (
				redirected.origin !== repositoryUrl.origin ||
				redirected.protocol !== "https:" ||
				redirected.username ||
				redirected.password ||
				redirected.hash
			) {
				throw new TypeError("Cross-origin Git redirect refused");
			}
			if (!["GET", "HEAD"].includes(method) && ![307, 308].includes(response.statusCode)) {
				throw new TypeError("Git redirect attempted to rewrite a state-changing request");
			}
			if (response.statusCode === 303) method = "GET";
			requestedUrl = redirected;
		}
		throw new RangeError("Git request exceeded the redirect limit");
	},
});

export { DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_RESPONSE_BYTES, REDACTED };
