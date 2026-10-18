import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ uploadPath: null }));
vi.mock("../../lib/config.js", () => ({
	configGet: vi.fn().mockReturnValue({ engine: "knex-native" }),
	isDemoMode: () => false,
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { can: async () => true };
		next();
	},
}));
vi.mock("../../lib/instance-backup.js", async (importOriginal) => ({
	...(await importOriginal()),
	MAX_BACKUP_BYTES: 1024,
}));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: (callback) => callback() } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: async () => {} } }));
vi.mock("express-fileupload", async (importOriginal) => {
	const original = await importOriginal();
	return {
		default: (options) => {
			const middleware = original.default(options);
			return (req, res, next) => {
				if (state.uploadPath === null) return middleware(req, res, next);
				req.files = { archive: { tempFilePath: state.uploadPath, truncated: false } };
				next();
			};
		},
	};
});

describe("instance backup HTTP filesystem boundaries", () => {
	let directory;
	let server;
	let origin;
	beforeEach(async () => {
		vi.resetModules();
		state.uploadPath = null;
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-backup-route-"));
		vi.stubEnv("DATA_PATH", directory);
		const app = express();
		app.use(express.json());
		app.use("/api/backups", (await import("../../routes/backups.js")).default);
		app.use((error, _req, res, _next) => {
			if (res.headersSent) return res.destroy(error);
			res.status(error.status || 500).json({ error: error.message });
		});
		server = http.createServer(app);
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		origin = `http://127.0.0.1:${server.address().port}/api/backups`;
	});
	afterEach(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});
	const body = () => {
		const form = new FormData();
		form.append(
			"archive",
			new Blob([Buffer.concat([Buffer.from("SPMBKP01"), Buffer.alloc(52)])]),
			"../../outside.spmb",
		);
		return form;
	};
	it("rejects encoded traversal and malformed UUIDs before archive downloads", async () => {
		for (const id of ["../outside", "..\\outside", "-".repeat(36), "11111111-1111-4111-8111-111111111111\n"])
			expect((await fetch(`${origin}/${encodeURIComponent(id)}/download`)).status).toBe(400);
	});
	it("accepts a real multipart archive and streams the exact stored bytes", async () => {
		const uploaded = await fetch(`${origin}/upload`, { method: "POST", body: body() });
		expect(uploaded.status).toBe(201);
		const archive = await uploaded.json();
		const response = await fetch(`${origin}/${archive.id}/download`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-disposition")).toContain(`shieldpm-${archive.id}.spmb`);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(
			Buffer.concat([Buffer.from("SPMBKP01"), Buffer.alloc(52)]),
		);
		expect(await fs.readdir(path.join(directory, "instance-backups", ".uploads"))).toEqual([]);
		expect(await fs.readdir(directory)).toEqual(["instance-backups"]);
	});
	it.each(["wrong field", "duplicate file", "truncated", "invalid archive", "malformed multipart"])(
		"cleans request-owned temporary files after %s",
		async (kind) => {
			const uploadRoot = path.join(directory, "instance-backups", ".uploads");
			await fs.mkdir(uploadRoot, { recursive: true });
			const foreign = path.join(uploadRoot, "another-owner-file");
			await fs.writeFile(foreign, "must remain");
			let requestBody;
			let headers;
			if (kind === "malformed multipart") {
				headers = { "Content-Type": "multipart/form-data; boundary=fixture" };
				requestBody =
					'--fixture\r\nContent-Disposition: form-data; name="archive"; filename="fixture.spmb"\r\n\r\nunfinished';
			} else {
				requestBody = new FormData();
				requestBody.append(
					kind === "wrong field" ? "wrong-field" : "archive",
					new Blob([kind === "truncated" ? Buffer.alloc(2048) : "invalid archive"]),
					"fixture.spmb",
				);
				if (kind === "duplicate file") requestBody.append("archive", new Blob(["second"]), "second.spmb");
			}
			const response = await fetch(`${origin}/upload`, { method: "POST", body: requestBody, headers });
			expect(response.status).toBe(kind === "truncated" ? 413 : 400);
			expect(await fs.readdir(uploadRoot)).toEqual(["another-owner-file"]);
			expect(await fs.readFile(foreign, "utf8")).toBe("must remain");
			// A rejected upload must release its slot after cleanup, allowing a legitimate next request.
			expect((await fetch(`${origin}/upload`, { method: "POST", body: body() })).status).toBe(201);
			expect(await fs.readdir(uploadRoot)).toEqual(["another-owner-file"]);
		},
	);
	it("cleans an aborted multipart writer and releases its operation slot", async () => {
		const uploadRoot = path.join(directory, "instance-backups", ".uploads");
		const request = http.request(`${origin}/upload`, {
			method: "POST",
			headers: { "Content-Type": "multipart/form-data; boundary=fixture", "Transfer-Encoding": "chunked" },
		});
		request.on("error", () => {});
		request.write(
			'--fixture\r\nContent-Disposition: form-data; name="archive"; filename="fixture.spmb"\r\n\r\npartial body',
		);
		await vi.waitFor(async () => {
			const children = await fs.readdir(uploadRoot);
			expect(children).toHaveLength(1);
			expect(await fs.readdir(path.join(uploadRoot, children[0]))).toHaveLength(1);
		});
		request.destroy();
		await vi.waitFor(async () => expect(await fs.readdir(uploadRoot)).toEqual([]));
		expect((await fetch(`${origin}/upload`, { method: "POST", body: body() })).status).toBe(201);
		expect(await fs.readdir(uploadRoot)).toEqual([]);
	});
	it("does not read or remove forged temporary paths outside the private upload root", async () => {
		const outside = path.join(directory, "private-source");
		await fs.writeFile(outside, "must remain private");
		state.uploadPath = outside;
		const response = await fetch(`${origin}/upload`, { method: "POST" });
		expect(response.status).toBe(400);
		expect(await fs.readFile(outside, "utf8")).toBe("must remain private");
		expect((await (await fetch(origin)).json()).backups).toEqual([]);
	});
	it("rejects upload directory symlinks before middleware writes any data", async () => {
		await fs.mkdir(path.join(directory, "instance-backups"));
		const outside = path.join(directory, "outside");
		await fs.mkdir(outside);
		await fs.symlink(outside, path.join(directory, "instance-backups", ".uploads"));
		expect((await fetch(`${origin}/upload`, { method: "POST", body: body() })).status).toBe(400);
		expect(await fs.readdir(outside)).toEqual([]);
	});
	it("does not follow a temporary upload file symlink", async () => {
		const temporary = path.join(directory, "instance-backups", ".uploads");
		await fs.mkdir(temporary, { recursive: true });
		const outside = path.join(directory, "private-source");
		await fs.writeFile(outside, "must remain private");
		state.uploadPath = path.join(temporary, "generated-upload");
		await fs.symlink(outside, state.uploadPath);
		expect((await fetch(`${origin}/upload`, { method: "POST" })).status).toBe(400);
		expect(await fs.readFile(outside, "utf8")).toBe("must remain private");
	});
});
