import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ access: null, db: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	isMysql: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = state.access;
		next();
	},
}));

import { AnalyticsService } from "../../internal/analytics.js";
import errs from "../../lib/error.js";
import router from "../../routes/analytics.js";

const app = express();
app.use("/api/analytics", router);
app.use((error, _req, res, _next) =>
	res.status(error instanceof errs.PermissionError ? 403 : 500).json({ error: error.message }),
);

let server;
let origin;
const get = async (path, status) => {
	const response = await fetch(`${origin}${path}`);
	expect(response.status).toBe(status);
	return { body: await response.json() };
};

describe("analytics host selection authorization", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("is_deleted");
			table.integer("owner_user_id");
			table.string("terminal_password");
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
		await state.db("proxy_host").insert([
			{ id: 1, is_deleted: 0, owner_user_id: 7, terminal_password: "private-own-password" },
			{ id: 2, is_deleted: 0, owner_user_id: 8, terminal_password: "private-foreign-password" },
			{ id: 3, is_deleted: 1, owner_user_id: 7 },
		]);
		await state.db("host_domain").insert([
			{ proxy_host_id: 1, domain_name: "own.example.test" },
			{ proxy_host_id: 2, domain_name: "foreign.example.test" },
			{ proxy_host_id: 3, domain_name: "deleted.example.test" },
		]);
		server = await new Promise((resolve) => {
			const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
		});
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	beforeEach(() => {
		state.access = { can: vi.fn(), token: { getUserId: () => 7 } };
	});
	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
		await state.db.destroy();
	});

	it("lists minimal global analytics hosts even when proxy management is denied", async () => {
		state.access.can.mockImplementation(async (permission) => {
			if (permission === "analytics:list") return { permission_analytics: "view", roles: ["user"] };
			throw new errs.PermissionError();
		});
		const response = await get("/api/analytics/hosts", 200);
		expect(response.body).toEqual([
			{ id: 1, domain_names: ["own.example.test"] },
			{ id: 2, domain_names: ["foreign.example.test"] },
		]);
		expect(state.access.can).toHaveBeenCalledExactlyOnceWith("analytics:list");
	});

	it("preserves legitimate own-host readers without exposing foreign or deleted hosts", async () => {
		state.access.can.mockImplementation(async (permission) => {
			if (permission === "proxy_hosts:get") return { permission_visibility: "all", roles: ["user"] };
			throw new errs.PermissionError();
		});
		const response = await get("/api/analytics/hosts", 200);
		expect(response.body).toEqual([{ id: 1, domain_names: ["own.example.test"] }]);
		expect(state.access.can).toHaveBeenCalledWith("proxy_hosts:get");
		await get("/api/analytics/summary", 403);
	});

	it("rejects revoked host and analytics permissions", async () => {
		state.access.can.mockRejectedValue(new errs.PermissionError());
		await get("/api/analytics/hosts", 403);
	});

	it("does not bypass unexpected global authorization failures via own-host fallback", async () => {
		state.access.can.mockRejectedValue(new Error("database unavailable"));
		await expect(new AnalyticsService().getHosts(state.access)).rejects.toThrow("database unavailable");
		expect(state.access.can).toHaveBeenCalledTimes(1);
	});
});
