import knex from "knex";
import { Model } from "objection";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite", issueCertificate: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../internal/nginx.js", () => ({
	default: {
		withConfigurationLock: (write) => write(),
		configure: vi.fn(async () => ({ nginx_online: true })),
		configureHost: vi.fn(async () => ({ nginx_online: true })),
		getConfigName: (_kind, id) => `/mock/nginx/proxy_host/${id}.conf`,
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { startPollingForHost: vi.fn() } }));
vi.mock("../../internal/certificate.js", () => ({ default: { createQuickCertificate: state.issueCertificate } }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: { resetHost: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: (value) => value, decrypt: (value) => value }));
vi.mock("../../lib/config.js", async (original) => ({
	...(await original()),
	isSqlite: () => state.engine === "sqlite",
}));

vi.mock("../../internal/host-revisions.js", async (importOriginal) => ({
	...(await importOriginal()),
	default: { record: vi.fn() },
}));

import deadHosts from "../../internal/dead-host.js";
import proxyHosts from "../../internal/proxy-host.js";
import redirectHosts from "../../internal/redirection-host.js";
import { domainClaimKey } from "../../lib/host-domain-claim-key.js";
import { withHostDomainClaims } from "../../lib/host-domain-claims.js";
import { down, up } from "../../migrations/20261017190200_add_host_domain_claims.js";

const access = { can: async () => ({ permission_visibility: "all" }), token: { getUserId: () => 1 } };
const proxyData = (domain) => ({
	domain_names: [domain],
	forward_host: "127.0.0.1",
	forward_scheme: "http",
	forward_port: 8080,
});

describe.each(["sqlite", "postgres"])("atomic cross-host domain claims on %s", (engine) => {
	let embedded;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		for (const name of ["proxy_host", "redirection_host", "dead_host"]) {
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				for (const column of [
					"created_on",
					"modified_on",
					"forward_host",
					"forward_scheme",
					"advanced_config",
					"maintenance_start",
					"maintenance_end",
				])
					table.text(column);
				for (const column of [
					"owner_user_id",
					"forward_port",
					"ssl_forced",
					"hsts_enabled",
					"hsts_subdomains",
					"certificate_id",
					"access_list_id",
				])
					table.integer(column).defaultTo(0);
				table.integer("is_deleted").defaultTo(0);
				table.integer("enabled").defaultTo(1);
				table.json("domain_names");
				table.json("meta");
			});
		}
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.text("domain_name");
			table.text("created_on");
			table.text("modified_on");
		});
		for (const name of ["user", "certificate", "access_list"]) {
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("is_deleted").defaultTo(0);
			});
		}
		await up(state.db);
	});
	beforeEach(async () => {
		state.issueCertificate.mockReset();
		for (const name of [
			"host_domain_claim_owner",
			"host_domain_claim",
			"host_domain",
			"proxy_host",
			"redirection_host",
			"dead_host",
		])
			await state.db(name).delete();
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});

	it("allows exactly one concurrent service create for the same case-insensitive name", async () => {
		const results = await Promise.allSettled([
			proxyHosts.create(access, proxyData("Race.Example.Test")),
			proxyHosts.create(access, proxyData("race.example.test")),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.find((result) => result.status === "rejected").reason.message).toContain("already in use");
		expect(await state.db("proxy_host")).toHaveLength(1);
		expect(await state.db("host_domain_claim_owner")).toHaveLength(1);
	});

	it("shares claims between actual proxy, redirect and dead-host service writes", async () => {
		await proxyHosts.create(access, proxyData("shared.example.test"));
		await expect(deadHosts.create(access, { domain_names: ["SHARED.example.test"] })).rejects.toThrow(
			"already in use",
		);
		await expect(redirectHosts.create(access, { domain_names: ["shared.example.test"] })).rejects.toThrow(
			"already in use",
		);
		expect(await state.db("dead_host")).toHaveLength(0);
		expect(await state.db("redirection_host")).toHaveLength(0);
	});

	it("serializes a rename with a competing create and rolls back rejected host writes", async () => {
		const first = await proxyHosts.create(access, proxyData("old.example.test"));
		const results = await Promise.allSettled([
			withHostDomainClaims(
				{ hostType: "proxy", hostId: first.id, domainNames: ["next.example.test"] },
				async (trx) => {
					await trx("host_domain")
						.where("proxy_host_id", first.id)
						.update({ domain_name: "next.example.test" });
				},
			),
			deadHosts.create(access, { domain_names: ["next.example.test"] }),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(await state.db("host_domain_claim_owner").where("domain_name", "next.example.test")).toHaveLength(1);
		await expect(
			withHostDomainClaims({ hostType: "dead", domainNames: ["failed.example.test"] }, async (trx) => {
				await trx("dead_host").insert({ domain_names: JSON.stringify(["failed.example.test"]) });
				throw new Error("simulated database write failure");
			}),
		).rejects.toThrow("simulated");
		expect(await state.db("host_domain_claim").where("domain_name", "failed.example.test")).toHaveLength(0);
	});

	it("releases deleted hosts atomically so another type can reuse a name", async () => {
		const first = await proxyHosts.create(access, proxyData("reuse.example.test"));
		await withHostDomainClaims({ hostType: "proxy", hostId: first.id, domainNames: [] }, async (trx) => {
			await trx("proxy_host").where("id", first.id).update({ is_deleted: 1 });
		});
		await expect(deadHosts.create(access, { domain_names: ["reuse.example.test"] })).resolves.toBeTruthy();
		expect(await state.db("host_domain_claim_owner").where("domain_name", "reuse.example.test")).toMatchObject([
			{ host_type: "dead" },
		]);
	});

	it("retains rollback names across external activation until they are explicitly released", async () => {
		const first = await proxyHosts.create(access, proxyData("previous.example.test"));
		await withHostDomainClaims(
			{
				hostType: "proxy",
				hostId: first.id,
				domainNames: ["proposed.example.test"],
				retainedDomainNames: ["previous.example.test"],
			},
			async (trx) => {
				await trx("host_domain")
					.where("proxy_host_id", first.id)
					.update({ domain_name: "proposed.example.test" });
			},
		);
		await expect(deadHosts.create(access, { domain_names: ["previous.example.test"] })).rejects.toThrow(
			"already in use",
		);
		await expect(deadHosts.create(access, { domain_names: ["proposed.example.test"] })).rejects.toThrow(
			"already in use",
		);
		await withHostDomainClaims(
			{ hostType: "proxy", hostId: first.id, domainNames: ["proposed.example.test"] },
			async () => {},
		);
		await expect(deadHosts.create(access, { domain_names: ["previous.example.test"] })).resolves.toBeTruthy();
	});

	it("preserves all legacy collision owners and permits explicit resolution without deleting hosts", async () => {
		await down(state.db);
		const [first] = await state.db("proxy_host").insert({ domain_names: "[]" }).returning("id");
		await state.db("host_domain").insert({ proxy_host_id: first.id ?? first, domain_name: "Legacy.Example.Test" });
		await state
			.db("dead_host")
			.insert({ domain_names: JSON.stringify(["legacy.example.test", "LEGACY.example.test"]) });
		await up(state.db);
		expect(await state.db("host_domain_claim")).toHaveLength(1);
		expect(await state.db("host_domain_claim_owner")).toHaveLength(2);
		await expect(redirectHosts.create(access, { domain_names: ["legacy.example.test"] })).rejects.toThrow(
			"already in use",
		);
		expect(await state.db("proxy_host")).toHaveLength(1);
		expect(await state.db("dead_host")).toHaveLength(1);
		await withHostDomainClaims({ hostType: "proxy", hostId: first.id ?? first, domainNames: [] }, async (trx) => {
			await trx("proxy_host")
				.where("id", first.id ?? first)
				.update({ is_deleted: 1 });
		});
		expect(await state.db("host_domain_claim_owner")).toHaveLength(1);
	});

	it("migrates long JSON names and Unicode case collisions without truncating names or merging accents", async () => {
		await down(state.db);
		const longName = `${"long".repeat(100)}.example.test`;
		const [redirect] = await state
			.db("redirection_host")
			.insert({ domain_names: JSON.stringify([longName, "BÜCHER.example.test"]) })
			.returning("id");
		await state.db("dead_host").insert({
			domain_names: JSON.stringify([
				longName.toUpperCase(),
				"bücher.example.test",
				"BÜCHER.example.test",
				"bucher.example.test",
			]),
		});
		await up(state.db);
		const claims = await state.db("host_domain_claim");
		expect(claims).toHaveLength(3);
		expect(await state.db("host_domain_claim_owner")).toHaveLength(5);
		expect(claims.find((claim) => claim.domain_name === longName)).toEqual({
			domain_key: domainClaimKey(longName),
			domain_name: longName,
		});
		expect(new Set(claims.map((claim) => claim.domain_key)).size).toBe(3);
		await withHostDomainClaims(
			{
				hostType: "redirection",
				hostId: redirect.id ?? redirect,
				domainNames: [longName, "bücher.example.test"],
			},
			async () => {},
		);
		await expect(proxyHosts.create(access, proxyData(longName.toUpperCase()))).rejects.toThrow("already in use");
		await expect(proxyHosts.create(access, proxyData("BÜCHER.example.test"))).rejects.toThrow("already in use");
		await expect(
			deadHosts.create(access, { domain_names: [`${longName}.different`, "búcher.example.test"] }),
		).resolves.toBeTruthy();
	});

	it.each([
		["dead", deadHosts],
		["redirection", redirectHosts],
	])("does not recreate a deleted %s host's claims after delayed certificate issuance", async (hostType, service) => {
		const host = await service.create(access, { domain_names: ["released-during-issuance.example.test"] });
		let resolveCertificate;
		state.issueCertificate.mockReturnValue(
			new Promise((resolve) => {
				resolveCertificate = resolve;
			}),
		);
		const update = service.update(access, { id: host.id, certificate_id: "new" });
		await vi.waitFor(() => expect(state.issueCertificate).toHaveBeenCalledOnce());
		await withHostDomainClaims({ hostType, hostId: host.id, domainNames: [] }, (trx) =>
			trx(`${hostType}_host`).where("id", host.id).update({ is_deleted: 1 }),
		);
		resolveCertificate({ id: 8 });
		await expect(update).rejects.toMatchObject({ status: 404 });
		expect(await state.db("host_domain_claim_owner")).toHaveLength(0);
		await expect(
			proxyHosts.create(access, proxyData("released-during-issuance.example.test")),
		).resolves.toBeTruthy();
	});

	it.each([
		["dead", deadHosts],
		["redirection", redirectHosts],
	])("rechecks the latest %s owner after delayed certificate issuance", async (hostType, service) => {
		const owner = { can: async () => ({ permission_visibility: "user" }), token: { getUserId: () => 1 } };
		const host = await service.create(owner, { domain_names: ["transferred-during-issuance.example.test"] });
		let resolveCertificate;
		state.issueCertificate.mockReturnValue(
			new Promise((resolve) => {
				resolveCertificate = resolve;
			}),
		);
		const update = service.update(owner, { id: host.id, certificate_id: "new" });
		await vi.waitFor(() => expect(state.issueCertificate).toHaveBeenCalledOnce());
		await withHostDomainClaims({ hostType, hostId: host.id, domainNames: host.domain_names }, (trx) =>
			trx(`${hostType}_host`).where("id", host.id).update({ owner_user_id: 2 }),
		);
		resolveCertificate({ id: 8 });
		await expect(update).rejects.toMatchObject({ status: 404 });
		expect(await state.db(`${hostType}_host`).where("id", host.id).first()).toMatchObject({
			owner_user_id: 2,
			certificate_id: 0,
		});
		expect(await state.db("host_domain_claim_owner")).toHaveLength(1);
	});
});

it("uses fixed hash indexes and untruncated text names in MySQL migration SQL", async () => {
	const mysql = knex({ client: "mysql2" });
	const statements = [];
	const query = { join: () => query, where: () => query, select: async () => [], insert: async () => {} };
	const migration = Object.assign(() => query, {
		schema: {
			createTable: async (name, define) => {
				statements.push(
					...mysql.schema
						.createTable(name, define)
						.toSQL()
						.map(({ sql }) => sql),
				);
			},
		},
	});
	try {
		await up(migration);
		expect(statements.filter((sql) => /primary key \(`domain_key`\)/.test(sql))).toHaveLength(1);
		expect(
			statements.filter((sql) => /primary key \(`domain_key`, `host_type`, `host_id`\)/.test(sql)),
		).toHaveLength(1);
		expect(statements.filter((sql) => sql.includes("`domain_name` longtext not null"))).toHaveLength(2);
		expect(statements.some((sql) => sql.includes("references `host_domain_claim` (`domain_key`)"))).toBe(true);
	} finally {
		await mysql.destroy();
	}
});
