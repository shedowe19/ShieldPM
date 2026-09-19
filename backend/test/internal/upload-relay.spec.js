import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUploadRelay, relayConfigForHost, validateRelayConfigForHost } from "../../internal/upload-relay.js";

const temporaryDirectories = [];

const createTempRoot = () => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-upload-relay-"));
	temporaryDirectories.push(root);
	return root;
};

const host = (overrides = {}) => ({
	access_list: { clients: [], items: [{}], meta: {} },
	access_list_id: 1,
	enabled: true,
	forward_host: "10.0.17.4",
	forward_port: 8080,
	forward_scheme: "http",
	id: 42,
	upload_relay_chunk_size: 80 * 1024 * 1024,
	upload_relay_cleanup_hours: 24,
	upload_relay_enabled: true,
	upload_relay_max_file_size: 1024 * 1024 * 1024,
	upload_relay_path: "/_shieldpm-upload",
	upload_relay_target_path: "/api/import",
	...overrides,
});

const readBody = async (body) => {
	const parts = [];
	for await (const part of body) parts.push(part);
	return Buffer.concat(parts).toString("utf8");
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { force: true, recursive: true });
	vi.restoreAllMocks();
});

describe("Upload relay", () => {
	it("queues the completed upload for direct origin forwarding", async () => {
		const fetchImpl = vi.fn(async (_url, init) => {
			expect(await readBody(init.body)).toBe("abcdef");
			return new Response(null, { status: 201 });
		});
		const relay = createUploadRelay({ fetchImpl, getHost: async () => host(), root: createTempRoot() });

		const upload = await relay.create(42, { filename: "archive.zip", length: 6, mediaType: "application/zip" });
		expect(upload).toMatchObject({ offset: 0, path: "/_shieldpm-upload" });

		await expect(
			relay.append(42, upload.id, {
				contentLength: 3,
				headers: { authorization: "Bearer caller-token" },
				offset: 0,
				stream: Readable.from([Buffer.from("abc")]),
			}),
		).resolves.toMatchObject({ completed: false, offset: 3 });

		await expect(
			relay.append(42, upload.id, {
				contentLength: 3,
				headers: { authorization: "Bearer caller-token" },
				offset: 3,
				stream: Readable.from([Buffer.from("def")]),
			}),
		).resolves.toMatchObject({ completed: true, offset: 6, state: "queued" });

		await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
		expect(fetchImpl).toHaveBeenCalledWith(
			"http://10.0.17.4:8080/api/import",
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: "Bearer caller-token",
					"content-type": "application/zip",
					"x-shieldpm-upload-filename": "archive.zip",
				}),
				method: "POST",
				redirect: "error",
			}),
		);
		await vi.waitFor(async () =>
			expect(await relay.get(42, upload.id)).toMatchObject({ state: "completed", upstreamStatus: 201 }),
		);
	});

	it("rejects a stale upload offset without appending bytes", async () => {
		const relay = createUploadRelay({ fetchImpl: vi.fn(), getHost: async () => host(), root: createTempRoot() });
		const upload = await relay.create(42, { filename: "resume.bin", length: 6 });

		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: {},
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});

		await expect(
			relay.append(42, upload.id, {
				contentLength: 3,
				headers: {},
				offset: 0,
				stream: Readable.from([Buffer.from("def")]),
			}),
		).rejects.toMatchObject({ status: 409, uploadOffset: 3 });
		expect(await relay.get(42, upload.id)).toMatchObject({ offset: 3 });
	});

	it("allows a relay without a Proxy Host access list while retaining its storage limits", async () => {
		const noAccessListHost = host({ access_list: undefined, access_list_id: 0 });
		await expect(validateRelayConfigForHost(noAccessListHost)).resolves.toMatchObject({
			origin: "http://10.0.17.4:8080/api/import",
			path: "/_shieldpm-upload",
		});
		const relay = createUploadRelay({
			fetchImpl: vi.fn(),
			getHost: async () => noAccessListHost,
			root: createTempRoot(),
		});
		await expect(relay.create(42, { filename: "anonymous.bin", length: 5 * 1024 * 1024 })).resolves.toMatchObject({
			offset: 0,
			path: "/_shieldpm-upload",
		});
	});

	it("requires an Access List that actually enforces an upload authorization policy", () => {
		expect(() => relayConfigForHost(host({ access_list: { clients: [], items: [], meta: {} } }))).toThrow(
			"enforcing authentication or IP policy",
		);
		expect(() =>
			relayConfigForHost(
				host({
					access_list: {
						clients: [{ address: "all", directive: "allow" }],
						items: [{ username: "upload" }],
						meta: {},
						satisfy_any: true,
					},
				}),
			),
		).toThrow("enforcing authentication or IP policy");
		expect(() =>
			relayConfigForHost(
				host({
					access_list: {
						clients: [{ address: "all ", directive: "allow" }],
						items: [{ username: "upload" }],
						meta: {},
						satisfy_any: true,
					},
				}),
			),
		).toThrow("enforcing authentication or IP policy");
		expect(() =>
			relayConfigForHost(
				host({
					access_list: {
						clients: [{ address: "0.0.0.0/00", directive: "allow" }],
						items: [{ username: "upload" }],
						meta: {},
						satisfy_any: true,
					},
				}),
			),
		).toThrow("enforcing authentication or IP policy");
	});

	it("reserves the automatic Nextcloud upload namespace from generic relay paths", () => {
		expect(() => relayConfigForHost(host({ upload_relay_path: "/remote.php/dav/uploads" }))).toThrow(
			"reserved for automatic Nextcloud uploads",
		);
		expect(() => relayConfigForHost(host({ upload_relay_path: "/remote.php/dav/uploads/custom" }))).toThrow(
			"reserved for automatic Nextcloud uploads",
		);
	});

	it("validates relay configuration even while a Proxy Host is disabled", () => {
		expect(() => relayConfigForHost(host({ enabled: false }))).not.toThrow();
	});

	it("keeps a failed completed upload for a queued retry when the private origin rejects it", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const relay = createUploadRelay({
			fetchImpl,
			getHost: async () => host(),
			root: createTempRoot(),
		});
		const upload = await relay.create(42, { filename: "retry.bin", length: 3 });

		await expect(
			relay.append(42, upload.id, {
				contentLength: 3,
				headers: {},
				offset: 0,
				stream: Readable.from([Buffer.from("abc")]),
			}),
		).resolves.toMatchObject({ completed: true, offset: 3, state: "queued" });
		await vi.waitFor(async () => expect(await relay.get(42, upload.id)).toMatchObject({ state: "failed" }));

		await expect(relay.finalize(42, upload.id, {})).resolves.toMatchObject({
			completed: true,
			offset: 3,
			state: "queued",
		});
		await vi.waitFor(async () =>
			expect(await relay.get(42, upload.id)).toMatchObject({ state: "completed", upstreamStatus: 204 }),
		);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("reserves a bounded per-host pending-byte budget before writing upload state", async () => {
		const relay = createUploadRelay({
			fetchImpl: vi.fn(),
			getHost: async () =>
				host({
					upload_relay_chunk_size: 5 * 1024 * 1024,
					upload_relay_max_file_size: 5 * 1024 * 1024,
					upload_relay_max_pending_bytes: 5 * 1024 * 1024,
				}),
			root: createTempRoot(),
		});
		await relay.create(42, { filename: "first.bin", length: 5 * 1024 * 1024 });
		await expect(relay.create(42, { filename: "second.bin", length: 5 * 1024 * 1024 })).rejects.toThrow(
			"pending-byte limit",
		);
	});

	it("removes incomplete uploads after the configured cleanup period", async () => {
		const root = createTempRoot();
		const relay = createUploadRelay({
			fetchImpl: vi.fn(),
			getHost: async () => host({ upload_relay_cleanup_hours: 1 }),
			root,
		});
		const upload = await relay.create(42, { filename: "stale.bin", length: 3 });
		const metadataPath = join(root, "host-42", upload.id, "upload.json");
		const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
		metadata.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
		fs.writeFileSync(metadataPath, JSON.stringify(metadata));

		await expect(relay.cleanupExpired()).resolves.toBe(1);
		await expect(relay.get(42, upload.id)).rejects.toThrow("Not Found");
	});
});
