import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

export const policies = Object.freeze([
	"backend-esm",
	"structured-backend-errors",
	"component-api-hooks",
	"centralized-nginx-reload",
]);

const sourceExtension = /\.(?:[cm]?js|jsx|ts|tsx)$/;
const testPath = /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/;
const processModules = new Set(["node:child_process", "child_process"]);
const processMethods = new Set(["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync"]);
const rawErrors = new Set(["Error", "TypeError", "RangeError"]);
const globalObjects = new Set(["globalThis", "global", "window", "self"]);

function normalizeFile(file, workspaceRoot) {
	const filename = path.posix.normalize(file.replaceAll("\\", "/"));
	if (path.posix.isAbsolute(filename)) {
		if (typeof workspaceRoot !== "string") throw new TypeError("Absolute file paths need workspaceRoot");
		const root = path.resolve(workspaceRoot).replaceAll("\\", "/");
		if (!filename.startsWith(`${root}/`)) throw new TypeError("Scanner file must be inside workspaceRoot");
		return path.posix.normalize(filename.slice(root.length + 1));
	}
	const relative = path.posix.normalize(filename);
	if (relative === ".." || relative.startsWith("../"))
		throw new TypeError("Scanner file must be inside workspaceRoot");
	return relative;
}

function inScope(policy, filename) {
	if (!sourceExtension.test(filename) || testPath.test(filename)) return false;
	if (policy === "component-api-hooks") return /^frontend\/src\/(?:components|modals|pages)\//.test(filename);
	if (policy === "structured-backend-errors") return /^backend\/(?:internal|routes)\//.test(filename);
	return filename.startsWith("backend/") && !filename.endsWith(".cjs");
}

function unwrap(node) {
	while (
		node &&
		[
			"TSAsExpression",
			"TSSatisfiesExpression",
			"TSNonNullExpression",
			"TypeCastExpression",
			"ParenthesizedExpression",
		].includes(node.type)
	) {
		node = node.expression;
	}
	return node;
}

function memberName(node) {
	node = unwrap(node);
	if (!node || !["MemberExpression", "OptionalMemberExpression"].includes(node.type)) return null;
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (node.computed && node.property.type === "StringLiteral") return node.property.value;
	return null;
}

function isUnbound(scope, node, name) {
	node = unwrap(node);
	return node?.type === "Identifier" && node.name === name && !scope.getBinding(name);
}

function globalReference(scope, node, name) {
	node = unwrap(node);
	if (isUnbound(scope, node, name)) return true;
	return (
		memberName(node) === name &&
		globalObjects.has(unwrap(node.object)?.name) &&
		isUnbound(scope, node.object, unwrap(node.object).name)
	);
}

function commonJsExport(scope, node) {
	node = unwrap(node);
	if (isUnbound(scope, node, "exports")) return true;
	if (!node || !["MemberExpression", "OptionalMemberExpression"].includes(node.type)) return false;
	if (memberName(node) === "exports" && isUnbound(scope, node.object, "module")) return true;
	return commonJsExport(scope, node.object);
}

function importBinding(scope, node) {
	node = unwrap(node);
	if (node?.type !== "Identifier") return null;
	const binding = scope.getBinding(node.name);
	if (!binding?.constant) return null;
	const specifier = binding.path.node;
	if (!["ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(specifier.type))
		return null;
	if (specifier.importKind === "type" || binding.path.parent.importKind === "type") return null;
	const source = binding.path.parent.source?.value;
	if (typeof source !== "string") return null;
	return {
		source,
		kind: specifier.type,
		imported: specifier.type === "ImportSpecifier" ? (specifier.imported.name ?? specifier.imported.value) : null,
	};
}

function axiosReference(scope, node) {
	node = unwrap(node);
	if (globalReference(scope, node, "axios")) return true;
	const imported = importBinding(scope, node);
	if (imported?.source === "axios" && imported.kind !== "ImportNamespaceSpecifier") return true;
	if (!memberName(node)) return false;
	const object = unwrap(node.object);
	const objectImport = importBinding(scope, object);
	return objectImport?.source === "axios" || globalReference(scope, object, "axios");
}

function helpAsset(scope, node, visited = new Set()) {
	node = unwrap(node);
	if (node?.type === "Identifier") {
		const binding = scope.getBinding(node.name);
		if (!binding?.constant || binding.kind !== "const" || !binding.path.isVariableDeclarator()) return false;
		if (visited.has(binding)) return false;
		visited.add(binding);
		return helpAsset(binding.path.scope, binding.path.node.init, visited);
	}
	if (node?.type !== "CallExpression") return false;
	const imported = importBinding(scope, node.callee);
	return (
		imported?.imported === "getHelpFile" &&
		["src/locale/HelpDoc", "@/locale/HelpDoc", "../locale/HelpDoc"].includes(imported.source.replace(/\.tsx?$/, ""))
	);
}

function processMethod(scope, callee) {
	callee = unwrap(callee);
	const imported = importBinding(scope, callee);
	if (imported && processModules.has(imported.source) && processMethods.has(imported.imported))
		return imported.imported;
	const method = memberName(callee);
	if (!processMethods.has(method)) return null;
	const objectImport = importBinding(scope, callee.object);
	if (!objectImport) return null;
	if (processModules.has(objectImport.source) && objectImport.kind !== "ImportSpecifier") return method;
	if (
		["exec", "execFile"].includes(method) &&
		objectImport.kind === "ImportDefaultSpecifier" &&
		/(?:^|\/)lib\/utils\.js$/.test(objectImport.source)
	) {
		return method;
	}
	return null;
}

function staticString(node) {
	node = unwrap(node);
	if (node?.type === "StringLiteral") return node.value;
	if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
	return null;
}

function reloadArguments(args) {
	return args.some((arg, index) => (arg === "-s" && args[index + 1] === "reload") || arg === "-sreload");
}

function simpleShellWords(command) {
	if (typeof command !== "string") return null;
	const words = [];
	let index = 0;
	while (index < command.length) {
		while (index < command.length && /\s/.test(command[index])) {
			if (/[\n\r]/.test(command[index])) return null;
			index += 1;
		}
		if (index === command.length) break;
		let word = "";
		let quote = null;
		while (index < command.length) {
			const character = command[index];
			if (!quote && /[\n\r]/.test(character)) return null;
			if (!quote && /\s/.test(character)) break;
			if (!quote && ["'", '"'].includes(character)) quote = character;
			else if (quote === character) quote = null;
			else if (character === "'" && quote === '"') word += character;
			else if (character === '"' && quote === "'") word += character;
			else if (quote === "'") word += character;
			else if (/[\\$`;&|<>()\n\r]/.test(character)) return null;
			else word += character;
			index += 1;
		}
		if (quote) return null;
		words.push(word);
	}
	return words;
}

function isNginxReload(scope, call) {
	const method = processMethod(scope, call.callee);
	if (!method) return false;
	if (method === "exec" || method === "execSync") {
		const words = simpleShellWords(staticString(call.arguments[0]));
		return words?.length > 0 && path.posix.basename(words[0]) === "nginx" && reloadArguments(words.slice(1));
	}
	const executable = staticString(call.arguments[0]);
	const argumentsNode = unwrap(call.arguments[1]);
	if (
		executable === null ||
		path.posix.basename(executable) !== "nginx" ||
		argumentsNode?.type !== "ArrayExpression"
	) {
		return false;
	}
	const args = argumentsNode.elements.map(staticString);
	return args.every((argument) => typeof argument === "string") && reloadArguments(args);
}

/** Inspect one configured policy using tscanner's stdin protocol. No file contents are read from disk. */
export function inspect(input) {
	if (!input || typeof input !== "object" || !Array.isArray(input.files)) throw new TypeError("Expected files array");
	const policy = input.options?.policy;
	if (!policies.includes(policy)) throw new TypeError("Unknown or missing architecture policy");
	const issues = [];
	for (const file of input.files) {
		if (!file || typeof file.path !== "string" || !file.path || typeof file.content !== "string") {
			throw new TypeError("Each scanner file needs a path and content");
		}
		const filename = normalizeFile(file.path, input.workspaceRoot);
		if (!inScope(policy, filename)) continue;
		const plugins = [];
		if (/\.tsx?$/.test(filename)) plugins.push("typescript");
		if (/\.[jt]sx$/.test(filename)) plugins.push("jsx");
		let ast;
		try {
			ast = parse(file.content, { sourceType: "unambiguous", plugins });
		} catch (error) {
			throw new SyntaxError(`Could not parse ${filename}: ${error.message}`);
		}
		const report = (node, message) => {
			issues.push({ file: filename, line: node.loc.start.line, column: node.loc.start.column + 1, message });
		};
		traverse(ast, {
			TSImportEqualsDeclaration(declaration) {
				if (policy === "backend-esm" && declaration.node.moduleReference.type === "TSExternalModuleReference") {
					report(declaration.node, "Use ESM imports instead of TypeScript CommonJS import assignments.");
				}
			},
			"CallExpression|OptionalCallExpression"(call) {
				const node = call.node;
				if (policy === "backend-esm" && globalReference(call.scope, node.callee, "require")) {
					report(node, "Use ESM imports instead of CommonJS require() in backend modules.");
				}
				if (policy === "component-api-hooks") {
					const fetchCall = globalReference(call.scope, node.callee, "fetch");
					if (!fetchCall && !axiosReference(call.scope, node.callee)) return;
					if (
						fetchCall &&
						filename === "frontend/src/modals/HelpContent.tsx" &&
						node.arguments.length === 1 &&
						helpAsset(call.scope, node.arguments[0])
					) {
						return;
					}
					report(node, "Put API requests in src/api and use React Query hooks in UI components.");
				}
				if (
					policy === "centralized-nginx-reload" &&
					filename !== "backend/internal/nginx.js" &&
					isNginxReload(call.scope, node)
				) {
					report(
						node,
						"Use internalNginx.reload() so Nginx reloads use centralized validation and serialization.",
					);
				}
			},
			AssignmentExpression(assignment) {
				if (policy === "backend-esm" && commonJsExport(assignment.scope, assignment.node.left)) {
					report(assignment.node, "Use ESM exports instead of CommonJS exports in backend modules.");
				}
			},
			ThrowStatement(statement) {
				if (policy !== "structured-backend-errors") return;
				const expression = unwrap(statement.node.argument);
				if (expression?.type !== "NewExpression") return;
				for (const name of rawErrors) {
					if (globalReference(statement.scope, expression.callee, name)) {
						report(
							statement.node,
							`Use the errs factory instead of throwing raw ${name} in backend services and routes.`,
						);
						break;
					}
				}
			},
		});
	}
	return { issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		process.stdout.write(`${JSON.stringify(inspect(JSON.parse(readFileSync(0, "utf8"))))}\n`);
	} catch (error) {
		process.stderr.write(`ShieldPM architecture rule failed: ${error.message}\n`);
		process.exitCode = 1;
	}
}
