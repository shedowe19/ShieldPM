import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests must never write into the production data path. Key generation touches
 * the SQLite path and `keys.json` on first use, and CI runners cannot create
 * `/data`. A writable per-worker directory keeps the tests isolated without
 * changing production defaults.
 */
if (!process.env.DATA_PATH) {
	const directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-test-data-"));
	process.env.DATA_PATH = directory;
	process.once("exit", () => {
		fs.rmSync(directory, { recursive: true, force: true });
	});
}
