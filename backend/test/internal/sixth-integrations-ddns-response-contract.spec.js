import { once } from "node:events";
import Ajv from "ajv/dist/2020.js";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: async () => {} } }));
vi.mock("../../internal/ddns.js", () => ({ default: { process: async () => {} } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: () => {} } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { can: async () => ({ permission_visibility: "all" }), token: { getUserId: () => 1 } };
		next();
	},
}));

import { up as createProviders } from "../../migrations/20260121000000_add_ddns.js";
import { up as addIpVersion } from "../../migrations/20260122000000_add_ddns_ip_ver.js";
import router from "../../routes/nginx/ddns_providers.js";
import { getCompiledSchema } from "../../schema/index.js";

describe("DDNS published responses include nullable persisted status", () => {
	let server;
	let baseUrl;
	let schema;
	let createdResponse;
	beforeAll(async () => {
		schema = await getCompiledSchema();
		await state.database.schema.createTable("user", (table) => table.increments("id"));
		await state.database("user").insert({ id: 1 });
		await createProviders(state.database);
		await addIpVersion(state.database);
		const app = express();
		app.use(express.json());
		app.use("/api/nginx/ddns-providers", router);
		server = app.listen(0, "127.0.0.1");
		await once(server, "listening");
		baseUrl = `http://127.0.0.1:${server.address().port}/api/nginx/ddns-providers`;
	});
	beforeEach(async () => {
		await state.database("ddns_provider").delete();
		const response = await fetch(baseUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "test",
				provider: "duckdns",
				domains: ["example"],
				config: { token: "test-token" },
			}),
		});
		expect(response.status).toBe(201);
		createdResponse = await response.json();
	});
	afterAll(async () => {
		await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		await state.database.destroy();
	});

	it.each(["post", "get"])("accepts the complete %s response for a newly created provider", async (method) => {
		const response = method === "post" ? createdResponse : await (await fetch(baseUrl)).json();
		const provider = method === "post" ? response : response[0];
		expect(provider).toMatchObject({ last_ipv4: null, last_ipv6: null, last_updated_on: null, last_error: null });
		const contract =
			schema.paths["/nginx/ddns-providers"][method].responses[method === "post" ? 201 : 200].content[
				"application/json"
			].schema;
		const validate = new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(contract);
		expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
	});
});
