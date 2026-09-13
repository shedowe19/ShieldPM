import bcrypt from "bcryptjs";

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
	const rows = await knex("access_list_auth").select("id", "password");
	for (const row of rows) {
		const isBcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(row.password);
		const isApr1Hash = /^\$apr1\$[./A-Za-z0-9]{1,8}\$[./A-Za-z0-9]{22}$/.test(row.password);
		if (row.password && !isBcryptHash && !isApr1Hash) {
			// A hash-like prefix alone is also valid plaintext; retain complete supported htpasswd hashes.
			const hashed = await bcrypt.hash(row.password, 13);
			await knex("access_list_auth").where("id", row.id).update({
				password: hashed,
			});
		}
	}
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(_knex) {
	// Cannot un-hash passwords
}
