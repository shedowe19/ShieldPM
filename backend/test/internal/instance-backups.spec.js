import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({
	configGet: vi.fn().mockReturnValue({ engine: "knex-native" }),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: vi.fn((callback) => callback()) } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn().mockResolvedValue(undefined) } }));

describe("instance backup access and job boundaries", () => {
	let directory;
	let service;
	const access = { can: vi.fn().mockResolvedValue(true) };
	beforeEach(async () => {
		vi.resetModules();
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-backup-service-"));
		vi.stubEnv("DATA_PATH", directory);
		service = (await import("../../internal/instance-backups.js")).default;
		(await import("../../lib/config.js")).isDemoMode.mockReturnValue(false);
		(await import("../../internal/audit-log.js")).default.add.mockClear();
		access.can.mockReset().mockResolvedValue(true);
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});
	it("requires an administrator for every read and mutation before inspecting storage", async () => {
		const forbidden = { can: vi.fn().mockRejectedValue(new Error("permission denied")) };
		for (const action of [
			() => service.list(forbidden),
			() => service.download(forbidden, "id"),
			() => service.create(forbidden, { password: "long password" }),
			() => service.preflight(forbidden, "id", {}),
			() => service.restore(forbidden, "id", {}),
			() => service.cancel(forbidden),
			() => service.remove(forbidden, "id"),
			() => service.claimUpload(forbidden),
			() => service.upload(forbidden, Readable.from([])),
		])
			await expect(action()).rejects.toThrow("permission denied");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("reserves one operation slot before accepting upload bodies and releases idempotently", async () => {
		const release = await service.claimUpload(access);
		await expect(service.create(access, { password: "long synthetic password" })).rejects.toThrow(
			"Another instance",
		);
		await expect(service.claimUpload(access)).rejects.toThrow("Wait for");
		release();
		const nextRelease = await service.claimUpload(access);
		release();
		await expect(service.claimUpload(access)).rejects.toThrow("Wait for");
		nextRelease();
		expect(access.can).toHaveBeenCalledWith("settings:update");
	});
	it("refuses a mismatched restore confirmation before starting work", async () => {
		await expect(
			service.restore(access, "id", { password: "long synthetic password", confirmation: "RESTORE another" }),
		).rejects.toThrow("does not match");
		expect((await service.list(access)).jobs).toEqual([]);
	});
	it("never exposes an internal error or password through public jobs", async () => {
		// Inject a failure at the prototype boundary; the real job scheduler and catalog run.
		const module = await import("../../lib/instance-backup.js");
		vi.spyOn(module.InstanceBackup.prototype, "create").mockRejectedValue(
			new Error("private database password: never-public"),
		);
		const job = await service.create(access, { password: "long synthetic password", name: "test" });
		expect(job.status).toBe("running");
		await vi.waitFor(async () => expect((await service.list(access)).jobs[0].status).toBe("failed"));
		const publicState = JSON.stringify(await service.list(access));
		expect(publicState).not.toContain("never-public");
		expect(publicState).not.toContain("long synthetic password");
	});
	it("disables all backup reads and mutations in demo mode", async () => {
		(await import("../../lib/config.js")).isDemoMode.mockReturnValue(true);
		for (const action of [
			() => service.list(access),
			() => service.download(access, "id"),
			() => service.create(access, { password: "long synthetic password" }),
			() => service.preflight(access, "id", {}),
			() => service.restore(access, "id", {}),
			() => service.cancel(access),
			() => service.remove(access, "id"),
			() => service.claimUpload(access),
			() => service.upload(access, Readable.from([])),
		])
			await expect(action()).rejects.toThrow("disabled in demo mode");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("rejects noncanonical archive identifiers and symlink downloads", async () => {
		const id = "11111111-1111-4111-8111-111111111111";
		await service.list(access);
		const outside = path.join(directory, "private-source");
		await fs.writeFile(outside, "must not be downloaded");
		for (const invalid of ["../private-source", "..\\private-source", "-".repeat(36), `${id}\n`])
			await expect(service.download(access, invalid)).rejects.toThrow("Invalid backup identifier");
		await fs.symlink(outside, path.join(directory, "instance-backups", `${id}.spmb`));
		await expect(service.download(access, id)).rejects.toMatchObject({ status: 404 });
		expect(await fs.readFile(outside, "utf8")).toBe("must not be downloaded");
	});
	it("downloads the already opened archive even if its pathname is replaced", async () => {
		const id = "11111111-1111-4111-8111-111111111111";
		await service.list(access);
		const filename = path.join(directory, "instance-backups", `${id}.spmb`);
		const outside = path.join(directory, "private-source");
		await fs.writeFile(filename, "authorized archive");
		await fs.writeFile(outside, "private data");
		const opened = await service.download(access, id);
		await fs.rename(filename, `${filename}.old`);
		await fs.symlink(outside, filename);
		let content = "";
		for await (const chunk of opened.stream) content += chunk.toString();
		expect(content).toBe("authorized archive");
		expect(opened.size).toBe(Buffer.byteLength(content));
	});
	it("audits create/import/stage/cancel/delete using known setting records without secrets", async () => {
		const { InstanceBackup } = await import("../../lib/instance-backup.js");
		const audit = (await import("../../internal/audit-log.js")).default.add;
		const id = "11111111-1111-4111-8111-111111111111";
		const row = { id, name: "checkpoint", database: "sqlite" };
		vi.spyOn(InstanceBackup.prototype, "create").mockResolvedValue(row);
		vi.spyOn(InstanceBackup.prototype, "verify").mockImplementation(async (_id, _password, options) => {
			await options.beforeSchedule?.();
			return { valid: true, activation: "next_restart" };
		});
		vi.spyOn(InstanceBackup.prototype, "pending").mockResolvedValue(null);
		vi.spyOn(InstanceBackup.prototype, "cancel").mockResolvedValue(undefined);
		vi.spyOn(InstanceBackup.prototype, "remove").mockResolvedValue(undefined);
		const password = "private password never audited";
		await service.create(access, { password, name: row.name });
		await vi.waitFor(async () => expect((await service.list(access)).jobs[0].status).toBe("completed"));
		await service.restore(access, id, { password, confirmation: `RESTORE ${id}` });
		await vi.waitFor(async () => expect((await service.list(access)).jobs[0].status).toBe("completed"));
		await service.cancel(access);
		await service.remove(access, id);
		const release = await service.claimUpload(access);
		await service.upload(access, Readable.from([Buffer.concat([Buffer.from("SPMBKP01"), Buffer.alloc(52)])]));
		release();
		const records = audit.mock.calls.map((call) => call[1]);
		expect(records.map((record) => record.meta.operation)).toEqual([
			"backup_created",
			"restore_requested",
			"restore_validated",
			"restore_cancel_requested",
			"backup_delete_requested",
			"backup_imported",
		]);
		for (const record of records) {
			expect(record.object_type).toBe("setting");
			expect(record.object_id).toBe(0);
			expect(Object.keys(record.meta).sort()).toEqual(
				record.meta.operation === "backup_created"
					? ["backup_id", "name", "operation", "provider", "setting_id"]
					: ["backup_id", "operation", "setting_id"],
			);
		}
		expect(JSON.stringify(records)).not.toContain(password);
	});
});
