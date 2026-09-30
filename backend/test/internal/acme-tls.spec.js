import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	root: null,
	failure: null,
	queue: Promise.resolve(),
	generated: [],
	reloads: [],
	warnings: [],
}));
vi.mock("../../logger.js", () => ({
	nginx: { warn: (message) => state.warnings.push(message), error: vi.fn() },
	global: {},
	debug: vi.fn(),
}));
vi.mock("../../models/setting.js", async () => {
	const { Model } = await import("objection");
	class Setting extends Model {
		static get tableName() {
			return "setting";
		}
		static get jsonAttributes() {
			return ["meta"];
		}
	}
	return {
		default: {
			query: (trx) => Setting.query(trx || state.db),
			transaction: (callback) => state.db.transaction(callback),
		},
	};
});
vi.mock("../../models/certificate.js", async () => {
	const { Model } = await import("objection");
	class Certificate extends Model {
		static get tableName() {
			return "certificate";
		}
	}
	return { default: { query: (trx) => Certificate.query(trx || state.db) } };
});
async function hostModel(table) {
	const { Model } = await import("objection");
	class Host extends Model {
		static get tableName() {
			return table;
		}
	}
	return {
		default: {
			query: () => {
				const query = Host.query(state.db);
				query.withGraphFetched = () => query;
				return query;
			},
		},
	};
}
vi.mock("../../models/proxy_host.js", () => hostModel("proxy_host"));
vi.mock("../../models/redirection_host.js", () => hostModel("redirection_host"));
vi.mock("../../models/dead_host.js", () => hostModel("dead_host"));
vi.mock("../../models/stream.js", () => hostModel("stream"));
vi.mock("../../internal/acme-options.js", () => ({
	default: {
		getPublicPolicy: async () => JSON.parse((await state.db("setting").where("id", "acme-options").first()).meta),
	},
}));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		withConfigurationLock: (callback) => {
			const result = state.queue.then(callback);
			state.queue = result.catch(() => {});
			return result;
		},
		getConfigName: (type, id) => path.join(state.root, `${type}-${id}.conf`),
		refreshOcsp: vi.fn().mockResolvedValue(),
		generateConfig: async (type, host, options) => {
			state.generated.push({ type, host, options });
			fs.writeFileSync(
				path.join(state.root, `${type}-${host.id}.conf`),
				`new:${options.acme_options.ocsp_stapling}`,
			);
			if (state.failure === "generate") {
				state.failure = null;
				throw new Error("generation failed");
			}
		},
		test: async () => {
			if (state.failure === "test") {
				state.failure = null;
				throw new Error("validation failed");
			}
		},
		reload: async (options) => {
			state.reloads.push(options);
			await tls.refreshDefaultInclude(options.acme_options, { trx: options.trx });
			if (state.failure === "reload") {
				state.failure = null;
				throw new Error("reload failed");
			}
		},
	},
}));

import tls from "../../internal/acme-tls.js";

const initial = {
	ocsp_stapling: false,
	custom_ocsp_stapling: false,
	default_certificate_id: 0,
	server: "invalid imported server",
};
const persist = (policy) => (trx) =>
	(trx || state.db)("setting")
		.where("id", "acme-options")
		.update({ meta: JSON.stringify(policy) });
const readPolicy = async () => JSON.parse((await state.db("setting").where("id", "acme-options").first()).meta);

beforeEach(async () => {
	state.root = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-acme-tls-"));
	state.failure = null;
	state.generated = [];
	state.reloads = [];
	state.warnings = [];
	state.queue = Promise.resolve();
	state.db = knex({
		client: "better-sqlite3",
		connection: { filename: ":memory:" },
		useNullAsDefault: true,
		pool: { min: 1, max: 1 },
		acquireConnectionTimeout: 1000,
	});
	await state.db.schema.createTable("setting", (t) => {
		t.string("id").primary();
		t.string("value");
		t.text("meta");
	});
	await state.db.schema.createTable("certificate", (t) => {
		t.increments("id");
		t.string("provider");
		t.integer("is_deleted");
	});
	for (const table of ["proxy_host", "redirection_host", "dead_host", "stream"])
		await state.db.schema.createTable(table, (t) => {
			t.increments("id");
			t.integer("certificate_id");
			t.integer("is_deleted");
			t.integer("enabled");
		});
	await state.db("setting").insert([
		{ id: "acme-options", value: "configured", meta: JSON.stringify(initial) },
		{ id: "default-site", value: "congratulations", meta: "{}" },
	]);
	await state.db("proxy_host").insert([
		{ id: 1, certificate_id: 7, enabled: 1, is_deleted: 0 },
		{ id: 2, certificate_id: 0, enabled: 1, is_deleted: 0 },
		{ id: 3, certificate_id: 7, enabled: 0, is_deleted: 0 },
		{ id: 4, certificate_id: 7, enabled: 1, is_deleted: 1 },
	]);
	await state.db("stream").insert({ id: 5, certificate_id: 7, enabled: 1, is_deleted: 0 });
	vi.spyOn(tls, "getDefaultIncludePath").mockReturnValue(path.join(state.root, "default-tls.conf"));
	vi.spyOn(tls, "getTlsRootPath").mockReturnValue(path.join(state.root, "tls"));
	for (const filename of ["default-tls.conf", "proxy_host-1.conf", "stream-5.conf", "default-default-site.conf"])
		fs.writeFileSync(path.join(state.root, filename), `old:${filename}`);
});
afterEach(async () => {
	await state.db.destroy();
	vi.restoreAllMocks();
	fs.rmSync(state.root, { recursive: true, force: true });
});

const pair = async (provider = "letsencrypt", mustStaple = false) => {
	await state.db("certificate").insert({ id: 7, provider, is_deleted: 0 });
	const directory = path.join(
		state.root,
		"tls",
		{ letsencrypt: "certbot/live", other: "custom", internal: "internal" }[provider],
		"npm-7",
	);
	fs.mkdirSync(directory, { recursive: true });
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"ec",
			"-pkeyopt",
			"ec_paramgen_curve:prime256v1",
			"-nodes",
			"-subj",
			"/CN=fixture.test",
			"-days",
			"1",
			...(mustStaple ? ["-addext", "tlsfeature=status_request"] : []),
			"-out",
			path.join(directory, "fullchain.pem"),
			"-keyout",
			path.join(directory, "privkey.pem"),
		],
		{ stdio: "ignore" },
	);
	return directory;
};

describe("live TLS settings", () => {
	it("regenerates only active TLS hosts/streams and the default site with staged policy", async () => {
		const policy = { ...initial, ocsp_stapling: true };
		await tls.applyPolicy(policy, persist(policy));
		expect(state.generated.map(({ type, host }) => [type, host.id])).toEqual([
			["proxy_host", 1],
			["stream", 5],
			["default", "default-site"],
		]);
		expect(state.generated.every(({ options }) => options.acme_options === policy)).toBe(true);
		expect(await readPolicy()).toEqual(policy);
		expect(state.reloads[0]).toMatchObject({ acme_options: policy });
		expect(state.reloads[0].trx).toBeDefined();
		expect(fs.readFileSync(tls.getDefaultIncludePath(), "utf8")).toContain("dummycert.pem");
	});
	it.each(["generate", "test", "reload", "database"])("restores files and policy if %s fails", async (failure) => {
		if (failure === "database")
			await state.db.raw(
				"CREATE TRIGGER reject_settings BEFORE UPDATE ON setting BEGIN SELECT RAISE(ABORT, 'database'); END",
			);
		else state.failure = failure;
		const policy = { ...initial, ocsp_stapling: true };
		await expect(tls.applyPolicy(policy, persist(policy))).rejects.toThrow(
			"previous settings and configuration were restored",
		);
		expect(await readPolicy()).toEqual(initial);
		for (const filename of [
			"default-tls.conf",
			"proxy_host-1.conf",
			"stream-5.conf",
			"default-default-site.conf",
		]) {
			// Rollback reload reconstructs the shared include from the previous policy.
			if (filename === "default-tls.conf")
				expect(fs.readFileSync(path.join(state.root, filename), "utf8")).toContain("dummycert.pem");
			else expect(fs.readFileSync(path.join(state.root, filename), "utf8")).toBe(`old:${filename}`);
		}
		expect(state.reloads.at(-1).acme_options).toEqual(initial);
	});
	it("uses the transaction connection for a selected certificate during reload", async () => {
		const directory = await pair();
		const policy = { ...initial, default_certificate_id: 7, ocsp_stapling: true };
		await tls.applyPolicy(policy, persist(policy));
		expect(await readPolicy()).toEqual(policy);
		const content = fs.readFileSync(tls.getDefaultIncludePath(), "utf8");
		expect(content).toContain(`${directory}/fullchain.pem`);
		expect(content).toContain("ssl_stapling on;");
		expect(content).not.toContain("ssl_stapling_file");
	});
	it("rejects incomplete or inactive certificate selections before changing files or settings", async () => {
		const directory = await pair();
		fs.rmSync(path.join(directory, "privkey.pem"));
		await expect(tls.applyPolicy({ ...initial, default_certificate_id: 7 }, vi.fn())).rejects.toThrow(
			"Select an active default certificate",
		);
		expect(state.generated).toHaveLength(0);
		expect(await readPolicy()).toEqual(initial);
		expect(fs.readFileSync(tls.getDefaultIncludePath(), "utf8")).toBe("old:default-tls.conf");
	});
	it.each(["letsencrypt", "other"])(
		"blocks disabling OCSP for deployed %s Must-Staple leaves even when future issuance is disabled",
		async (provider) => {
			await pair(provider, true);
			const enabled = {
				...initial,
				default_certificate_id: 7,
				ocsp_stapling: true,
				custom_ocsp_stapling: true,
				must_staple: false,
			};
			await tls.applyPolicy(enabled, persist(enabled));
			state.generated = [];
			const filename = tls.getDefaultIncludePath();
			const before = fs.readFileSync(filename, "utf8");
			const disabled = { ...enabled, ocsp_stapling: false, custom_ocsp_stapling: false };
			await expect(tls.applyPolicy(disabled, persist(disabled))).rejects.toThrow(
				"Renew or replace deployed Must-Staple certificates before disabling OCSP stapling",
			);
			expect(await readPolicy()).toEqual(enabled);
			expect(fs.readFileSync(filename, "utf8")).toBe(before);
			expect(state.generated).toHaveLength(0);
		},
	);
	it("checks active host/stream Must-Staple leaves when the default still uses dummy TLS", async () => {
		await pair("other", true);
		await expect(tls.applyPolicy(initial, persist(initial))).rejects.toThrow(
			"Renew or replace deployed Must-Staple certificates",
		);
		expect(state.generated).toHaveLength(0);
	});
	it("uses dummy TLS for a malformed imported pair without stopping startup", async () => {
		const directory = await pair();
		fs.writeFileSync(path.join(directory, "fullchain.pem"), "invalid certificate");
		await persist({ ...initial, default_certificate_id: 7 })(undefined);
		await tls.initialize();
		expect(fs.readFileSync(tls.getDefaultIncludePath(), "utf8")).toContain("dummycert.pem");
		expect(state.warnings).toHaveLength(1);
	});
	it("initializes a missing imported default certificate using dummy TLS without validating account fields", async () => {
		await persist({ ...initial, default_certificate_id: 999 })(undefined);
		await tls.initialize();
		expect(fs.readFileSync(tls.getDefaultIncludePath(), "utf8")).toContain("dummycert.pem");
		expect(state.warnings).toEqual([
			"The selected default certificate is unavailable; using the bootstrap certificate.",
		]);
		expect(state.reloads).toHaveLength(0);
		expect((await readPolicy()).default_certificate_id).toBe(999);
	});
	it("does not recreate a host config removed by the launcher's missing-certificate repair", async () => {
		fs.rmSync(path.join(state.root, "proxy_host-1.conf"));
		await tls.initialize();
		expect(state.generated.map(({ type, host }) => [type, host.id])).toEqual([
			["stream", 5],
			["default", "default-site"],
		]);
		expect(fs.existsSync(path.join(state.root, "proxy_host-1.conf"))).toBe(false);
	});
	it("blocks deletion of the selected default certificate", async () => {
		await persist({ ...initial, default_certificate_id: 7 })(undefined);
		await expect(tls.assertCertificateDeletable(7)).rejects.toThrow("Select another default certificate");
		await expect(tls.assertCertificateDeletable(8)).resolves.toBeUndefined();
	});
	it("keeps internal default certificates free of OCSP directives", async () => {
		await pair("internal");
		await tls.refreshDefaultInclude({
			...initial,
			default_certificate_id: 7,
			ocsp_stapling: true,
			custom_ocsp_stapling: true,
		});
		expect(fs.readFileSync(tls.getDefaultIncludePath(), "utf8")).not.toContain("ssl_stapling");
	});
});
