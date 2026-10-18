import { domainClaimKey } from "../lib/host-domain-claim-key.js";
import { migrate as logger } from "../logger.js";

const readDomains = (value) => {
	if (Array.isArray(value)) return value;
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

export const up = async (knex) => {
	await knex.schema.createTable("host_domain_claim_lock", (table) => {
		table.integer("id").primary();
		table.bigInteger("sequence").notNullable().defaultTo(0);
	});
	await knex("host_domain_claim_lock").insert({ id: 1, sequence: 0 });
	await knex.schema.createTable("host_domain_claim", (table) => {
		table.string("domain_key", 64).primary();
		table.text("domain_name", "longtext").notNullable();
	});
	await knex.schema.createTable("host_domain_claim_owner", (table) => {
		table
			.string("domain_key", 64)
			.notNullable()
			.references("domain_key")
			.inTable("host_domain_claim")
			.onDelete("CASCADE");
		table.text("domain_name", "longtext").notNullable();
		table.string("host_type", 16).notNullable();
		table.integer("host_id").unsigned().notNullable();
		table.primary(["domain_key", "host_type", "host_id"]);
		table.index(["host_type", "host_id"], "idx_host_domain_claim_owner");
	});
	const claims = new Map();
	const add = (domain, type, id) => {
		if (typeof domain !== "string" || !domain.length) return;
		const normalized = domain.toLowerCase();
		if (!claims.has(normalized)) claims.set(normalized, new Map());
		claims.get(normalized).set(`${type}:${id}`, {
			domain_key: domainClaimKey(normalized),
			domain_name: normalized,
			host_type: type,
			host_id: id,
		});
	};
	const proxyDomains = await knex("host_domain")
		.join("proxy_host", "proxy_host.id", "host_domain.proxy_host_id")
		.where("proxy_host.is_deleted", 0)
		.select("host_domain.domain_name", "proxy_host.id");
	for (const row of proxyDomains) add(row.domain_name, "proxy", row.id);
	for (const [table, type] of [
		["redirection_host", "redirection"],
		["dead_host", "dead"],
	]) {
		for (const row of await knex(table).where("is_deleted", 0).select("id", "domain_names")) {
			for (const domain of readDomains(row.domain_names)) add(domain, type, row.id);
		}
	}
	let collisions = 0;
	for (const [domain, owners] of claims) {
		await knex("host_domain_claim").insert({ domain_key: domainClaimKey(domain), domain_name: domain });
		for (const owner of owners.values()) await knex("host_domain_claim_owner").insert(owner);
		if (owners.size > 1) collisions++;
	}
	if (collisions)
		logger.warn(
			`Preserved ${collisions} existing domain-name conflicts; resolve them by renaming or deleting the affected hosts.`,
		);
};

export const down = async (knex) => {
	await knex.schema.dropTableIfExists("host_domain_claim_owner");
	await knex.schema.dropTableIfExists("host_domain_claim");
	await knex.schema.dropTableIfExists("host_domain_claim_lock");
};
