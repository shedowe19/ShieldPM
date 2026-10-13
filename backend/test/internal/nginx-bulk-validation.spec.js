import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import nginx from "../../internal/nginx.js";

describe("Nginx bulk validation outcome", () => {
	let directory;
	let rows;
	let model;
	let generate;
	let test;
	const filename = (id) => path.join(directory, `${id}.conf`);
	const groups = () => [{ model, hostType: "proxy_host", hosts: rows }];

	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-bulk-validation-"));
		rows = [
			{ id: 1, enabled: true, meta: { note: "preserved" } },
			{ id: 2, enabled: true, meta: {} },
		];
		model = {
			transaction: (callback) => callback({}),
			query: () => ({
				findById: (id) => ({
					withGraphFetched: async () => rows.find((row) => row.id === id),
					forUpdate: async () => rows.find((row) => row.id === id),
				}),
				where: (_field, id) => ({
					patch: async (data) =>
						Object.assign(
							rows.find((row) => row.id === id),
							data,
						),
				}),
			}),
		};
		vi.spyOn(nginx, "getConfigName").mockImplementation((_type, id) => filename(id));
		generate = vi.spyOn(nginx, "generateConfig").mockImplementation(async (_type, host) => {
			await fs.promises.writeFile(filename(host.id), `replacement ${host.id}`);
		});
		test = vi.spyOn(nginx, "test").mockResolvedValue("");
		for (const row of rows) await fs.promises.writeFile(filename(row.id), `working ${row.id}`);
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});

	it("throws a failed strict validation only after restoring every staged config and status", async () => {
		const failure = new Error("Nginx rejected replacement");
		test.mockRejectedValueOnce(failure);

		await expect(nginx.bulkGenerateConfigGroups(groups(), { throwOnError: true })).rejects.toBe(failure);

		for (const row of rows) {
			expect(await fs.promises.readFile(filename(row.id), "utf8")).toBe(`working ${row.id}`);
			expect(await fs.promises.readFile(`${filename(row.id)}.err`, "utf8")).toBe(`replacement ${row.id}`);
			expect(fs.existsSync(`${filename(row.id)}.bak`)).toBe(false);
			expect(row.meta.nginx_online).toBe(false);
			expect(row.meta.nginx_err).toContain(failure.message);
		}
		expect(rows[0].meta.note).toBe("preserved");
	});
	it.each([1, 2])("rejects a strict render failure on host %s and restores all affected files", async (failedId) => {
		const failure = new Error("Host render failed");
		generate.mockImplementation(async (_type, host) => {
			await fs.promises.writeFile(filename(host.id), `replacement ${host.id}`);
			if (host.id === failedId) throw failure;
		});

		await expect(nginx.bulkGenerateConfigGroups(groups(), { throwOnError: true })).rejects.toBe(failure);

		for (const row of rows) {
			expect(await fs.promises.readFile(filename(row.id), "utf8")).toBe(`working ${row.id}`);
			expect(fs.existsSync(`${filename(row.id)}.bak`)).toBe(false);
		}
		expect(test).not.toHaveBeenCalled();
		if (failedId === 2) expect(rows[0].meta.nginx_err).toContain(failure.message);
	});
	it("keeps rollback statuses for callers that use the legacy default", async () => {
		test.mockRejectedValueOnce(new Error("Nginx rejected replacement"));

		const statuses = await nginx.bulkGenerateConfigGroups(groups());

		expect(statuses).toHaveLength(2);
		for (const status of statuses) expect(status.nginx_online).toBe(false);
		for (const row of rows) {
			expect(await fs.promises.readFile(filename(row.id), "utf8")).toBe(`working ${row.id}`);
		}
	});
	it("commits and returns online statuses after a successful strict validation", async () => {
		const statuses = await nginx.bulkGenerateConfigGroups(groups(), { throwOnError: true });

		expect(test).toHaveBeenCalledOnce();
		expect(statuses).toEqual([
			{ note: "preserved", nginx_online: true, nginx_err: null },
			{
				nginx_online: true,
				nginx_err: null,
			},
		]);
		for (const row of rows) {
			expect(await fs.promises.readFile(filename(row.id), "utf8")).toBe(`replacement ${row.id}`);
			expect(fs.existsSync(`${filename(row.id)}.bak`)).toBe(false);
		}
	});
	it("preserves every previous listener when another host's status commit fails", async () => {
		const firstCommitted = Promise.withResolvers();
		const failure = new Error("Second host status write failed");
		const commit = nginx.commitStagedConfig;
		vi.spyOn(nginx, "commitStagedConfig").mockImplementation(async (stage, options) => {
			if (stage.host.id === 2) {
				await firstCommitted.promise;
				throw failure;
			}
			const status = await commit(stage, options);
			firstCommitted.resolve();
			return status;
		});

		await expect(nginx.bulkGenerateConfigGroups(groups(), { throwOnError: true })).rejects.toBe(failure);

		for (const row of rows) {
			expect(await fs.promises.readFile(filename(row.id), "utf8")).toBe(`working ${row.id}`);
			expect(row.meta.nginx_online).toBe(false);
		}
	});
	it("drains a slow status commit before rolling back and releasing the shared lock", async () => {
		const enteredCommit = Promise.withResolvers();
		const releaseCommit = Promise.withResolvers();
		const failure = new Error("First host status write failed");
		const commit = nginx.commitStagedConfig;
		vi.spyOn(nginx, "commitStagedConfig").mockImplementation(async (stage, options) => {
			if (stage.host.id === 1) throw failure;
			enteredCommit.resolve();
			await releaseCommit.promise;
			return commit(stage, options);
		});
		const operation = nginx.bulkGenerateConfigGroups(groups(), { throwOnError: true }).catch((error) => error);
		await enteredCommit.promise;
		let nextOperationStarted = false;
		const next = nginx.withConfigurationLock(() => {
			nextOperationStarted = true;
		});
		await new Promise((resolve) => setImmediate(resolve));
		expect(nextOperationStarted).toBe(false);
		expect(await fs.promises.readFile(filename(2), "utf8")).toBe("replacement 2");
		releaseCommit.resolve();
		expect(await operation).toBe(failure);
		await next;
		for (const row of rows) expect(await fs.promises.readFile(filename(row.id), "utf8")).toBe(`working ${row.id}`);
	});
	it("waits for every rollback even if another rollback rejects", async () => {
		const enteredRollback = Promise.withResolvers();
		const releaseRollback = Promise.withResolvers();
		const failure = new Error("First host rollback status failed");
		const rollback = nginx.rollbackStagedConfig;
		test.mockRejectedValueOnce(new Error("Rejected configuration"));
		vi.spyOn(nginx, "rollbackStagedConfig").mockImplementation(async (stage, error) => {
			if (stage.host.id === 1) {
				await rollback(stage, error);
				throw failure;
			}
			enteredRollback.resolve();
			await releaseRollback.promise;
			return rollback(stage, error);
		});
		const operation = nginx.bulkGenerateConfigGroups(groups()).catch((error) => error);
		await enteredRollback.promise;
		let nextOperationStarted = false;
		const next = nginx.withConfigurationLock(() => {
			nextOperationStarted = true;
		});
		await new Promise((resolve) => setImmediate(resolve));
		expect(nextOperationStarted).toBe(false);
		releaseRollback.resolve();
		expect(await operation).toBe(failure);
		await next;
		expect(await fs.promises.readFile(filename(2), "utf8")).toBe("working 2");
	});
	it("keeps validated listener files when only backup cleanup fails", async () => {
		const cleanup = nginx.deleteBackupConfig;
		vi.spyOn(nginx, "deleteBackupConfig").mockImplementation(async (kind, host) => {
			if (host.id === 2) throw new Error("Temporary backup unlink failure");
			return cleanup(kind, host);
		});
		const statuses = await nginx.bulkGenerateConfigGroups(groups(), { throwOnError: true });
		expect(statuses.every((status) => status.nginx_online)).toBe(true);
		for (const row of rows)
			expect(await fs.promises.readFile(filename(row.id), "utf8")).toBe(`replacement ${row.id}`);
		expect(await fs.promises.readFile(`${filename(2)}.bak`, "utf8")).toBe("working 2");
	});
});
