import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { init, parse } from "es-module-lexer";
import { describe, expect, it } from "vitest";

const backendRoot = fileURLToPath(new URL("../../", import.meta.url));
const nodeBuiltins = new Set([
	...builtinModules,
	...builtinModules.map((moduleName) => moduleName.replace(/^node:/, "")),
]);
const identifierPattern = /^[$A-Za-z_][$\w]*$/;
const resolverScript = `
const requests = JSON.parse(process.argv[1]);
const resolutions = requests.map((request) => ({
	...request,
	resolved: import.meta.resolve(request.specifier, request.consumerUrl),
}));
process.stdout.write(JSON.stringify(resolutions));
`;

const isBarePackage = (specifier) =>
	!specifier.startsWith(".") &&
	!specifier.startsWith("/") &&
	!specifier.startsWith("#") &&
	!specifier.startsWith("node:") &&
	!nodeBuiltins.has(specifier);

const collectProductionJavaScriptFiles = (directory, relativeDirectory = "") => {
	const files = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "test") continue;
			files.push(
				...collectProductionJavaScriptFiles(
					path.join(directory, entry.name),
					path.join(relativeDirectory, entry.name),
				),
			);
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".js")) {
			files.push(path.join(relativeDirectory, entry.name));
		}
	}

	return files;
};

const hasDefaultBinding = (importPrefix) => {
	const importClause = importPrefix
		.replace(/^\s*import\s+/, "")
		.replace(/\s*from\s+["']$/, "")
		.trim();
	const tokens = importClause.match(/[$A-Za-z_][$\w]*|[{},*]/g) ?? [];

	if (tokens.length === 0) return false;
	if (tokens[0] !== "{" && tokens[0] !== "*") return true;

	return tokens.some(
		(token, index) =>
			token === "default" && tokens[index + 1] === "as" && identifierPattern.test(tokens[index + 2] ?? ""),
	);
};

const collectPackageDefaultImports = async () => {
	await init;
	const consumers = [];

	for (const relativePath of collectProductionJavaScriptFiles(backendRoot)) {
		const absolutePath = path.join(backendRoot, relativePath);
		const source = fs.readFileSync(absolutePath, "utf8");
		const [imports] = parse(source);

		for (const moduleRequest of imports) {
			if (moduleRequest.d !== -1 || !moduleRequest.n || !isBarePackage(moduleRequest.n)) continue;
			if (!hasDefaultBinding(source.slice(moduleRequest.ss, moduleRequest.s))) continue;

			consumers.push({
				consumerPath: relativePath,
				consumerUrl: pathToFileURL(absolutePath).href,
				line: source.slice(0, moduleRequest.ss).split("\n").length,
				specifier: moduleRequest.n,
			});
		}
	}

	return consumers;
};

const resolveFromProductionConsumers = (requests) => {
	const resolver = spawnSync(
		process.execPath,
		[
			"--experimental-import-meta-resolve",
			"--input-type=module",
			"--eval",
			resolverScript,
			JSON.stringify(requests),
		],
		{ encoding: "utf8" },
	);

	if (resolver.error) throw resolver.error;
	if (resolver.status !== 0) {
		throw new Error(`Node ESM resolver failed: ${resolver.stderr || resolver.stdout}`);
	}

	return JSON.parse(resolver.stdout);
};

describe("supported Node package default-import compatibility", () => {
	it("declares its source parser as a direct development dependency", () => {
		const backendManifest = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"));

		expect(backendManifest.devDependencies?.["es-module-lexer"]).toBeDefined();
	});

	it("recognizes every static JavaScript default-binding form without matching non-default imports", async () => {
		await init;
		const source = `
			import defaultOnly from "default-only";
			import defaultAndNamed, { named } from "default-and-named";
			import defaultAndNamespace, * as namespace from "default-and-namespace";
			import { named, default as renamedDefault } from "named-default";
			import * as namespaceOnly from "namespace-only";
			import { namedOnly } from "named-only";
			import "side-effect-only";
		`;
		const [imports] = parse(source);

		const defaultBoundSpecifiers = imports
			.filter(
				(moduleRequest) =>
					moduleRequest.d === -1 && hasDefaultBinding(source.slice(moduleRequest.ss, moduleRequest.s)),
			)
			.map((moduleRequest) => moduleRequest.n);

		expect(defaultBoundSpecifiers).toEqual([
			"default-only",
			"default-and-named",
			"default-and-namespace",
			"named-default",
		]);
	});

	it("resolves conditional packages through the ESM import entry point used by their production consumer", () => {
		const consumerUrl = pathToFileURL(path.join(backendRoot, "internal", "anubis.js")).href;
		const [resolution] = resolveFromProductionConsumers([{ consumerUrl, specifier: "js-yaml" }]);

		expect(resolution.resolved).toMatch(/dist\/js-yaml\.mjs$/);
	});

	it("only default-imports packages that export a default binding from each production consumer", async () => {
		const unsupportedDefaultImports = [];
		const resolutions = resolveFromProductionConsumers(await collectPackageDefaultImports());

		for (const resolution of resolutions) {
			try {
				const namespace = await import(resolution.resolved);
				if (!Object.hasOwn(namespace, "default")) {
					unsupportedDefaultImports.push(
						`${resolution.specifier} (${resolution.consumerPath}:${resolution.line})`,
					);
				}
			} catch (error) {
				unsupportedDefaultImports.push(
					`${resolution.specifier} (${resolution.consumerPath}:${resolution.line}): ${error.message}`,
				);
			}
		}

		expect(unsupportedDefaultImports).toEqual([]);
	});
});
