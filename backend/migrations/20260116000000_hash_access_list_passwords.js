const bcrypt = require("bcryptjs"); // Ensure bcryptjs is available in node_modules

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const rows = await knex("access_list_auth").select("id", "password");
    for (const row of rows) {
        if (row.password && !row.password.startsWith("$2")) {
            // It's plaintext
            const hashed = await bcrypt.hash(row.password, 13);
            await knex("access_list_auth").where("id", row.id).update({
                password: hashed,
            });
        }
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Cannot un-hash passwords
};
