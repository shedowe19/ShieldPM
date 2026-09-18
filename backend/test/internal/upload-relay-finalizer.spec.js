import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUploadRelay } from "../../internal/upload-relay.js";

const temporaryDirectories = [];

const createTempRoot = () => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-upload-relay-finalizer-"));
	temporaryDirectories.push(root);
	return root;
};

const host = () => ({
	access_list: { clients: [], items: [{ username: "upload" }], meta: {} },
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
});

const readBody = async (body) => {
	const chunks = [];
	for await (const chunk of body) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf8");
};

const runNextScheduled = (scheduled) => {
	const task = scheduled.shift();
	expect(task).toBeTypeOf("function");
	task();
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { force: true, recursive: true });
	vi.restoreAllMocks();
});

describe("Upload relay asynchronous finalizer", () => {
	it("acknowledges the final public chunk while its origin transfer is still pending", async () => {
		const scheduled = [];
		const originResponse = Promise.withResolvers();
		const fetchImpl = vi.fn(async (_url, init) => {
			expect(await readBody(init.body)).toBe("abcdef");
			return await originResponse.promise;
		});
		const root = createTempRoot();
		const relay = createUploadRelay({
			fetchImpl,
			getHost: async () => host(),
			root,
			schedule: (task) => scheduled.push(task),
		});
		const upload = await relay.create(42, { filename: "archive.zip", length: 6, mediaType: "application/zip" });

		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: { authorization: "Bearer caller-token" },
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});
		const finalResult = await relay.append(42, upload.id, {
			contentLength: 3,
			headers: { authorization: "Bearer caller-token" },
			offset: 3,
			stream: Readable.from([Buffer.from("def")]),
		});

		expect(finalResult).toMatchObject({ completed: true, offset: 6, state: "queued" });
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(await relay.get(42, upload.id)).toMatchObject({ state: "queued" });
		expect(scheduled).toHaveLength(1);

		runNextScheduled(scheduled);
		await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
		expect(await relay.get(42, upload.id)).toMatchObject({ state: "forwarding" });

		originResponse.resolve(new Response(null, { status: 201 }));
		await vi.waitFor(async () =>
			expect(await relay.get(42, upload.id)).toMatchObject({ state: "completed", upstreamStatus: 201 }),
		);
		await vi.waitFor(() => expect(fs.readdirSync(join(root, "host-42", upload.id))).toEqual(["upload.json"]));
	});

	it("does not replay an authenticated queued upload after a process restart", async () => {
		const root = createTempRoot();
		const scheduled = [];
		const relay = createUploadRelay({
			fetchImpl: vi.fn(),
			getHost: async () => host(),
			root,
			schedule: (task) => scheduled.push(task),
		});
		const upload = await relay.create(42, { filename: "restart.bin", length: 3 });
		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: { authorization: "Bearer caller-token" },
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});

		const restarted = createUploadRelay({ fetchImpl: vi.fn(), getHost: async () => host(), root });
		await restarted.recoverInterruptedFinalizations();
		expect(await restarted.get(42, upload.id)).toMatchObject({
			failureCode: "restart-requires-authorization",
			state: "failed",
		});
	});

	it("does not automatically replay an origin transfer interrupted after dispatch", async () => {
		const root = createTempRoot();
		const scheduled = [];
		const relay = createUploadRelay({
			fetchImpl: vi.fn(),
			getHost: async () => host(),
			root,
			schedule: (task) => scheduled.push(task),
		});
		const upload = await relay.create(42, { filename: "interrupted.bin", length: 3 });
		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: {},
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});
		const metadataPath = join(root, "host-42", upload.id, "upload.json");
		const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
		metadata.state = "forwarding";
		fs.writeFileSync(metadataPath, JSON.stringify(metadata));

		const restarted = createUploadRelay({ fetchImpl: vi.fn(), getHost: async () => host(), root });
		await restarted.recoverInterruptedFinalizations();
		expect(await restarted.get(42, upload.id)).toMatchObject({
			failureCode: "interrupted-forwarding",
			state: "failed",
		});
		expect(scheduled).toHaveLength(1);
	});

	it("cancels a forwarding upload without publishing it as completed", async () => {
		const scheduled = [];
		const fetchImpl = vi.fn(
			async (_url, init) =>
				await new Promise((_resolve, reject) => {
					init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				}),
		);
		const relay = createUploadRelay({
			fetchImpl,
			getHost: async () => host(),
			root: createTempRoot(),
			schedule: (task) => scheduled.push(task),
		});
		const upload = await relay.create(42, { filename: "cancel.bin", length: 3 });
		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: {},
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});
		runNextScheduled(scheduled);
		await vi.waitFor(async () => expect(await relay.get(42, upload.id)).toMatchObject({ state: "forwarding" }));

		await relay.remove(42, upload.id);
		await vi.waitFor(async () => expect(relay.get(42, upload.id)).rejects.toThrow("Not Found"));
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("fails safely when the relay origin or forwarding policy changes after queueing", async () => {
		const scheduled = [];
		let currentHost = host();
		const fetchImpl = vi.fn();
		const relay = createUploadRelay({
			fetchImpl,
			getHost: async () => currentHost,
			root: createTempRoot(),
			schedule: (task) => scheduled.push(task),
		});
		const upload = await relay.create(42, { filename: "changed-target.bin", length: 3 });
		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: { authorization: "Bearer caller-token" },
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});
		currentHost = { ...host(), forward_host: "10.0.17.99" };

		runNextScheduled(scheduled);
		await vi.waitFor(async () =>
			expect(await relay.get(42, upload.id)).toMatchObject({
				failureCode: "configuration-changed",
				state: "failed",
			}),
		);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("does not forward a queued caller credential after its Access List policy changes", async () => {
		const scheduled = [];
		let currentHost = {
			...host(),
			access_list: { clients: [], items: [{ password: "$2b$old", username: "upload" }], meta: {} },
		};
		const fetchImpl = vi.fn();
		const relay = createUploadRelay({
			fetchImpl,
			getHost: async () => currentHost,
			root: createTempRoot(),
			schedule: (task) => scheduled.push(task),
		});
		const upload = await relay.create(42, { filename: "changed-policy.bin", length: 3 });
		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: { authorization: "Basic Y2FsbGVyOnRva2Vu" },
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});
		currentHost = {
			...host(),
			access_list: { clients: [], items: [{ password: "$2b$new", username: "upload" }], meta: {} },
		};

		runNextScheduled(scheduled);
		await vi.waitFor(async () =>
			expect(await relay.get(42, upload.id)).toMatchObject({
				failureCode: "configuration-changed",
				state: "failed",
			}),
		);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("revalidates the origin immediately before dispatching a queued transfer", async () => {
		const scheduled = [];
		let hostLookups = 0;
		let currentHost = host();
		const fetchImpl = vi.fn();
		const relay = createUploadRelay({
			fetchImpl,
			getHost: async () => {
				const resolvedHost = currentHost;
				hostLookups += 1;
				if (hostLookups === 3) currentHost = { ...host(), forward_host: "10.0.17.100" };
				return resolvedHost;
			},
			root: createTempRoot(),
			schedule: (task) => scheduled.push(task),
		});
		const upload = await relay.create(42, { filename: "late-changed-target.bin", length: 3 });
		await relay.append(42, upload.id, {
			contentLength: 3,
			headers: { authorization: "Bearer caller-token" },
			offset: 0,
			stream: Readable.from([Buffer.from("abc")]),
		});

		runNextScheduled(scheduled);
		await vi.waitFor(async () =>
			expect(await relay.get(42, upload.id)).toMatchObject({
				failureCode: "configuration-changed",
				state: "failed",
			}),
		);
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
