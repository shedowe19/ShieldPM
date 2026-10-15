import { Model } from "objection";
import { expect } from "vitest";
import { translateDomainReservationError } from "../../lib/domain-reservations.js";
import { withImportedIdSequence } from "../../lib/gitops-sequences.js";
import * as migration from "../../migrations/20261015000003_reserve_active_host_domains.js";

/** Minimal actual host storage shared by SQLite, PostgreSQL and the dedicated MariaDB CI suite. */
export const createDomainReservationSchema = async (db) => {
	for (const name of ["proxy_host", "redirection_host", "dead_host"]) {
		await db.schema.createTable(name, (table) => {
			table.increments("id");
			table.integer("is_deleted").notNullable().defaultTo(0);
			table.json("domain_names").notNullable().defaultTo("[]");
		});
	}
	await db.schema.createTable("host_domain", (table) => {
		table.increments("id");
		table.integer("proxy_host_id").unsigned().notNullable();
		table.string("domain_name").notNullable();
		table.foreign("proxy_host_id").references("proxy_host.id").onDelete("CASCADE").onUpdate("CASCADE");
	});
};

const reservation = (db, domain) => db("host_domain_reservation").where("domain_name", domain).first();
const conflict = (promise) =>
	expect(Promise.resolve(promise).catch(translateDomainReservationError)).rejects.toMatchObject({
		name: "ValidationError",
		public: true,
		status: 400,
	});

/** Exercise real atomic write/rollback boundaries rather than a copied availability-check formula. */
export const exerciseDomainReservationContract = async (db) => {
	await createDomainReservationSchema(db);
	await db("proxy_host").insert([
		{ id: 1, is_deleted: 0 },
		{ id: 2, is_deleted: 1 },
	]);
	await db("host_domain").insert([
		{ id: 1, proxy_host_id: 1, domain_name: "Example.TEST" },
		{ id: 2, proxy_host_id: 1, domain_name: "example.test" },
		{ id: 3, proxy_host_id: 2, domain_name: "example.test" },
	]);
	await db("redirection_host").insert({ id: 3, domain_names: JSON.stringify(["redirect.test"]) });
	await db("dead_host").insert({ id: 4, domain_names: JSON.stringify(["dead.test"]) });
	await migration.up(db);
	expect(await db("host_domain_reservation").orderBy("domain_name")).toEqual([
		{ domain_name: "dead.test", host_type: "dead_host", host_id: 4 },
		{ domain_name: "example.test", host_type: "proxy_host", host_id: 1 },
		{ domain_name: "redirect.test", host_type: "redirection_host", host_id: 3 },
	]);

	// A failed multi-domain insert rolls back the whole statement, including its earlier reservations.
	await conflict(db("dead_host").insert({ id: 5, domain_names: JSON.stringify(["free.test", "EXAMPLE.test"]) }));
	expect(await db("dead_host").where("id", 5).first()).toBeUndefined();
	expect(await reservation(db, "free.test")).toBeUndefined();
	await conflict(
		db("redirection_host")
			.where("id", 3)
			.update({ domain_names: JSON.stringify(["EXAMPLE.test"]) }),
	);
	expect(await reservation(db, "redirect.test")).toMatchObject({ host_type: "redirection_host", host_id: 3 });

	// Direct relation writes, renames, moves and duplicate entries remain consistent without service hooks.
	await db("proxy_host").insert([{ id: 5 }, { id: 6 }]);
	await conflict(db("host_domain").insert({ id: 4, proxy_host_id: 5, domain_name: "EXAMPLE.TEST" }));
	expect(await db("host_domain").where("proxy_host_id", 5)).toEqual([]);
	await db("host_domain").insert({ id: 5, proxy_host_id: 5, domain_name: "fresh.test" });
	await conflict(db("host_domain").where("id", 5).update({ domain_name: "EXAMPLE.test" }));
	expect((await db("host_domain").where("id", 5).first()).domain_name).toBe("fresh.test");
	await db("host_domain").where("id", 5).update({ proxy_host_id: 6, domain_name: "moved.test" });
	expect(await reservation(db, "fresh.test")).toBeUndefined();
	expect(await reservation(db, "moved.test")).toMatchObject({ host_id: 6 });
	await db("host_domain").insert({ id: 6, proxy_host_id: 6, domain_name: "MOVED.test" });
	await db("host_domain").where("id", 5).delete();
	expect(await reservation(db, "moved.test")).toMatchObject({ host_id: 6 });
	await db("host_domain").where("id", 6).delete();
	expect(await reservation(db, "moved.test")).toBeUndefined();

	// A deleted host releases names; restoring it must fail atomically while a different type owns one.
	await db("proxy_host").where("id", 1).update({ is_deleted: 1 });
	await db("redirection_host").insert({ id: 7, domain_names: JSON.stringify(["example.test"]) });
	await conflict(db("proxy_host").where("id", 1).update({ is_deleted: 0 }));
	expect((await db("proxy_host").where("id", 1).first()).is_deleted).toBe(1);
	expect(await reservation(db, "example.test")).toMatchObject({ host_type: "redirection_host", host_id: 7 });
	await db("redirection_host").where("id", 7).update({ is_deleted: 1 });
	await db("proxy_host").where("id", 1).update({ is_deleted: 0 });
	expect(await reservation(db, "example.test")).toMatchObject({ host_type: "proxy_host", host_id: 1 });
	await db("proxy_host").where("id", 1).update({ id: 8 });
	expect(await reservation(db, "example.test")).toMatchObject({ host_id: 8 });
	await db("proxy_host").where("id", 8).delete();
	expect(await reservation(db, "example.test")).toBeUndefined();
	expect(await db("host_domain").where("proxy_host_id", 8)).toEqual([]);
	await db("dead_host").where("id", 4).delete();
	expect(await reservation(db, "dead.test")).toBeUndefined();
	await db("redirection_host").where("id", 3).delete();
	expect(await reservation(db, "redirect.test")).toBeUndefined();

	// Both writers can observe availability, but the database permits only one cross-type claim.
	expect(await reservation(db, "raced.test")).toBeUndefined();
	const writes = await Promise.allSettled([
		db("redirection_host").insert({ id: 10, domain_names: JSON.stringify(["raced.test"]) }),
		db("dead_host").insert({ id: 10, domain_names: JSON.stringify(["RACED.test"]) }),
	]);
	expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(writes.filter((result) => result.status === "rejected")).toHaveLength(1);
	expect(await reservation(db, "raced.test")).toBeTruthy();
	const winners = await Promise.all([db("redirection_host").where("id", 10), db("dead_host").where("id", 10)]);
	expect(winners.flat()).toHaveLength(1);
	const proxyWrites = await Promise.allSettled(
		[13, 14].map((id) =>
			db.transaction(async (trx) => {
				await trx("proxy_host").insert({ id });
				await trx("host_domain").insert({
					id,
					proxy_host_id: id,
					domain_name: id === 13 ? "proxy-race.test" : "PROXY-RACE.test",
				});
			}),
		),
	);
	expect(proxyWrites.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(proxyWrites.filter((result) => result.status === "rejected")).toHaveLength(1);
	expect(await db("proxy_host").whereIn("id", [13, 14])).toHaveLength(1);
	expect(await db("host_domain").whereIn("proxy_host_id", [13, 14])).toHaveLength(1);
	expect(await reservation(db, "proxy-race.test")).toBeTruthy();

	await expect(
		db.transaction(async (trx) => {
			await trx("proxy_host").insert({ id: 11 });
			await trx("host_domain").insert({ proxy_host_id: 11, domain_name: "rollback.test" });
			throw new Error("deliberate transaction rollback");
		}),
	).rejects.toThrow("deliberate transaction rollback");
	expect(await db("proxy_host").where("id", 11).first()).toBeUndefined();
	expect(await reservation(db, "rollback.test")).toBeUndefined();

	// Wildcards remain distinct names; this adds no new overlap policy to the existing exact-match contract.
	await db("dead_host").insert({ id: 12, domain_names: JSON.stringify(["*.wild.test", "one.wild.test"]) });
	expect(await reservation(db, "*.wild.test")).toMatchObject({ host_id: 12 });
	expect(await reservation(db, "one.wild.test")).toMatchObject({ host_id: 12 });
	await db("proxy_host").insert({ id: 15 });
	await db("host_domain").insert([
		{ id: 15, proxy_host_id: 15, domain_name: "plain.test" },
		{ id: 16, proxy_host_id: 15, domain_name: "pläin.test" },
	]);
	expect(await reservation(db, "plain.test")).toMatchObject({ host_id: 15 });
	expect(await reservation(db, "pläin.test")).toMatchObject({ host_id: 15 });
	const additions = await Promise.allSettled(
		[19, 20].map((id) =>
			db.transaction((trx) =>
				trx("host_domain").insert({ id, proxy_host_id: 15, domain_name: `concurrent-${id}.test` }),
			),
		),
	);
	// Engines may abort a competing transaction on a deadlock; every committed child must stay reserved.
	expect(additions.some(({ status }) => status === "fulfilled")).toBe(true);
	const committedDomains = (await db("host_domain").where("proxy_host_id", 15).pluck("domain_name"))
		.map((domain) => domain.toLowerCase())
		.sort();
	expect(
		(
			await db("host_domain_reservation").where({ host_type: "proxy_host", host_id: 15 }).pluck("domain_name")
		).sort(),
	).toEqual(committedDomains);
	class ImportedDomain extends Model {
		static get tableName() {
			return "host_domain";
		}
	}
	class ImportedHost extends Model {
		static get tableName() {
			return "proxy_host";
		}
		static get relationMappings() {
			return {
				host_domains: {
					relation: Model.HasManyRelation,
					modelClass: ImportedDomain,
					join: { from: "proxy_host.id", to: "host_domain.proxy_host_id" },
				},
			};
		}
	}
	const Host = ImportedHost.bindKnex(db);
	await conflict(
		withImportedIdSequence(Host, (transaction) =>
			Host.query(transaction).insertGraph({
				id: 17,
				host_domains: [
					{ id: 17, domain_name: "import-free.test" },
					{ id: 18, domain_name: "plain.test" },
				],
			}),
		),
	);
	expect(await db("proxy_host").where("id", 17).first()).toBeUndefined();
	expect(await db("host_domain").where("proxy_host_id", 17)).toEqual([]);
	expect(await reservation(db, "import-free.test")).toBeUndefined();

	// Safe retry after partial nontransactional DDL and downgrade never discard source host/domain records.
	const before = await db("host_domain_reservation").orderBy("domain_name");
	await migration.up(db);
	expect(await db("host_domain_reservation").orderBy("domain_name")).toEqual(before);
	await migration.down(db);
	expect(await db.schema.hasTable("host_domain_reservation")).toBe(false);
	expect(await db("dead_host").where("id", 12).first()).toBeTruthy();
	await db("redirection_host").insert({ id: 12, domain_names: JSON.stringify(["ONE.wild.test"]) });
	await expect(migration.up(db)).rejects.toThrow(
		/Cannot reserve active domain.*dead_host|Cannot reserve active domain.*redirection_host/,
	);
	expect(await db.schema.hasTable("host_domain_reservation")).toBe(false);
	expect(await db("dead_host").where("id", 12).first()).toBeTruthy();
	expect(await db("redirection_host").where("id", 12).first()).toBeTruthy();
	await db("redirection_host").where("id", 12).update({ is_deleted: 1 });
	await migration.up(db);
	expect(await reservation(db, "one.wild.test")).toMatchObject({ host_type: "dead_host", host_id: 12 });
};
