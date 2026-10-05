import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null, requests: 0 }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "1".repeat(64),
}));
vi.mock("../../models/token.js", () => ({
	default: () => {
		const payload = { attrs: { id: 7 }, scope: ["user"] };
		return {
			load: async () => payload,
			get: (key) => payload[key],
			hasScope: (scope) => payload.scope.includes(scope),
			getUserId: () => 7,
		};
	},
}));
vi.mock("../../internal/chat.js", () => ({ default: { sendHostMonitorAlert: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));

import monitor from "../../internal/proxy-host-monitor.js";
import Access from "../../lib/access.js";
import { up } from "../../migrations/20260923000000_add_proxy_host_monitor.js";
import { up as addTlsOptions } from "../../migrations/20260923000001_add_proxy_host_monitor_tls_options.js";
import { up as addSkipCertificateVerification } from "../../migrations/20260924000000_add_proxy_host_monitor_skip_certificate_verification.js";

const settings = {
	enabled: true,
	type: "http",
	path: "/health",
	interval_seconds: 15,
	timeout_ms: 1000,
	expected_status: 200,
	alert_enabled: false,
};

const currentAccess = async (visibility = "user", permission = "manage") => {
	await state.database("user_permission").where("user_id", 7).update({ visibility, proxy_hosts: permission });
	const access = new Access("monitor-test-token-placeholder");
	await access.load();
	return access;
};

const operate = (operation, access, hostId) => {
	if (operation === "update") return monitor.update(access, hostId, { ...settings, path: "/changed" });
	return monitor[operation](access, hostId);
};

describe("proxy host monitor visibility with real capability schemas", () => {
	let server;
	let port;
	beforeAll(async () => {
		await state.database.schema.createTable("user", (table) => {
			table.integer("id").primary();
			table.json("roles");
			table.integer("is_deleted");
			table.integer("is_disabled");
		});
		await state.database.schema.createTable("user_permission", (table) => {
			table.integer("id").primary();
			table.integer("user_id");
			table.string("visibility");
			table.string("proxy_hosts");
		});
		await state.database.schema.createTable("proxy_host", (table) => {
			table.integer("id").primary();
			table.integer("owner_user_id");
			table.integer("is_deleted");
			table.integer("enabled");
			table.string("forward_scheme");
			table.string("forward_host");
			table.integer("forward_port");
		});
		await state.database.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
		await up(state.database);
		await addTlsOptions(state.database);
		await addSkipCertificateVerification(state.database);
		await state.database("user").insert({ id: 7, roles: "[]", is_deleted: 0, is_disabled: 0 });
		await state
			.database("user_permission")
			.insert({ id: 1, user_id: 7, visibility: "user", proxy_hosts: "manage" });
		server = http.createServer((_req, res) => {
			state.requests++;
			res.writeHead(200).end();
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		port = server.address().port;
	});
	beforeEach(async () => {
		monitor.stop();
		vi.clearAllMocks();
		state.requests = 0;
		await state.database("proxy_host_monitor_check").delete();
		await state.database("proxy_host_monitor").delete();
		await state.database("proxy_host").delete();
		for (const [id, ownerUserId] of [
			[11, 7],
			[12, 8],
		]) {
			await state.database("proxy_host").insert({
				id,
				owner_user_id: ownerUserId,
				is_deleted: 0,
				enabled: 1,
				forward_scheme: "http",
				forward_host: "127.0.0.1",
				forward_port: port,
			});
			await state.database("proxy_host_monitor").insert({
				host_id: id,
				created_on: "2026-10-04T12:00:00.000Z",
				modified_on: "2026-10-04T12:00:00.000Z",
				...settings,
				enabled: 1,
				alert_enabled: 0,
				path: `/owner-${ownerUserId}`,
			});
			await state.database("proxy_host_monitor_check").insert({
				host_id: id,
				checked_at: "2026-10-04T12:00:00.000Z",
				state: "down",
				status_code: 503,
				message: `Owner ${ownerUserId} history`,
				response_ms: 100,
				transition: 1,
			});
		}
	});
	afterAll(async () => {
		monitor.stop();
		await new Promise((resolve) => server.close(resolve));
		await state.database.destroy();
	});

	it.each(["get", "update", "check"])(
		"hides a foreign host from owner-restricted %s operations",
		async (operation) => {
			const access = await currentAccess();
			// The capability schema grants the operation; the service must separately enforce ownership.
			const permission = operation === "get" ? "get" : "update";
			expect((await access.can(`proxy_hosts:${permission}`, 12)).permission_visibility).toBe("user");
			const before = await state.database("proxy_host_monitor").orderBy("host_id");
			const historyBefore = await state.database("proxy_host_monitor_check").orderBy("host_id");

			await expect(operate(operation, access, 12)).rejects.toMatchObject({
				name: "ItemNotFoundError",
				status: 404,
			});

			expect(await state.database("proxy_host_monitor").orderBy("host_id")).toEqual(before);
			expect(await state.database("proxy_host_monitor_check").orderBy("host_id")).toEqual(historyBefore);
			expect(state.requests).toBe(0);
		},
	);

	it("lets a view-only owner read their own settings and history while keeping foreign data hidden", async () => {
		const access = await currentAccess("user", "view");
		const result = await monitor.get(access, 11);
		expect(result.config.path).toBe("/owner-7");
		expect(result.history).toEqual([expect.objectContaining({ message: "Owner 7 history" })]);
		await expect(monitor.get(access, 12)).rejects.toMatchObject({ status: 404 });
		await expect(monitor.update(access, 11, settings)).rejects.toMatchObject({ status: 403 });
		await expect(monitor.check(access, 11)).rejects.toMatchObject({ status: 403 });
		expect(state.requests).toBe(0);
	});

	it("lets a managing owner update and probe their own host", async () => {
		const access = await currentAccess();
		const updated = await monitor.update(access, 11, settings);
		expect(updated.config.path).toBe("/health");
		expect(updated.history).toEqual([]);
		expect(await monitor.check(access, 11)).toMatchObject({ state: "up", status_code: 200 });
		expect(state.requests).toBe(1);
	});

	it.each(["get", "update", "check"])("preserves all-host visibility for %s operations", async (operation) => {
		const access = await currentAccess("all");
		const result = await operate(operation, access, 12);
		if (operation === "check") {
			expect(result).toMatchObject({ state: "up", status_code: 200 });
			expect(state.requests).toBe(1);
		} else {
			expect(result.config.path).toBe(operation === "update" ? "/changed" : "/owner-8");
		}
	});
});
