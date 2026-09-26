import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
	authenticated: true,
	can: vi.fn(),
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		if (!auth.authenticated) {
			next(Object.assign(new Error("Permission Denied"), { status: 403 }));
			return;
		}
		res.locals.access = { can: auth.can };
		next();
	},
}));

import errs from "../../lib/error.js";
import { createUploadRelayRouter } from "../../routes/nginx/upload-relay.js";

const relay = {
	append: vi.fn(),
	create: vi.fn(),
	finalize: vi.fn(),
	get: vi.fn(),
	remove: vi.fn(),
};

let server;
let origin;

beforeEach(async () => {
	vi.clearAllMocks();
	auth.authenticated = true;
	auth.can.mockReset().mockResolvedValue(true);
	relay.create.mockResolvedValue({
		id: "e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7",
		offset: 0,
		path: "/_shieldpm-upload",
	});
	relay.append.mockResolvedValue({ completed: false, offset: 3, state: "uploading" });
	relay.finalize.mockResolvedValue({ completed: true, offset: 6, state: "queued" });
	relay.get.mockResolvedValue({
		id: "e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7",
		length: 6,
		offset: 3,
		state: "forwarding",
	});
	relay.remove.mockResolvedValue();
	const app = express();
	app.use("/nginx/proxy-hosts/:hostId/upload-relay", createUploadRelayRouter(relay));
	app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
	server = await new Promise((resolve) => {
		const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
	});
	origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
	await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("authenticated proxy-host upload relay routes", () => {
	it("creates and resumes a TUS-compatible upload without parsing its binary chunk", async () => {
		const created = await fetch(`${origin}/nginx/proxy-hosts/42/upload-relay`, {
			headers: {
				"tus-resumable": "1.0.0",
				"upload-length": "6",
				"upload-metadata": "filename YXJjaGl2ZS56aXA=,content-type YXBwbGljYXRpb24vemlw",
			},
			method: "POST",
		});
		expect(created.status).toBe(201);
		expect(created.headers.get("location")).toBe("/_shieldpm-upload/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7");
		expect(created.headers.get("tus-resumable")).toBe("1.0.0");
		expect(created.headers.get("upload-offset")).toBe("0");
		expect(relay.create).toHaveBeenCalledWith(42, {
			filename: "archive.zip",
			length: 6,
			mediaType: "application/zip",
		});
		expect(auth.can).toHaveBeenCalledWith("proxy_hosts:update", 42);

		const patched = await fetch(
			`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7`,
			{
				body: Buffer.from("abc"),
				headers: {
					"content-length": "3",
					"content-type": "application/offset+octet-stream",
					"tus-resumable": "1.0.0",
					"upload-offset": "0",
				},
				method: "PATCH",
			},
		);
		expect(patched.status).toBe(204);
		expect(patched.headers.get("upload-offset")).toBe("3");
		expect(relay.append).toHaveBeenCalledWith(
			42,
			"e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7",
			expect.objectContaining({ contentLength: 3, offset: 0 }),
		);
		expect(auth.can).toHaveBeenCalledWith("proxy_hosts:update", 42);

		const resumed = await fetch(
			`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7`,
			{
				headers: { "tus-resumable": "1.0.0" },
				method: "HEAD",
			},
		);
		expect(resumed.status).toBe(200);
		expect(resumed.headers.get("cache-control")).toBe("no-store");
		expect(resumed.headers.get("upload-offset")).toBe("3");
		expect(resumed.headers.get("upload-relay-state")).toBe("forwarding");
		expect(auth.can).toHaveBeenCalledWith("proxy_hosts:get", 42);

		const status = await fetch(`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7`, {
			headers: { "tus-resumable": "1.0.0" },
		});
		expect(status.status).toBe(200);
		expect(await status.json()).toMatchObject({ id: "e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7", state: "forwarding" });
		expect(auth.can).toHaveBeenCalledWith("proxy_hosts:get", 42);
	});

	it("reports a tus offset conflict with the authoritative persisted offset", async () => {
		const conflict = new Error("stale offset");
		Object.assign(conflict, { uploadOffset: 3 });
		relay.append.mockRejectedValue(conflict);

		const response = await fetch(
			`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7`,
			{
				body: Buffer.from("abc"),
				headers: {
					"content-length": "3",
					"content-type": "application/offset+octet-stream",
					"tus-resumable": "1.0.0",
					"upload-offset": "0",
				},
				method: "PATCH",
			},
		);

		expect(response.status).toBe(409);
		expect(response.headers.get("tus-resumable")).toBe("1.0.0");
		expect(response.headers.get("upload-offset")).toBe("3");
	});

	it("queues an explicit origin-finalization retry after all chunks are persistent", async () => {
		const response = await fetch(
			`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7/finalize`,
			{ headers: { "tus-resumable": "1.0.0" }, method: "POST" },
		);

		expect(response.status).toBe(204);
		expect(response.headers.get("upload-offset")).toBe("6");
		expect(response.headers.get("upload-relay-state")).toBe("queued");
		expect(response.headers.get("upload-relay-upstream-status")).toBeNull();
		expect(relay.finalize).toHaveBeenCalledWith(42, "e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7", expect.any(Object));
		expect(auth.can).toHaveBeenCalledWith("proxy_hosts:update", 42);
	});

	it("rejects unsupported resumable protocol versions before creating storage", async () => {
		const response = await fetch(`${origin}/nginx/proxy-hosts/42/upload-relay`, {
			headers: { "tus-resumable": "0.9.0", "upload-length": "6" },
			method: "POST",
		});
		expect(response.status).toBe(412);
		expect(response.headers.get("tus-resumable")).toBe("1.0.0");
		expect(relay.create).not.toHaveBeenCalled();
	});

	it("keeps Tus-Resumable on validation and not-found error responses", async () => {
		const validation = await fetch(
			`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7`,
			{
				body: Buffer.from("abc"),
				headers: {
					"content-length": "3",
					"content-type": "application/octet-stream",
					"tus-resumable": "1.0.0",
				},
				method: "PATCH",
			},
		);
		expect(validation.status).toBe(400);
		expect(validation.headers.get("tus-resumable")).toBe("1.0.0");

		relay.get.mockRejectedValueOnce(Object.assign(new Error("not found"), { status: 404 }));
		const missing = await fetch(
			`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7`,
			{
				headers: { "tus-resumable": "1.0.0" },
			},
		);
		expect(missing.status).toBe(404);
		expect(missing.headers.get("tus-resumable")).toBe("1.0.0");
	});

	it.each(["GET", "HEAD"])("denies %s upload status without proxy-host read permission", async (method) => {
		auth.can.mockRejectedValueOnce(new errs.PermissionError());
		const response = await fetch(
			`${origin}/nginx/proxy-hosts/42/upload-relay/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7`,
			{ headers: { "tus-resumable": "1.0.0" }, method },
		);
		expect(response.status).toBe(403);
		expect(auth.can).toHaveBeenCalledWith("proxy_hosts:get", 42);
		expect(relay.get).not.toHaveBeenCalled();
	});

	it.each([
		{ method: "POST", path: "", headers: { "upload-length": "6" }, operation: "create" },
		{
			method: "PATCH",
			path: "/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7",
			headers: {
				"content-type": "application/offset+octet-stream",
				"content-length": "3",
				"upload-offset": "0",
			},
			body: Buffer.from("abc"),
			operation: "append",
		},
		{
			method: "POST",
			path: "/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7/finalize",
			operation: "finalize",
		},
		{ method: "DELETE", path: "/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7", operation: "remove" },
	])("denies $operation without proxy-host update permission", async ({ body, headers, method, operation, path }) => {
		auth.can.mockRejectedValueOnce(new errs.PermissionError());
		const response = await fetch(`${origin}/nginx/proxy-hosts/42/upload-relay${path}`, {
			body,
			headers: { "tus-resumable": "1.0.0", ...headers },
			method,
		});
		expect(response.status).toBe(403);
		expect(auth.can).toHaveBeenCalledWith("proxy_hosts:update", 42);
		expect(relay[operation]).not.toHaveBeenCalled();
	});

	it.each(["GET", "POST"])("denies an unauthenticated %s request before accessing relay storage", async (method) => {
		auth.authenticated = false;
		const url = `${origin}/nginx/proxy-hosts/42/upload-relay${method === "GET" ? "/e07f1dda-c1e4-44af-b0ec-cf5c036fa0d7" : ""}`;
		const response = await fetch(url, {
			headers: { "tus-resumable": "1.0.0", "upload-length": "6" },
			method,
		});
		expect(response.status).toBe(403);
		expect(auth.can).not.toHaveBeenCalled();
		expect(relay.get).not.toHaveBeenCalled();
		expect(relay.create).not.toHaveBeenCalled();
	});
});
