import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const state = vi.hoisted(() => ({ database: null, directory: "", children: [] }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	isDemoMode: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/nginx.js", () => ({
	default: { bulkGenerateConfigGroups: vi.fn(), reload: vi.fn(), withConfigurationLock: (callback) => callback() },
}));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ assertMonitorConfig: vi.fn(), default: {} }));
vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	migrate: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal();
	const { EventEmitter } = await import("node:events");
	return {
		...actual,
		spawn: vi.fn(() => {
			const child = Object.assign(new EventEmitter(), {
				stdout: new EventEmitter(),
				stderr: new EventEmitter(),
				kill: vi.fn(),
			});
			state.children.push(child);
			return child;
		}),
	};
});
// Exercise the production GitOps path checks and filesystem against an isolated temporary root.
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal();
	const map = (value) =>
		typeof value === "string" && value.startsWith("/data/gitops")
			? value.replace("/data/gitops", state.directory)
			: value;
	const promises = new Proxy(actual.default.promises, {
		get: (target, key) =>
			typeof target[key] === "function" ? (...args) => target[key](...args.map(map)) : target[key],
	});
	return {
		...actual,
		default: { ...actual.default, existsSync: (value) => actual.default.existsSync(map(value)), promises },
	};
});
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal();
	const map = (value) =>
		typeof value === "string" && value.startsWith("/data/gitops")
			? value.replace("/data/gitops", state.directory)
			: value;
	const mapped = Object.fromEntries(
		Object.entries(actual).map(([key, value]) => [
			key,
			typeof value === "function" ? (...args) => value(...args.map(map)) : value,
		]),
	);
	return { ...mapped, default: mapped };
});

import cloudflared from "../../internal/cloudflared.js";
import gitops from "../../internal/gitops.js";
import Tunnel from "../../models/cloudflared_tunnel.js";

const access = { can: async () => true, token: { getUserId: () => 1 } };
const tunnelDirectory = () => path.join(state.directory, "shieldpm-config", "cloudflared-tunnels");
const importConfig = (overwrite = true) => gitops.importConfig(access, { overwrite });
const startTunnel = async () => {
	const tunnel = await Tunnel.query().insertAndFetch({
		name: "Live tunnel",
		token: "synthetic-token",
		owner_user_id: 1,
		meta: {},
	});
	const running = cloudflared.start(tunnel);
	await vi.waitFor(() => expect(state.children).toHaveLength(1));
	await vi.advanceTimersByTimeAsync(2500);
	await running;
	expect((await Tunnel.query().findById(tunnel.id)).status).toBe(2);
	return { tunnel, child: state.children[0] };
};

describe("GitOps Cloudflared pruning uses the process lifecycle", () => {
	beforeAll(async () => {
		const directory = backendSourcePath("migrations");
		for (const filename of (await fs.readdir(directory)).filter((name) => name.endsWith(".js")).sort()) {
			await (await import(path.join(directory, filename))).up(state.database);
		}
	});
	beforeEach(async () => {
		state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-cloudflared-"));
		state.children = [];
		await state.database("cloudflared_tunnel").delete();
		await fs.mkdir(tunnelDirectory(), { recursive: true });
		await fs.writeFile(path.join(tunnelDirectory(), ".gitkeep"), "");
		vi.useFakeTimers();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		for (const row of await Tunnel.query()) await cloudflared.stop(row.id);
		vi.useRealTimers();
		await fs.rm(state.directory, { recursive: true, force: true });
	});
	afterAll(async () => state.database.destroy());

	it("soft-deletes before signalling the child and returns success only after stopping it", async () => {
		const { tunnel, child } = await startTunnel();
		const softDeleteStates = [];
		state.database.on("query", function observe(query) {
			if (query.sql.startsWith("update `cloudflared_tunnel`") && query.sql.includes("`is_deleted` =")) {
				softDeleteStates.push("deleted");
			}
			if (query.sql.startsWith("update `cloudflared_tunnel`") && query.sql.includes("`status` =")) {
				softDeleteStates.push("stopped");
				state.database.removeListener("query", observe);
			}
		});
		expect(await importConfig()).toMatchObject({ success: true, deleted: 1, errors: [] });
		expect(await Tunnel.query().findById(tunnel.id)).toMatchObject({ is_deleted: true, status: 0 });
		expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
		expect(softDeleteStates).toEqual(["deleted", "stopped"]);
		await cloudflared.start(tunnel);
		expect(state.children).toHaveLength(1);
	});

	it.each([false, true])("keeps an unchanged imported tunnel running with overwrite=%s", async (overwrite) => {
		const { tunnel, child } = await startTunnel();
		await fs.writeFile(
			path.join(tunnelDirectory(), `${tunnel.id}.yaml`),
			`id: ${tunnel.id}\nname: Live tunnel\ntoken: synthetic-token\nowner_user_id: 1\nmeta: {}\n`,
		);
		expect(await importConfig(overwrite)).toMatchObject({ success: true, deleted: 0, errors: [] });
		expect((await Tunnel.query().findById(tunnel.id)).is_deleted).toBe(false);
		expect(child.kill).not.toHaveBeenCalled();
	});

	it.each(["without overwrite", "without a module directory"])("does not prune %s", async (mode) => {
		const { tunnel, child } = await startTunnel();
		if (mode === "without a module directory") await fs.rm(tunnelDirectory(), { recursive: true });
		expect(await importConfig(mode !== "without overwrite")).toMatchObject({
			success: true,
			deleted: 0,
			errors: [],
		});
		expect((await Tunnel.query().findById(tunnel.id)).is_deleted).toBe(false);
		expect(child.kill).not.toHaveBeenCalled();
	});

	it("keeps the child running when the database rejects its soft deletion", async () => {
		const { tunnel, child } = await startTunnel();
		await state.database.raw(
			"CREATE TRIGGER reject_tunnel_prune BEFORE UPDATE OF is_deleted ON cloudflared_tunnel BEGIN SELECT RAISE(ABORT, 'prune rejected'); END",
		);
		try {
			const result = await importConfig();
			expect(result).toMatchObject({ success: false, deleted: 0 });
			expect(result.errors.join(" ")).toContain("prune rejected");
			expect((await Tunnel.query().findById(tunnel.id)).is_deleted).toBe(false);
			expect(child.kill).not.toHaveBeenCalled();
		} finally {
			await state.database.raw("DROP TRIGGER reject_tunnel_prune");
		}
	});

	it("does not prune running tunnels when their module contains an invalid import file", async () => {
		const { tunnel, child } = await startTunnel();
		await fs.writeFile(path.join(tunnelDirectory(), "invalid.yaml"), "broken: [");
		const result = await importConfig();
		expect(result).toMatchObject({ success: false, deleted: 0 });
		expect(result.errors).toHaveLength(1);
		expect(await Tunnel.query().findById(tunnel.id)).toMatchObject({ is_deleted: false, status: 2 });
		expect(child.kill).not.toHaveBeenCalled();
	});

	it("reports a stop failure and can retry the already soft-deleted tunnel", async () => {
		const { tunnel, child } = await startTunnel();
		child.kill.mockImplementationOnce(() => {
			throw new Error("signal rejected");
		});
		const result = await importConfig();
		expect(result).toMatchObject({ success: false, deleted: 0 });
		expect(result.errors).toContain("cloudflared-tunnels: signal rejected");
		expect((await Tunnel.query().findById(tunnel.id)).is_deleted).toBe(true);
		expect(await importConfig()).toMatchObject({ success: true, deleted: 1, errors: [] });
		expect(child.kill).toHaveBeenCalledTimes(2);
		expect((await Tunnel.query().findById(tunnel.id)).status).toBe(0);
	});
});
