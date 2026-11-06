import fs from "node:fs";
import path from "node:path";
import { createDatabase } from "../../lib/database-config.js";
import {
	commitDatabaseOperation,
	executeDatabaseOperation,
	requestDatabaseOperation,
} from "../../lib/database-switch.js";

try {
	const operation = process.argv[2];
	if (operation === "initialize") {
		const { runMigrations } = await import("../../migrate.js");
		const database = createDatabase({ engine: "sqlite" });
		database.client.config.shieldpmBootstrapSchema = true;
		try {
			await runMigrations(database);
			const timestamp = Date.parse("2026-11-06T10:00:00Z");
			await database("user").insert({
				id: 7101,
				created_on: timestamp,
				modified_on: timestamp,
				email: "fixture@example.invalid",
				name: "Migration Ω 🧪",
				nickname: "fixture",
				avatar: "",
				roles: '["admin"]',
			});
			await database("host_domain_claim").insert({
				domain_key: "f".repeat(64),
				domain_name: "fixture.example.invalid",
			});
			await database("host_domain_claim_owner").insert(
				["proxy", "dead"].map((host_type, index) => ({
					domain_key: "f".repeat(64),
					domain_name: "fixture.example.invalid",
					host_type,
					host_id: 7101 + index,
				})),
			);
			await database("host_domain_claim_lock")
				.where({ id: 1 })
				.update({ sequence: database.raw("9007199254740993") });
			await database("setting").insert({
				id: "migration-fixture",
				name: "Fixture",
				description: "JSON fixture",
				value: "fixture",
				meta: JSON.stringify({ nil: null, nested: [true, "Ω 🧪"] }),
			});
			for (const id of [7101, 7102])
				await database("auth_sessions").insert({
					id,
					user_id: 7101,
					family_id: "f".repeat(36),
					token_hash: String(id).padEnd(64, "a"),
					jti: String(id).padEnd(36, "a"),
					scope: '["user"]',
					created_at: timestamp,
					expires_at: timestamp,
					parent_session_id: id === 7102 ? 7101 : null,
				});
			await database("auth_sessions").where({ id: 7101 }).update({ replaced_by_session_id: 7102 });
			await database.schema.createTable("login_attempts", (table) => {
				table.increments("id").primary();
				table.string("scope", 32).notNullable();
				table.string("identifier", 255).notNullable();
				table.integer("attempt_count").notNullable().defaultTo(0);
				table.bigInteger("first_attempt_at").notNullable();
				table.bigInteger("last_attempt_at").notNullable();
				table.bigInteger("blocked_until").notNullable().defaultTo(0);
				table.unique(["scope", "identifier"]);
			});
			await database("login_attempts").insert({
				id: 7101,
				scope: "identity",
				identifier: "fixture@example.invalid",
				first_attempt_at: timestamp,
				last_attempt_at: timestamp,
			});
		} finally {
			await database.destroy();
		}
	} else if (operation === "request")
		requestDatabaseOperation(JSON.parse(fs.readFileSync(path.join(process.env.DATA_PATH, "target.json"), "utf8")));
	else if (operation === "execute") await executeDatabaseOperation();
	else if (operation === "commit") commitDatabaseOperation();
	else throw new Error("Unknown operation");
} catch {
	// Driver errors can include credentials or row values.
	console.error("Isolated database operation failed");
	process.exitCode = 1;
}
