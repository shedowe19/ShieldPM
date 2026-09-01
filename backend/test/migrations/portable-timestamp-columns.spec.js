import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationSource = (filename) =>
	fs.readFileSync(fileURLToPath(new URL(`../../migrations/${filename}`, import.meta.url)), "utf8");

describe("portable migration timestamp columns", () => {
	it.each(["20260127000000_add_chat_integration.js", "20260222000000_normalize_domain_names.js"])(
		"uses temporal columns for CURRENT_TIMESTAMP defaults in %s",
		(filename) => {
			const source = migrationSource(filename);

			for (const column of ["created_on", "modified_on"]) {
				expect(source).toContain(`table.dateTime("${column}").notNullable().defaultTo(knex.fn.now())`);
				expect(source).not.toContain(`table.string("${column}").notNullable().defaultTo(knex.fn.now())`);
			}
		},
	);
});
