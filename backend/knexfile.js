const path = require("node:path");

module.exports = {
	development: {
		client: "mysql2",
		migrations: {
			tableName: "migrations",
			stub: "lib/migrate_template.js",
			directory: path.join(__dirname, "migrations"),
		},
	},

	production: {
		client: "mysql2",
		migrations: {
			tableName: "migrations",
			stub: "lib/migrate_template.js",
			directory: path.join(__dirname, "migrations"),
		},
	},
};
