import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const certificateSourcePath = backendSourcePath("internal", "certificate.js");

describe("archiver ESM compatibility", () => {
	it("uses archiver's named ZipArchive export for certificate downloads", () => {
		const source = fs.readFileSync(certificateSourcePath, "utf8");

		expect(source).toContain('import { ZipArchive } from "archiver";');
		expect(source).toContain("new ZipArchive({ zlib: { level: 9 } })");
		expect(source).not.toContain('import archiver from "archiver";');
	});

	it("creates a ZIP archive through archiver's supported Node ESM API", async () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-archiver-esm-"));
		const sourcePath = path.join(directory, "certificate.pem");
		const archivePath = path.join(directory, "certificate.zip");
		fs.writeFileSync(sourcePath, "shieldpm-node26-archive-test");

		try {
			const archive = new ZipArchive({ zlib: { level: 9 } });
			const output = fs.createWriteStream(archivePath);

			await new Promise((resolve, reject) => {
				archive.on("error", reject);
				output.on("error", reject);
				output.on("close", resolve);
				archive.pipe(output);
				archive.file(sourcePath, { name: "certificate.pem" });
				archive.finalize();
			});

			expect(fs.statSync(archivePath).size).toBeGreaterThan(0);
		} finally {
			fs.rmSync(directory, { force: true, recursive: true });
		}
	});
});
