import db from "../../db.js";
import { migrateUp } from "../../migrate.js";

try {
	const [, firstRun] = await migrateUp();
	const [, secondRun] = await migrateUp();

	if (secondRun.length !== 0) {
		throw new Error(`The second migration pass was not idempotent: ${secondRun.join(", ")}`);
	}

	process.stdout.write(`Migration verification passed; ${firstRun.length} migration(s) applied on the first pass.\n`);
} finally {
	await db().destroy();
}
