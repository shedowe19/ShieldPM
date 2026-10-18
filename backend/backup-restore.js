#!/usr/bin/env node
// Run before .env loading, migrations and services; never invoke --apply from a live backend.
import { InstanceBackup } from "./lib/instance-backup.js";

try {
	const engine = new InstanceBackup();
	if (process.argv[2] === "--apply") {
		if (await engine.apply()) console.log("Verified instance restore activated; waiting for backend readiness.");
	} else if (process.argv[2] === "--rollback") {
		const pending = await engine.pending();
		if (pending && ["activated", "activating"].includes(pending.phase)) await engine.rollback(pending);
	} else throw new Error("Usage: backup-restore.js --apply|--rollback");
} catch {
	console.error(
		"Instance restore could not be activated safely. Existing data or a private recovery checkpoint was retained.",
	);
	process.exitCode = 1;
}
