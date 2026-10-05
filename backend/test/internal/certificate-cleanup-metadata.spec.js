import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import certificate from "../../internal/certificate.js";
import nginx from "../../internal/nginx.js";
import DeadHost from "../../models/dead_host.js";
import ProxyHost from "../../models/proxy_host.js";
import RedirectionHost from "../../models/redirection_host.js";
import Stream from "../../models/stream.js";

const hostTypes = [
	["proxy_host", ProxyHost],
	["redirection_host", RedirectionHost],
	["dead_host", DeadHost],
	["stream", Stream],
];
const tables = ["certificate", ...hostTypes.map(([type]) => type)];
const tlsFields = {
	certificate_id: 99,
	ssl_forced: 1,
	http2_support: 1,
	hsts_enabled: 1,
	hsts_subdomains: 1,
};

describe.each(["sqlite", "postgres"])("certificate cleanup preserves concurrent metadata in %s", (engine) => {
	let embedded;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		for (const name of tables) {
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				for (const field of ["is_deleted", "enabled", ...Object.keys(tlsFields)]) table.integer(field);
				for (const field of ["meta", "domain_names", "modified_on"]) table.text(field);
			});
		}
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.text("domain_name");
		});
	});
	beforeEach(async () => {
		for (const name of ["host_domain", ...tables]) await state.db(name).delete();
		for (const method of ["backupConfig", "generateConfig", "deleteConfig", "deleteBackupConfig", "restoreConfig"])
			vi.spyOn(nginx, method).mockResolvedValue(undefined);
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});

	const insertHost = (type, id = 1, meta = { revision: "old" }) =>
		state.db(type).insert({
			id,
			is_deleted: 0,
			enabled: 1,
			...tlsFields,
			domain_names: '["protected.test"]',
			meta: JSON.stringify(meta),
		});

	it.each(
		hostTypes.flatMap(([type, model]) => [
			{ type, model, failReload: false },
			{ type, model, failReload: true },
		]),
	)("retains saved settings for $type with reload failure=$failReload", async ({ type, model, failReload }) => {
		await insertHost(type);
		const entered = Promise.withResolvers();
		const resume = Promise.withResolvers();
		vi.spyOn(nginx, "reload")
			.mockImplementationOnce(async () => {
				entered.resolve();
				await resume.promise;
				if (failReload) throw new Error("Reload rejected");
			})
			.mockResolvedValue(undefined);
		const cleanup = certificate.cleanUpMissingCertificates();
		const outcome = cleanup.then(
			() => null,
			(error) => error,
		);
		await entered.promise;
		await model
			.query()
			.findById(1)
			.patch({
				meta: {
					revision: "new",
					user_setting: "saved during reload",
					...(type === "proxy_host"
						? {
								ip_firewall: {
									enabled: true,
									list_ids: [],
									denylist: [{ address: "192.0.2.3", reason: "saved" }],
								},
							}
						: {}),
				},
			});
		resume.resolve();
		const error = await outcome;
		if (failReload) expect(error?.message).toBe("Reload rejected");
		else expect(error).toBeNull();
		const current = await model.query().findById(1);
		expect(current.meta).toMatchObject({ revision: "new", user_setting: "saved during reload" });
		if (type === "proxy_host")
			expect(current.meta.ip_firewall).toMatchObject({
				enabled: true,
				denylist: [{ address: "192.0.2.3", reason: "saved" }],
			});
		if (failReload) {
			expect(current.meta).not.toHaveProperty("nginx_online");
			expect(current.meta).not.toHaveProperty("nginx_err");
			expect(current.certificate_id).toBe(99);
			expect(nginx.restoreConfig).toHaveBeenCalledWith(type, expect.objectContaining({ id: 1 }));
			if (type !== "stream")
				for (const field of Object.keys(tlsFields).slice(1)) expect(current[field]).toBe(true);
		} else {
			expect(current.meta).toMatchObject({ nginx_online: true, nginx_err: null });
			expect(current.certificate_id).toBe(0);
			if (type !== "stream")
				for (const field of Object.keys(tlsFields).slice(1)) expect(current[field]).toBe(false);
		}
	});

	it.each([{}, { nginx_online: false, nginx_err: "previous error" }])(
		"rolls back only its status fields after a later failure, with original status %j",
		async (originalStatus) => {
			await insertHost("redirection_host", 1, { revision: "old", ...originalStatus });
			await insertHost("redirection_host", 2);
			vi.spyOn(nginx, "reload").mockResolvedValue(undefined);
			const update = nginx.updateHostStatus;
			vi.spyOn(nginx, "updateHostStatus").mockImplementation(async (model, host, status) => {
				if (host.id === 2) {
					await RedirectionHost.query()
						.findById(1)
						.patch({
							meta: { revision: "new after status", retained: true, nginx_online: true, nginx_err: null },
						});
					throw new Error("Second status persistence rejected");
				}
				return await update(model, host, status);
			});
			await expect(certificate.cleanUpMissingCertificates()).rejects.toThrow(
				"Second status persistence rejected",
			);
			const current = await RedirectionHost.query().findById(1);
			expect(current.meta).toEqual({
				revision: "new after status",
				retained: true,
				...originalStatus,
			});
			expect(current.certificate_id).toBe(99);
			expect((await RedirectionHost.query().findById(2)).meta).toEqual({ revision: "old" });
			expect(nginx.restoreConfig).toHaveBeenCalledTimes(2);
		},
	);
});
