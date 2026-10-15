import { migrate as logger } from "../logger.js";

const reservationTable = "host_domain_reservation";
const hostTables = ["proxy_host", "redirection_host", "dead_host"];
const triggerTables = ["host_domain", ...hostTables];
const operations = ["insert", "update", "delete"];
const engine = (knex) => knex.client.config.client;
const postgres = (knex) => ["pg", "postgres", "postgresql"].includes(engine(knex));
const mysql = (knex) => ["mysql", "mysql2"].includes(engine(knex));
const triggerName = (table, operation) => `shieldpm_domains_${table}_${operation}`;

/** Detect historical conflicts before any DDL, retaining every existing host for an explicit repair. */
const existingReservations = async (knex) => {
	const reservations = new Map();
	const add = (domain, hostType, hostId) => {
		if (typeof domain !== "string" || !domain.length) return;
		const normalized = domain.toLowerCase();
		const previous = reservations.get(normalized);
		if (previous && (previous.host_type !== hostType || previous.host_id !== hostId)) {
			throw new Error(
				`Cannot reserve active domain ${JSON.stringify(normalized)}: ${previous.host_type} #${previous.host_id} and ${hostType} #${hostId}. Rename or delete one conflicting host, then retry the migration. No hosts were removed.`,
			);
		}
		reservations.set(normalized, { domain_name: normalized, host_type: hostType, host_id: hostId });
	};
	const proxyDomains = await knex("host_domain as d")
		.join("proxy_host as h", "h.id", "d.proxy_host_id")
		.where("h.is_deleted", 0)
		.select("d.domain_name", "d.proxy_host_id");
	for (const row of proxyDomains) add(row.domain_name, "proxy_host", row.proxy_host_id);
	for (const table of hostTables.slice(1)) {
		for (const host of await knex(table).where("is_deleted", 0).select("id", "domain_names")) {
			let domains = host.domain_names;
			try {
				if (typeof domains === "string") domains = JSON.parse(domains);
			} catch {
				throw new Error(`Cannot reserve domains: ${table} #${host.id} has invalid domain_names JSON`);
			}
			if (!Array.isArray(domains)) {
				throw new Error(`Cannot reserve domains: ${table} #${host.id} has a non-array domain_names value`);
			}
			for (const domain of domains) add(domain, table, host.id);
		}
	}
	return [...reservations.values()];
};

const dropTriggers = async (knex) => {
	for (const table of triggerTables) {
		for (const operation of postgres(knex) ? [...operations, "truncate"] : operations) {
			const name = triggerName(table, operation);
			if (postgres(knex)) await knex.raw(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
			else await knex.raw(`DROP TRIGGER IF EXISTS ${name}`);
		}
	}
	if (postgres(knex)) {
		await knex.raw("DROP FUNCTION IF EXISTS shieldpm_truncate_host_domains()");
		await knex.raw("DROP FUNCTION IF EXISTS shieldpm_sync_host_domains()");
		await knex.raw("DROP FUNCTION IF EXISTS shieldpm_refresh_host_domains(text, integer)");
	}
};

const sqliteProxyRefresh = (id) => `
	DELETE FROM ${reservationTable} WHERE host_type = 'proxy_host' AND host_id = ${id};
	INSERT INTO ${reservationTable} (domain_name, host_type, host_id)
	SELECT DISTINCT lower(d.domain_name), 'proxy_host', d.proxy_host_id
	FROM host_domain d JOIN proxy_host h ON h.id = d.proxy_host_id
	WHERE h.id = ${id} AND h.is_deleted = 0 AND length(d.domain_name) > 0;`;

const sqliteJsonRefresh = (table, reference) => `
	DELETE FROM ${reservationTable} WHERE host_type = '${table}' AND host_id = ${reference}.id;
	INSERT INTO ${reservationTable} (domain_name, host_type, host_id)
	SELECT DISTINCT lower(value), '${table}', ${reference}.id FROM json_each(${reference}.domain_names)
	WHERE ${reference}.is_deleted = 0 AND type = 'text' AND length(value) > 0;`;

const createSqliteTriggers = async (knex) => {
	for (const operation of operations) {
		const before = operation !== "insert" ? sqliteProxyRefresh("OLD.proxy_host_id") : "";
		const after = operation !== "delete" ? sqliteProxyRefresh("NEW.proxy_host_id") : "";
		await knex.raw(`CREATE TRIGGER ${triggerName("host_domain", operation)} AFTER ${operation} ON host_domain
			BEGIN ${before} ${after} END`);
		for (const table of hostTables) {
			const remove =
				operation !== "insert"
					? `DELETE FROM ${reservationTable} WHERE host_type = '${table}' AND host_id = OLD.id;`
					: "";
			const insert =
				operation === "delete"
					? ""
					: table === "proxy_host"
						? sqliteProxyRefresh("NEW.id")
						: sqliteJsonRefresh(table, "NEW");
			const columns = table === "proxy_host" ? "id, is_deleted" : "id, is_deleted, domain_names";
			const event = operation === "update" ? `UPDATE OF ${columns}` : operation;
			await knex.raw(`CREATE TRIGGER ${triggerName(table, operation)} AFTER ${event} ON ${table}
				BEGIN ${remove} ${insert} END`);
		}
	}
};

const createPostgresTriggers = async (knex) => {
	await knex.raw(`CREATE FUNCTION shieldpm_refresh_host_domains(host_type_ text, host_id_ integer)
		RETURNS void LANGUAGE plpgsql AS $$
		DECLARE domains_ jsonb;
		BEGIN
			IF host_type_ = 'proxy_host' THEN
				PERFORM 1 FROM proxy_host WHERE id = host_id_ FOR UPDATE;
			ELSIF host_type_ = 'redirection_host' THEN
				SELECT domain_names::jsonb INTO domains_ FROM redirection_host
				WHERE id = host_id_ AND is_deleted = 0 FOR UPDATE;
			ELSE
				SELECT domain_names::jsonb INTO domains_ FROM dead_host
				WHERE id = host_id_ AND is_deleted = 0 FOR UPDATE;
			END IF;
			DELETE FROM ${reservationTable} WHERE host_type = host_type_ AND host_id = host_id_;
			IF host_type_ = 'proxy_host' THEN
				INSERT INTO ${reservationTable} (domain_name, host_type, host_id)
				SELECT DISTINCT lower(d.domain_name), host_type_, host_id_ FROM host_domain d
				JOIN proxy_host h ON h.id = d.proxy_host_id
				WHERE h.id = host_id_ AND h.is_deleted = 0 AND length(d.domain_name) > 0;
			ELSE
				INSERT INTO ${reservationTable} (domain_name, host_type, host_id)
				SELECT DISTINCT lower(value), host_type_, host_id_
				FROM jsonb_array_elements_text(COALESCE(domains_, '[]'::jsonb))
				WHERE length(value) > 0;
			END IF;
		END $$`);
	await knex.raw(`CREATE FUNCTION shieldpm_sync_host_domains() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN
			IF TG_TABLE_NAME = 'host_domain' THEN
				IF TG_OP <> 'INSERT' THEN
					PERFORM shieldpm_refresh_host_domains('proxy_host', OLD.proxy_host_id);
				END IF;
				IF TG_OP <> 'DELETE' THEN
					PERFORM shieldpm_refresh_host_domains('proxy_host', NEW.proxy_host_id);
				END IF;
			ELSE
				IF TG_OP <> 'INSERT' THEN
					DELETE FROM ${reservationTable} WHERE host_type = TG_TABLE_NAME AND host_id = OLD.id;
				END IF;
				IF TG_OP <> 'DELETE' THEN
					PERFORM shieldpm_refresh_host_domains(TG_TABLE_NAME, NEW.id);
				END IF;
			END IF;
			RETURN NULL;
		END $$`);
	await knex.raw(`CREATE FUNCTION shieldpm_truncate_host_domains() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN
			DELETE FROM ${reservationTable}
			WHERE host_type = CASE WHEN TG_TABLE_NAME = 'host_domain' THEN 'proxy_host' ELSE TG_TABLE_NAME END;
			RETURN NULL;
		END $$`);
	for (const table of triggerTables) {
		for (const operation of operations) {
			const columns =
				table === "proxy_host"
					? "id, is_deleted"
					: table === "host_domain"
						? "proxy_host_id, domain_name"
						: "id, is_deleted, domain_names";
			const event = operation === "update" ? `UPDATE OF ${columns}` : operation;
			await knex.raw(`CREATE TRIGGER ${triggerName(table, operation)} AFTER ${event} ON ${table}
				FOR EACH ROW EXECUTE FUNCTION shieldpm_sync_host_domains()`);
		}
		await knex.raw(`CREATE TRIGGER ${triggerName(table, "truncate")} AFTER TRUNCATE ON ${table}
			FOR EACH STATEMENT EXECUTE FUNCTION shieldpm_truncate_host_domains()`);
	}
};

const mysqlProxyRefresh = (id) => `
	IF EXISTS (SELECT 1 FROM ${reservationTable} WHERE host_type = 'proxy_host' AND host_id = ${id}) THEN
		DELETE FROM ${reservationTable} WHERE host_type = 'proxy_host' AND host_id = ${id};
	END IF;
	INSERT INTO ${reservationTable} (domain_name, host_type, host_id)
	SELECT DISTINCT CONVERT(LOWER(d.domain_name) USING utf8mb4) COLLATE utf8mb4_bin, 'proxy_host', d.proxy_host_id
	FROM host_domain d JOIN proxy_host h ON h.id = d.proxy_host_id
	WHERE h.id = ${id} AND h.is_deleted = 0 AND LENGTH(d.domain_name) > 0;`;

const mysqlJsonRefresh = (table) => `
	IF NEW.is_deleted = 0 THEN
		SET domain_index_ = 0;
		WHILE domain_index_ < JSON_LENGTH(NEW.domain_names) DO
			SET domain_ = LOWER(JSON_UNQUOTE(JSON_EXTRACT(NEW.domain_names, CONCAT('$[', domain_index_, ']'))));
			IF LENGTH(domain_) > 0 AND NOT EXISTS (
				SELECT 1 FROM ${reservationTable}
				WHERE domain_name = domain_ AND host_type = '${table}' AND host_id = NEW.id
			) THEN
				INSERT INTO ${reservationTable} (domain_name, host_type, host_id) VALUES (domain_, '${table}', NEW.id);
			END IF;
			SET domain_index_ = domain_index_ + 1;
		END WHILE;
	END IF;`;

const createMysqlTriggers = async (knex) => {
	for (const operation of operations) {
		const before = operation !== "insert" ? mysqlProxyRefresh("OLD.proxy_host_id") : "";
		const after = operation !== "delete" ? mysqlProxyRefresh("NEW.proxy_host_id") : "";
		await knex.raw(`CREATE TRIGGER ${triggerName("host_domain", operation)} AFTER ${operation} ON host_domain
			FOR EACH ROW BEGIN ${before} ${after} END`);
		for (const table of hostTables) {
			const declarations = table === "proxy_host" ? "" : "DECLARE domain_index_ INT; DECLARE domain_ TEXT;";
			const remove =
				operation !== "insert"
					? `DELETE FROM ${reservationTable} WHERE host_type = '${table}' AND host_id = OLD.id;`
					: "";
			const insert =
				operation === "delete"
					? ""
					: table === "proxy_host"
						? mysqlProxyRefresh("NEW.id")
						: mysqlJsonRefresh(table);
			const changed =
				table === "proxy_host"
					? "NOT (NEW.id <=> OLD.id) OR NOT (NEW.is_deleted <=> OLD.is_deleted)"
					: "NOT (NEW.id <=> OLD.id) OR NOT (NEW.is_deleted <=> OLD.is_deleted) OR NOT (NEW.domain_names <=> OLD.domain_names)";
			const body =
				operation === "update" ? `IF ${changed} THEN ${remove} ${insert} END IF;` : `${remove} ${insert}`;
			await knex.raw(`CREATE TRIGGER ${triggerName(table, operation)} AFTER ${operation} ON ${table}
				FOR EACH ROW BEGIN ${declarations} ${body} END`);
		}
	}
};

/** Enforce the existing case-insensitive, cross-host-type domain contract at the database write boundary. */
export const up = async (knex) => {
	const reservations = await existingReservations(knex);
	// MySQL DDL is not transactional: permit a safe retry after an interrupted trigger installation.
	await dropTriggers(knex);
	await knex.schema.dropTableIfExists(reservationTable);
	await knex.schema.createTable(reservationTable, (table) => {
		if (mysql(knex)) {
			table.engine("InnoDB");
			table.charset("utf8mb4");
			table.collate("utf8mb4_bin");
		}
		table.string("domain_name", 255).notNullable();
		table.string("host_type", 32).notNullable();
		table.integer("host_id").unsigned().notNullable();
		table.unique(["domain_name"], "host_domain_reservation_domain_unique");
		table.index(["host_type", "host_id"], "host_domain_reservation_owner");
	});
	for (let index = 0; index < reservations.length; index += 100) {
		await knex(reservationTable).insert(reservations.slice(index, index + 100));
	}
	if (postgres(knex)) await createPostgresTriggers(knex);
	else if (mysql(knex)) await createMysqlTriggers(knex);
	else await createSqliteTriggers(knex);
	logger.info(`Reserved ${reservations.length} active host domains atomically`);
};

/** Remove only the derived reservation index and its triggers; host/domain data remain untouched. */
export const down = async (knex) => {
	await dropTriggers(knex);
	await knex.schema.dropTableIfExists(reservationTable);
};
