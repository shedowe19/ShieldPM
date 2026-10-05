import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, payload: { attrs: { id: 7 }, scope: ["user"] } }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "1".repeat(64),
}));
vi.mock("../../models/token.js", () => ({
	default: () => ({
		load: async () => state.payload,
		get: (key) => state.payload[key],
		hasScope: (scope) => state.payload.scope.includes(scope),
		getUserId: () => 7,
	}),
}));

import { createUploadRelay } from "../../internal/upload-relay.js";
import Access from "../../lib/access.js";
import { createUploadRelayRouter } from "../../routes/nginx/upload-relay.js";

const headers = { "tus-resumable": "1.0.0" };
const operations = [
	{ name: "status", method: "GET", operation: "get", status: 200 },
	{ name: "resume", method: "HEAD", operation: "get", status: 200 },
	{ name: "create", method: "POST", operation: "create", status: 201, path: "", headers: { "upload-length": "6" } },
	{
		name: "append",
		method: "PATCH",
		operation: "append",
		status: 204,
		body: "def",
		headers: { "content-length": "3", "content-type": "application/offset+octet-stream", "upload-offset": "3" },
	},
	{ name: "finalize", method: "POST", operation: "finalize", status: 204, suffix: "/finalize" },
	{ name: "delete", method: "DELETE", operation: "remove", status: 204 },
];
let server;
let root;
let origin;
let relay;
const setPermission = (visibility = "user", permission = "manage") =>
	state.db("user_permission").where("user_id", 7).update({ visibility, proxy_hosts: permission });
const session = async (hostId, operation) => {
	const upload = await relay.create(hostId, { filename: "owner-document.zip", length: 6 });
	await relay.append(hostId, upload.id, {
		contentLength: 3,
		offset: 0,
		headers: {},
		stream: Readable.from([Buffer.from("abc")]),
	});
	if (operation.name === "finalize")
		await relay.append(hostId, upload.id, {
			contentLength: 3,
			offset: 3,
			headers: {},
			stream: Readable.from([Buffer.from("def")]),
		});
	return upload.id;
};
const request = (hostId, id, operation) =>
	fetch(`${origin}/nginx/proxy-hosts/${hostId}/upload-relay${operation.path ?? `/${id}${operation.suffix || ""}`}`, {
		method: operation.method,
		headers: { ...headers, ...operation.headers },
		body: operation.body,
	});
const spyOperations = () =>
	operations
		.map(({ operation }) => operation)
		.filter((value, index, array) => array.indexOf(value) === index)
		.map((name) => vi.spyOn(relay, name));
const metadata = (hostId, id) => readFile(join(root, `host-${hostId}`, id, "upload.json"), "utf8");
beforeAll(async () => {
	await state.db.schema.createTable("user", (t) => {
		t.integer("id").primary();
		t.json("roles");
		t.integer("is_deleted");
		t.integer("is_disabled");
	});
	await state.db.schema.createTable("user_permission", (t) => {
		t.integer("id").primary();
		t.integer("user_id");
		t.string("visibility");
		t.string("proxy_hosts");
	});
	await state.db.schema.createTable("proxy_host", (t) => {
		t.integer("id").primary();
		t.integer("owner_user_id");
		t.integer("is_deleted");
		t.integer("enabled");
		t.string("forward_scheme");
		t.string("forward_host");
		t.integer("forward_port");
		t.integer("access_list_id");
		t.integer("upload_relay_enabled");
	});
	await state.db.schema.createTable("access_list", (t) => {
		t.integer("id").primary();
		t.integer("is_deleted");
	});
	await state.db("user").insert({ id: 7, roles: "[]", is_deleted: 0, is_disabled: 0 });
	await state.db("user_permission").insert({ id: 1, user_id: 7, visibility: "user", proxy_hosts: "manage" });
	for (const [id, ownerUserId, isDeleted] of [
		[11, 7, 0],
		[12, 8, 0],
		[13, 7, 1],
	])
		await state.db("proxy_host").insert({
			id,
			owner_user_id: ownerUserId,
			is_deleted: isDeleted,
			enabled: 1,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 80,
			access_list_id: 0,
			upload_relay_enabled: 1,
		});
	const app = express();
	app.use((_req, res, next) => {
		res.locals.token = "relay-test-token-placeholder";
		next();
	});
	app.use(
		"/nginx/proxy-hosts/:hostId/upload-relay",
		createUploadRelayRouter({
			create: (...args) => relay.create(...args),
			get: (...args) => relay.get(...args),
			append: (...args) => relay.append(...args),
			finalize: (...args) => relay.finalize(...args),
			remove: (...args) => relay.remove(...args),
		}),
	);
	app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
	server = await new Promise((resolve) => {
		const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
	});
	origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "shieldpm-relay-owner-test-"));
	relay = createUploadRelay({ root, schedule: () => {}, fetchImpl: vi.fn() });
	await setPermission();
});
afterEach(async () => {
	vi.restoreAllMocks();
	await relay.stop();
	await rm(root, { recursive: true, force: true });
});
afterAll(async () => {
	await new Promise((resolve) => server.close(resolve));
	await state.db.destroy();
});
describe("upload relay host visibility with real Access, SQLite and session storage", () => {
	it.each(operations)("rejects foreign-owner $name before accessing session storage", async (operation) => {
		const id = await session(12, operation);
		const previous = await metadata(12, id);
		const spies = spyOperations();
		const access = new Access("relay-test-token-placeholder");
		await access.load();
		expect(
			(await access.can(`proxy_hosts:${["GET", "HEAD"].includes(operation.method) ? "get" : "update"}`, 12))
				.permission_visibility,
		).toBe("user");
		const response = await request(12, id, operation);
		expect(response.status).toBe(404);
		for (const spy of spies) expect(spy).not.toHaveBeenCalled();
		expect(await metadata(12, id)).toBe(previous);
		expect(await readdir(join(root, "host-12"))).toEqual([id]);
	});
	describe.each([
		{ visibility: "user", hostId: 11 },
		{ visibility: "all", hostId: 12 },
	])("allowed $visibility visibility", ({ visibility, hostId }) => {
		it.each(operations)("allows $name for an authorized active host", async (operation) => {
			await setPermission(visibility);
			const id = await session(hostId, operation);
			const spy = vi.spyOn(relay, operation.operation);
			const response = await request(hostId, id, operation);
			expect(response.status).toBe(operation.status);
			expect(spy).toHaveBeenCalled();
			if (operation.method === "GET")
				expect(await response.json()).toMatchObject({ filename: "owner-document.zip", length: 6, offset: 3 });
			if (operation.method === "HEAD") expect(response.headers.get("upload-offset")).toBe("3");
			if (operation.name === "append") expect(JSON.parse(await metadata(hostId, id)).offset).toBe(6);
			if (operation.name === "delete") expect(await readdir(join(root, `host-${hostId}`))).toEqual([]);
		});
	});
	it.each(operations.filter((operation) => ["GET", "HEAD"].includes(operation.method)))(
		"permits own-host $name with view permission",
		async (operation) => {
			await setPermission("user", "view");
			const id = await session(11, operation);
			expect((await request(11, id, operation)).status).toBe(200);
		},
	);
	it.each(operations.filter((operation) => !["GET", "HEAD"].includes(operation.method)))(
		"denies $name with view permission before modifying storage",
		async (operation) => {
			await setPermission("user", "view");
			const id = await session(11, operation);
			const previous = await metadata(11, id);
			const spies = spyOperations();
			expect((await request(11, id, operation)).status).toBe(403);
			for (const spy of spies) expect(spy).not.toHaveBeenCalled();
			expect(await metadata(11, id)).toBe(previous);
		},
	);
	it.each([13, 999])(
		"rejects deleted or absent host %s before session access, even with all visibility",
		async (hostId) => {
			await setPermission("all");
			const spies = spyOperations();
			expect((await request(hostId, "00000000-0000-4000-8000-000000000000", operations[0])).status).toBe(404);
			expect((await request(hostId, "ignored", operations[2])).status).toBe(404);
			for (const spy of spies) expect(spy).not.toHaveBeenCalled();
			expect(await readdir(root)).toEqual([]);
		},
	);
});
