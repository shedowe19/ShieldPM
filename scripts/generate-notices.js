const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HEADER = `# Third-Party Notices

This project (ShieldPM) incorporates the following third-party components. The licenses are extracted directly from the NPM Registry API for the specified versions. This list includes both production dependencies and development dependencies from the backend and frontend package.json files.

For verification, each entry links to the NPM package page (e.g., https://www.npmjs.com/package/<package>/v/<version>), where the license can be confirmed in the package metadata. Note: Transitive dependencies (dependencies of dependencies) are not included, as this focuses on direct dependencies.
`;

const FOOTER = `
The above information is based solely on the NPM Registry data as of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. For full license texts, refer to the respective package repositories or the NPM links provided.
`;

function getLicenses(cwd, production) {
	const type = production ? "--production" : "--development";
	const args = ["--start", ".", "--json", "--direct", type];

	process.stdout.write(`Running in ${cwd}: license-checker ${args.join(" ")}\n`);
	const output = execFileSync("license-checker", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	return JSON.parse(output);
}

function formatDeps(deps) {
	const lines = [];
	const sortedKeys = Object.keys(deps).sort();

	for (const key of sortedKeys) {
		const pkg = deps[key];
		// Key is usually "name@version"
		const lastAt = key.lastIndexOf("@");
		const name = key.substring(0, lastAt);
		const version = key.substring(lastAt + 1);

		let license = pkg.licenses;
		if (Array.isArray(license)) license = license.join(" OR ");

		const npmLink = `https://www.npmjs.com/package/${name}/v/${version}`;
		lines.push(`- ${key} - ${license}[](${npmLink})`);
	}
	return lines.join("\n");
}

function main() {
	const backendPath = path.resolve(__dirname, "../backend");
	const frontendPath = path.resolve(__dirname, "../frontend");

	process.stdout.write("Fetching Backend Production...\n");
	const backProd = getLicenses(backendPath, true);
	process.stdout.write("Fetching Backend Development...\n");
	const backDev = getLicenses(backendPath, false);

	process.stdout.write("Fetching Frontend Production...\n");
	const frontProd = getLicenses(frontendPath, true);
	process.stdout.write("Fetching Frontend Development...\n");
	const frontDev = getLicenses(frontendPath, false);

	let content = HEADER;

	content += "\n## Backend Dependencies (from backend/package.json)\n\n";
	content += "### Production Dependencies\n";
	content += formatDeps(backProd);
	content += "\n\n### Development Dependencies\n";
	content += formatDeps(backDev);

	content += "\n\n## Frontend Dependencies (from frontend/package.json)\n\n";
	content += "### Production Dependencies\n";
	content += formatDeps(frontProd);
	content += "\n\n### Development Dependencies\n";
	content += formatDeps(frontDev);

	content += `\n${FOOTER}`;

	fs.writeFileSync(path.resolve(__dirname, "../THIRD-PARTY-NOTICES.md"), content);
	process.stdout.write("Successfully wrote THIRD-PARTY-NOTICES.md\n");
}

try {
	main();
} catch (error) {
	process.stderr.write(`Failed to generate third-party notices: ${error.message}\n`);
	process.exitCode = 1;
}
