import { createServer } from "node:http";
import { Readable } from "node:stream";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	download: vi.fn(),
	remove: vi.fn(),
	restore: vi.fn(),
	audit: vi.fn(),
}));
vi.mock("../../internal/instance-backups.js", () => ({
	default: {
		list: vi.fn(),
		create: vi.fn(),
		cancel: vi.fn(),
		download: mocks.download,
		remove: mocks.remove,
		preflight: vi.fn(),
		restore: mocks.restore,
		upload: vi.fn(),
		claimUpload: vi.fn(),
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.audit } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { can: async () => true, token: { getUserId: () => 7 } };
		next();
	},
}));
vi.mock("../../lib/instance-backup.js", () => ({ MAX_BACKUP_BYTES: 1024 }));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, payload) => payload }));

import router from "../../routes/backups.js";

const id = "8f0b7e42-3c0a-4a6b-9a1f-2f3c4d5e6f70";
let server;
let origin;

const request = (path, options = {}) => fetch(`${origin}/api/backups${path}`, options);

beforeAll(async () => {
	const app = express();
	app.use(express.json());
	app.use("/api/backups", router);
	server = createServer(app);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
	await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
	mocks.download.mockReset();
	mocks.remove.mockReset().mockResolvedValue(true);
	mocks.restore.mockReset().mockResolvedValue({ job: "restore", status: "accepted" });
	mocks.audit.mockReset().mockResolvedValue({ id: 1 });
});

describe("backup export and restore audit trail", () => {
	it("audits a completed backup download with object id, size and outcome", async () => {
		mocks.download.mockResolvedValue({ stream: Readable.from([Buffer.from("SPMB")]), size: 4 });

		const response = await request(`/${id}/download`);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("SPMB");
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "downloaded",
				object_type: "setting",
				outcome: "success",
				meta: expect.objectContaining({ setting_id: "instance-backups", backup_id: id, size: 4 }),
			}),
		);
	});

	it("still delivers the archive when the audit insert fails", async () => {
		mocks.download.mockResolvedValue({ stream: Readable.from([Buffer.from("SPMB")]), size: 4 });
		mocks.audit.mockRejectedValue(new Error("audit unavailable"));

		const response = await request(`/${id}/download`);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("SPMB");
	});

	it("audits deletion with the object id and outcome", async () => {
		const response = await request(`/${id}`, { method: "DELETE" });

		expect(response.status).toBe(200);
		expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), id);
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "deleted",
				outcome: "success",
				meta: expect.objectContaining({ backup_id: id }),
			}),
		);
	});

	it("audits an accepted restore request", async () => {
		const response = await request(`/${id}/restore`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "correct horse battery" }),
		});

		expect(response.status).toBe(202);
		expect(mocks.restore).toHaveBeenCalledWith(expect.anything(), id, { password: "correct horse battery" });
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "restored",
				outcome: "success",
				meta: expect.objectContaining({ backup_id: id }),
			}),
		);
	});
});
