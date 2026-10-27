/** Fail-closed checks for supported, admin-trusted ShieldPM schemas. Not a hostile SQL sandbox. */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function assertSupportedDatabase(connection) {
	const mysql = ["mysql", "mysql2"].includes(connection.client.config.client);
	const sql = mysql
		? `SELECT 'routine' AS object_type FROM information_schema.routines WHERE routine_schema = DATABASE()
UNION ALL SELECT 'event' FROM information_schema.events WHERE event_schema = DATABASE()
UNION ALL SELECT 'trigger' FROM information_schema.triggers WHERE trigger_schema = DATABASE()
UNION ALL SELECT 'view' FROM information_schema.views WHERE table_schema = DATABASE() LIMIT 1`
		: `SELECT 'routine' AS object_type FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
UNION ALL SELECT 'trigger' FROM pg_catalog.pg_trigger WHERE NOT tgisinternal
UNION ALL SELECT 'view' FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m','f') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
UNION ALL SELECT 'extension' FROM pg_catalog.pg_extension WHERE extname <> 'plpgsql'
UNION ALL SELECT 'schema' FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema') LIMIT 1`;
	const result = await connection.raw(sql);
	const rows = mysql ? result?.[0] : result?.rows;
	if (!Array.isArray(rows)) throw new Error("Could not verify supported database objects");
	if (rows.length)
		throw new Error(
			"Instance backups do not support custom routines, events, triggers, views, extensions or schemas",
		);
}

/** Reject unsupported normal dump objects before any import; the administrator must trust its source. */
export function validatePostgresCatalog(catalog) {
	for (const line of catalog.split("\n")) {
		if (!line || line.startsWith(";")) continue;
		if (
			/\b(?:FUNCTION|PROCEDURE|TRIGGER|RULE|VIEW|FOREIGN|SERVER|USER MAPPING|ACCESS METHOD|TRANSFORM|PUBLICATION|SUBSCRIPTION)\b/.test(
				line,
			) ||
			(/\bEXTENSION\b/.test(line) && !/\bplpgsql\b/.test(line))
		)
			throw new Error("Backup contains unsupported programmable PostgreSQL objects");
	}
}

/**
 * A bounded lexical rejection pass for ordinary provider dumps. String contents are never logged.
 * This catches unsupported MariaDB objects and schema-qualified references, including executable
 * version comments. It does not turn an administrator-supplied SQL archive into untrusted input.
 */
export async function validateMysqlDump(filename) {
	const input = createReadStream(filename);
	const reader = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
	let mode = "code";
	let quote = "";
	let escaped = false;
	let executable = false;
	let statement = "";
	const check = () => {
		if (
			/\b(?:EVENT|TRIGGER|PROCEDURE|FUNCTION|VIEW|DEFINER|DELIMITER|USE|DATABASE|SCHEMA|TABLESPACE|OUTFILE|INFILE|PLUGIN|SONAME|SERVER)\b/i.test(
				statement,
			) ||
			/\b(?:GLOBAL|PERSIST)\s*[.=]/i.test(statement) ||
			/(?:`[^`]+`|[a-z_][a-z_0-9]*)\s*\.\s*(?:`[^`]+`|[a-z_][a-z_0-9]*)/i.test(statement)
		)
			throw new Error("Backup contains unsupported programmable or schema-qualified MySQL SQL");
		statement = "";
	};
	try {
		for await (const raw of reader) {
			// MariaDB's generated client sandbox header contains no server statement.
			if (mode === "code" && /^\/\*M!999999\\- enable the sandbox mode \*\//.test(raw)) continue;
			const line = `${raw}\n`;
			for (let index = 0; index < line.length; index++) {
				const char = line[index];
				const next = line[index + 1];
				if (mode === "comment") {
					if (char === "*" && next === "/") {
						mode = "code";
						index++;
					}
					continue;
				}
				if (mode === "quote") {
					if (escaped) {
						escaped = false;
						continue;
					}
					if (char === "\\") {
						escaped = true;
						continue;
					}
					if (char === quote) {
						if (next === quote) {
							index++;
							continue;
						}
						mode = "code";
					}
					continue;
				}
				if (mode === "identifier") {
					if (char === "`") {
						if (next === "`") {
							index++;
						} else mode = "code";
					}
				} else if (char === "'" || char === '"') {
					quote = char;
					mode = "quote";
					statement += " '?' ";
				} else if (char === "`") {
					mode = "identifier";
					statement += " `id` ";
				} else if (char === "#" || (char === "-" && next === "-" && /\s/.test(line[index + 2] || ""))) break;
				else if (char === "/" && next === "*") {
					const prefix = line.slice(index).match(/^\/\*(?:!|M!)\d*\s*/);
					if (prefix) {
						executable = true;
						index += prefix[0].length - 1;
					} else {
						mode = "comment";
						index++;
					}
				} else if (executable && char === "*" && next === "/") {
					executable = false;
					index++;
				} else if (char === ";") check();
				else statement += char;
				if (statement.length > 1024 * 1024) throw new Error("MySQL dump statement exceeds validation limit");
			}
		}
		if (mode !== "code" || executable) throw new Error("Incomplete MySQL dump syntax");
		check();
	} finally {
		reader.close();
		input.destroy();
	}
}
