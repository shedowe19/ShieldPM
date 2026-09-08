import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const templatesDirectory = path.join(path.dirname(filename), "../templates");

// The startup check and the post-regeneration writer must use the same input
// framing. Concatenation alone confuses e.g. HTTPS=443/HTTP=80 with 44/380.
export const getEnvironmentHash = async () => {
	const files = (await fs.promises.readdir(templatesDirectory)).sort();
	const templates = await Promise.all(
		files.map(async (file) => [file, await fs.promises.readFile(path.join(templatesDirectory, file), "utf8")]),
	);
	const names = [...new Set(templates.flatMap(([, content]) => content.match(/env\.[A-Z0-9_]+/g) || []))].sort();
	const environment = names.map((name) => [name, process.env[name.slice(4)] ?? null]);
	// Include template contents so fixes also regenerate hosts on builds which
	// intentionally retain the application and template version.
	return crypto
		.createHash("sha512")
		.update(JSON.stringify({ templates, environment, version: process.env.TV ?? null }))
		.digest("hex");
};

if (import.meta.main) {
	console.log(await getEnvironmentHash());
}
