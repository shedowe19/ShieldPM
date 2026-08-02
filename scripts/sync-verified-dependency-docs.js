const fs = require("node:fs");
const path = require("node:path");

const START_MARKER = "<!-- verified-vite-baseline:start -->";
const END_MARKER = "<!-- verified-vite-baseline:end -->";

const parseRoot = () => {
	const rootIndex = process.argv.indexOf("--root");

	if (rootIndex === -1) {
		return path.resolve(__dirname, "..");
	}

	const suppliedRoot = process.argv[rootIndex + 1];
	if (!suppliedRoot) {
		throw new Error("Missing value for --root");
	}

	return path.resolve(suppliedRoot);
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const packageJsonForResolvedModule = (moduleName, resolvedModulePath) => {
	let directory = path.dirname(resolvedModulePath);

	while (directory !== path.dirname(directory)) {
		const packageJsonPath = path.join(directory, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = readJson(packageJsonPath);
			if (packageJson.name === moduleName) {
				return { packageJson, packageJsonPath: fs.realpathSync(packageJsonPath) };
			}
		}
		directory = path.dirname(directory);
	}

	throw new Error(`Could not locate package.json for resolved ${moduleName} module`);
};

const resolveInstalledPackage = (moduleName, fromDirectory) => {
	let resolvedModulePath;
	try {
		resolvedModulePath = require.resolve(moduleName, { paths: [fromDirectory] });
	} catch (error) {
		throw new Error(`Could not resolve installed ${moduleName} from ${fromDirectory}: ${error.message}`);
	}

	return packageJsonForResolvedModule(moduleName, resolvedModulePath);
};

const synchronize = (root) => {
	const frontendPath = path.join(root, "frontend");
	const frontendManifest = readJson(path.join(frontendPath, "package.json"));
	const expectedViteVersion = frontendManifest.devDependencies?.vite;
	if (!expectedViteVersion || /^[~^]/.test(expectedViteVersion)) {
		throw new Error("Expected frontend devDependency vite to use an exact version");
	}

	const directVite = resolveInstalledPackage("vite", frontendPath);
	if (directVite.packageJson.version !== expectedViteVersion) {
		throw new Error(`Installed Vite ${directVite.packageJson.version} does not match frontend package.json Vite ${expectedViteVersion}`);
	}

	const vitest = resolveInstalledPackage("vitest", frontendPath);
	const vitestVite = resolveInstalledPackage("vite", path.dirname(vitest.packageJsonPath));
	if (vitestVite.packageJsonPath !== directVite.packageJsonPath) {
		throw new Error(`Vitest resolves Vite ${vitestVite.packageJson.version} instead of Vite ${directVite.packageJson.version}`);
	}

	const rolldown = resolveInstalledPackage("rolldown", path.dirname(directVite.packageJsonPath));
	const documentationPath = path.join(root, "docs/wiki-intern/entwicklung/tests.md");
	const documentation = fs.readFileSync(documentationPath, "utf8");
	const start = documentation.indexOf(START_MARKER);
	const end = documentation.indexOf(END_MARKER);

	if (start === -1 || end === -1 || end < start) {
		throw new Error("Missing verified Vite baseline marker in documentation");
	}

	const replacement = `${START_MARKER}Vite und Vitest verwenden gemeinsam Vite ${directVite.packageJson.version}/Rolldown ${rolldown.packageJson.version}.${END_MARKER}`;
	const synchronizedDocumentation = `${documentation.slice(0, start)}${replacement}${documentation.slice(end + END_MARKER.length)}`;

	if (synchronizedDocumentation !== documentation) {
		fs.writeFileSync(documentationPath, synchronizedDocumentation);
		process.stdout.write(`Synchronized installed Vite ${directVite.packageJson.version} and Rolldown ${rolldown.packageJson.version} in ${path.relative(root, documentationPath)}\n`);
	} else {
		process.stdout.write("Verified dependency documentation is already synchronized.\n");
	}
};

try {
	synchronize(parseRoot());
} catch (error) {
	process.stderr.write(`Failed to synchronize verified dependency documentation: ${error.message}\n`);
	process.exitCode = 1;
}
