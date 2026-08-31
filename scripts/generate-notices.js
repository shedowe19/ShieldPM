"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECTS = [
	{ label: "Backend", directory: "backend" },
	{ label: "Frontend", directory: "frontend" },
];

const normalizeLicense = (manifest) => {
	const value = manifest.license ?? manifest.licenses;
	const values = Array.isArray(value) ? value : [value];
	const licenses = values
		.map((entry) => (typeof entry === "string" ? entry : entry?.type))
		.filter((entry) => typeof entry === "string" && entry.trim())
		.map((entry) => entry.trim());

	if (licenses.length === 0) {
		throw new Error(`Installed package ${manifest.name}@${manifest.version} has no declared license`);
	}

	const license = [...new Set(licenses)].join(" OR ");
	if (/\r|\n|[\[\]]/.test(license)) {
		throw new Error(`Installed package ${manifest.name}@${manifest.version} has an invalid license field`);
	}
	return license;
};

const readJson = (filename) => {
	try {
		return JSON.parse(fs.readFileSync(filename, "utf8"));
	} catch (error) {
		throw new Error(`Unable to read ${filename}: ${error.message}`, { cause: error });
	}
};

const installedManifestPath = (projectDirectory, packageName) => {
	const nameParts = packageName.split("/");
	if (
		nameParts.some((part) => !part || part === "." || part === "..") ||
		(nameParts.length !== 1 && !(nameParts.length === 2 && packageName.startsWith("@")))
	) {
		throw new Error(`Invalid dependency name in package.json: ${packageName}`);
	}
	return path.join(projectDirectory, "node_modules", ...nameParts, "package.json");
};

const collectDependencies = (projectDirectory, section) => {
	const packageJsonPath = path.join(projectDirectory, "package.json");
	const projectManifest = readJson(packageJsonPath);
	const declaredDependencies = projectManifest[section] ?? {};

	return Object.keys(declaredDependencies)
		.sort((left, right) => left.localeCompare(right, "en"))
		.map((declaredName) => {
			const manifestPath = installedManifestPath(projectDirectory, declaredName);
			const installedManifest = readJson(manifestPath);
			if (installedManifest.name !== declaredName || typeof installedManifest.version !== "string") {
				throw new Error(`Installed manifest does not match direct dependency ${declaredName}: ${manifestPath}`);
			}

			return {
				name: declaredName,
				version: installedManifest.version,
				license: normalizeLicense(installedManifest),
			};
		});
};

const formatDependencies = (dependencies) =>
	dependencies
		.map(({ name, version, license }) => {
			const npmUrl = `https://www.npmjs.com/package/${name}/v/${version}`;
			return `- [${name}@${version}](${npmUrl}) — ${license}`;
		})
		.join("\n");

const buildNotices = (repositoryRoot) => {
	const sections = PROJECTS.map(({ label, directory }) => {
		const projectDirectory = path.join(repositoryRoot, directory);
		const production = formatDependencies(collectDependencies(projectDirectory, "dependencies"));
		const development = formatDependencies(collectDependencies(projectDirectory, "devDependencies"));
		return `## ${label} dependencies

### Production

${production || "_No direct production dependencies._"}

### Development

${development || "_No direct development dependencies._"}`;
	});

	return `# Third-party notices

ShieldPM uses the direct third-party packages listed below. This file is generated deterministically from each locked installation and the package metadata installed in \`node_modules\`. Transitive packages remain governed by their own license files in the distributed dependency tree.

${sections.join("\n\n")}

For complete license texts and notices, follow the package links and inspect the corresponding distributed package files.
`;
};

const writeNotices = (repositoryRoot, outputPath = path.join(repositoryRoot, "THIRD-PARTY-NOTICES.md")) => {
	const content = buildNotices(repositoryRoot);
	const temporaryPath = `${outputPath}.tmp-${process.pid}`;

	try {
		fs.writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o644, flag: "wx" });
		fs.renameSync(temporaryPath, outputPath);
	} catch (error) {
		try {
			fs.unlinkSync(temporaryPath);
		} catch (cleanupError) {
			if (cleanupError.code !== "ENOENT") {
				error.cleanupError = cleanupError;
			}
		}
		throw error;
	}

	return outputPath;
};

if (require.main === module) {
	try {
		const repositoryRoot = path.resolve(__dirname, "..");
		const outputPath = writeNotices(repositoryRoot);
		process.stdout.write(`Wrote ${path.relative(repositoryRoot, outputPath)} from locked direct dependencies.\n`);
	} catch (error) {
		process.stderr.write(`Failed to generate third-party notices: ${error.message}\n`);
		process.exitCode = 1;
	}
}

module.exports = { buildNotices, collectDependencies, writeNotices };
