import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseExpression } from "@babel/parser";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const settingName = "tscanner.lsp.bin";
const supported = new Set(["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"]);

function statFile(filename) {
	try {
		return fs.lstatSync(filename);
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}

function settingsObject(source) {
	try {
		const object = parseExpression(source);
		const check = (node) => {
			if (!node) throw new Error();
			if (node.type === "ObjectExpression") {
				for (const property of node.properties) {
					if (
						property.type !== "ObjectProperty" ||
						property.computed ||
						property.shorthand ||
						property.key.type !== "StringLiteral"
					)
						throw new Error();
					check(property.key);
					check(property.value);
				}
			} else if (node.type === "ArrayExpression") {
				for (const element of node.elements) check(element);
			} else if (
				["StringLiteral", "NumericLiteral", "BooleanLiteral", "NullLiteral"].includes(node.type) ||
				(node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral")
			) {
				JSON.parse(source.slice(node.start, node.end));
			} else {
				throw new Error();
			}
		};
		if (object.type !== "ObjectExpression" || object.extra?.parenthesized) throw new Error();
		check(object);
		return object;
	} catch {
		throw new Error("VS Code settings must be a valid JSONC object; the file was not changed.");
	}
}

/** Configure the installed native scanner without changing unrelated local editor settings. */
export function configureEditor({ root = repositoryRoot, platform = process.platform, arch = process.arch } = {}) {
	const resolvedRoot = path.resolve(root);
	const target = `${platform}-${arch}`;
	if (!supported.has(target)) throw new Error(`Unsupported TScanner platform: ${target}`);
	const require = createRequire(path.join(resolvedRoot, ".tscanner/package.json"));
	let binary;
	try {
		const manifest = require.resolve(`@tscanner/cli-${target}/package.json`);
		binary = path.join(path.dirname(manifest), platform === "win32" ? "tscanner.exe" : "tscanner");
	} catch {
		throw new Error("TScanner native dependencies are missing; install the .tscanner project first.");
	}
	const binaryStat = statFile(binary);
	if (!binaryStat?.isFile())
		throw new Error("The installed TScanner native binary is missing or not a regular file.");
	const relativeBinary = path.relative(resolvedRoot, binary).replaceAll("\\", "/");
	if (relativeBinary.startsWith("../") || path.isAbsolute(relativeBinary))
		throw new Error("The TScanner native binary must be inside the repository.");
	const directory = path.join(resolvedRoot, ".vscode");
	const directoryStat = statFile(directory);
	if (directoryStat && !directoryStat.isDirectory())
		throw new Error("The .vscode directory must be a real directory, not a symbolic link.");
	const filename = path.join(directory, "settings.json");
	const originalStat = statFile(filename);
	if (originalStat && !originalStat.isFile())
		throw new Error("VS Code settings must be a regular file, not a symbolic link.");
	const source = originalStat ? fs.readFileSync(filename, "utf8") : "{}\n";
	const object = settingsObject(source);
	const matches = object.properties.filter((property) => property.key.value === settingName);
	if (matches.length > 1)
		throw new Error("VS Code settings contain duplicate tscanner.lsp.bin keys; the file was not changed.");
	const value = JSON.stringify(relativeBinary);
	let updated;
	if (matches.length) {
		const previous = matches[0].value;
		updated = source.slice(0, previous.start) + value + source.slice(previous.end);
	} else {
		const newline = source.includes("\r\n") ? "\r\n" : "\n";
		const first = object.properties[0];
		const indentation = first ? source.slice(source.lastIndexOf("\n", first.start) + 1, first.start) : "\t";
		const indent = /^[\t ]+$/.test(indentation) ? indentation : "\t";
		const offset = object.start + 1;
		const tail = source.slice(offset);
		const separator = tail.startsWith("\n") || tail.startsWith("\r\n") ? "" : newline;
		updated =
			source.slice(0, offset) +
			newline +
			indent +
			JSON.stringify(settingName) +
			": " +
			value +
			(object.properties.length ? "," : "") +
			separator +
			tail;
	}
	settingsObject(updated);
	if (platform !== "win32") fs.chmodSync(binary, (binaryStat.mode & 0o777) | 0o111);
	if (updated === source) return relativeBinary;
	fs.mkdirSync(directory, { recursive: true });
	const temporary = path.join(directory, `.settings-${randomUUID()}.tmp`);
	const mode = originalStat ? originalStat.mode & 0o777 : 0o600;
	try {
		fs.writeFileSync(temporary, updated, { flag: "wx", mode });
		fs.chmodSync(temporary, mode);
		if (statFile(filename)?.isSymbolicLink()) throw new Error("VS Code settings cannot be a symbolic link.");
		fs.renameSync(temporary, filename);
	} finally {
		fs.rmSync(temporary, { force: true });
	}
	return relativeBinary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		process.stdout.write(`${configureEditor()}\n`);
	} catch (error) {
		process.stderr.write(`TScanner editor setup failed: ${error.message}\n`);
		process.exitCode = 1;
	}
}
