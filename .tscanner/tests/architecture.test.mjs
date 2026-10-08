import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspect } from "../script-rules/architecture.mjs";

const script = fileURLToPath(new URL("../script-rules/architecture.mjs", import.meta.url));

function scan(policy, content, filename = "backend/internal/example.js") {
	return inspect({ files: [{ path: filename, content }], options: { policy } }).issues;
}

test("backend ESM rule reports real calls and exports with one-based locations", () => {
	const issues = scan("backend-esm", '\nrequire("legacy");\nmodule.exports = {};\nexports.answer = 42;');
	assert.equal(issues.length, 3);
	assert.deepEqual(
		issues.map(({ line, column }) => ({ line, column })),
		[
			{ line: 2, column: 1 },
			{ line: 3, column: 1 },
			{ line: 4, column: 1 },
		],
	);
	assert.ok(issues.every((issue) => issue.file === "backend/internal/example.js"));
});

test("backend ESM rule sees computed and nested exports", () => {
	assert.equal(
		scan("backend-esm", 'module["exports"][key] = true; exports[key] = true; globalThis.require("legacy");').length,
		3,
	);
});

test("backend ESM rule ignores comments, strings and lexically shadowed objects", () => {
	assert.deepEqual(
		scan(
			"backend-esm",
			`// require("legacy"); module.exports = {};
const example = 'exports.answer = 42';
function local(require, module, exports, globalThis) {
	require("injected"); module.exports = {}; exports.answer = 42; globalThis.require("injected");
}
export default local;`,
		),
		[],
	);
});

test("ESM imports, createRequire adapters and import attributes parse without violations", () => {
	assert.deepEqual(
		scan(
			"backend-esm",
			`import { createRequire } from "node:module";
import schema from "./schema.json" with { type: "json" };
const requireFromPackage = createRequire(import.meta.url);
const packageMetadata = requireFromPackage("./package.json");
export { schema, packageMetadata };`,
		),
		[],
	);
});

test("TypeScript import-equals assignments are CommonJS violations", () => {
	assert.equal(scan("backend-esm", 'import legacy = require("legacy");', "backend/internal/example.ts").length, 1);
});

test("CommonJS entry points and test fixtures are outside backend ESM scope", () => {
	for (const filename of [
		"backend/validate-env.cjs",
		"backend/test/example.js",
		"backend/internal/example.test.js",
		"frontend/src/example.ts",
	]) {
		assert.deepEqual(scan("backend-esm", 'require("legacy"); module.exports = {};', filename), []);
	}
});

test("structured errors rule reports directly thrown global Error constructors", () => {
	const issues = scan(
		"structured-backend-errors",
		'throw new Error("bad"); throw new TypeError("bad"); throw new globalThis.RangeError("bad");',
	);
	assert.equal(issues.length, 3);
	assert.match(issues[0].message, /raw Error/);
	assert.match(issues[1].message, /raw TypeError/);
	assert.match(issues[2].message, /raw RangeError/);
});

test("structured errors rule preserves delegated errors, errs factories and shadowed constructors", () => {
	assert.deepEqual(
		scan(
			"structured-backend-errors",
			`import errs from "../lib/error.js";
const error = new Error("not thrown here");
function raise(Error, globalThis) { throw new Error("custom"); throw new globalThis.Error("custom"); }
throw new errs.ValidationError("bad");
throw error;`,
		),
		[],
	);
});

test("structured errors scope is production services and routes, excluding migrations and tests", () => {
	assert.equal(scan("structured-backend-errors", 'throw new Error("bad");', "backend/routes/example.js").length, 1);
	for (const filename of [
		"backend/lib/error.js",
		"backend/migrations/20260101000000_example.js",
		"backend/internal/example.spec.ts",
	]) {
		assert.deepEqual(scan("structured-backend-errors", 'throw new Error("bad");', filename), []);
	}
});

test("component API rule detects fetch through unbound browser globals", () => {
	const content = 'fetch("/api"); window.fetch("/api"); globalThis["fetch"]?.("/api"); self.fetch("/api");';
	assert.equal(scan("component-api-hooks", content, "frontend/src/pages/Example.tsx").length, 4);
});

test("component API rule detects imported Axios functions and aliases", () => {
	const content = `import client from "axios";
import { get as request } from "axios";
client.get("/api"); client({ url: "/api" }); request("/api");`;
	assert.equal(scan("component-api-hooks", content, "frontend/src/components/Example.tsx").length, 3);
});

test("component API rule does not mistake injected functions and unrelated objects for network calls", () => {
	const content = `function local(fetch, window, globalThis, axios) {
	fetch("local"); window.fetch("local"); globalThis.fetch("local"); axios.get("local");
}
const client = { get() {} }; client.get("local");`;
	assert.deepEqual(scan("component-api-hooks", content, "frontend/src/modals/Example.tsx"), []);
});

test("component API rule allows the existing immutable getHelpFile Markdown asset request", () => {
	const content = `import { getHelpFile as asset } from "src/locale/HelpDoc";
const docFile = asset(lang, section);
fetch(docFile); fetch(asset(lang, section));`;
	assert.deepEqual(scan("component-api-hooks", content, "frontend/src/modals/HelpContent.tsx"), []);
});

test("help asset exception does not allow API requests, write options or requests in other files", () => {
	const content = `import { getHelpFile } from "src/locale/HelpDoc";
const docFile = getHelpFile(lang, section);
fetch("/api"); fetch(docFile, { method: "POST" });`;
	assert.equal(scan("component-api-hooks", content, "frontend/src/modals/HelpContent.tsx").length, 2);
	assert.equal(scan("component-api-hooks", content, "frontend/src/modals/OtherHelp.tsx").length, 2);
});

test("help asset exception requires the trusted import and an immutable value", () => {
	for (const content of [
		'import { getHelpFile } from "untrusted"; const docFile = getHelpFile(); fetch(docFile);',
		'function getHelpFile() { return "/api"; } const docFile = getHelpFile(); fetch(docFile);',
		'import { getHelpFile } from "src/locale/HelpDoc"; let docFile = getHelpFile(); fetch(docFile);',
		'import { getHelpFile } from "src/locale/HelpDoc"; const docFile = getHelpFile(); docFile = "/api"; fetch(docFile);',
		"const docFile = docFile; fetch(docFile);",
	]) {
		assert.equal(scan("component-api-hooks", content, "frontend/src/modals/HelpContent.tsx").length, 1);
	}
});

test("network clients outside UI components remain allowed", () => {
	for (const filename of [
		"frontend/src/api/backend/base.ts",
		"frontend/src/hooks/useExample.ts",
		"frontend/src/pages/Example.test.tsx",
	]) {
		assert.deepEqual(scan("component-api-hooks", 'fetch("/api");', filename), []);
	}
});

test("modern TSX and shadowed typed functions parse correctly", () => {
	const content = `interface Props { label: string }
export function Example({ label }: Props) {
	const fetch = (value: string) => value;
	return <p>{fetch(label)}</p>;
}`;
	assert.deepEqual(scan("component-api-hooks", content, "frontend/src/components/Example.tsx"), []);
});

test("Nginx rule detects imported child process methods including aliases", () => {
	const content = `import { execFile as run, spawnSync } from "node:child_process";
import process from "child_process";
run("nginx", ["-s", "reload"]);
spawnSync("/usr/sbin/nginx", ["-sreload"]);
process.execFileSync("nginx", ["-c", "/data/nginx.conf", "-s", "reload"]);`;
	assert.equal(scan("centralized-nginx-reload", content).length, 3);
});

test("Nginx rule detects project utility calls and simple quoted shell commands", () => {
	const content = `import utils from "../lib/utils.js";
import { exec } from "node:child_process";
utils.execFile("nginx", ["-s", "reload"]);
utils.exec("nginx -s reload");
exec('"/usr/sbin/nginx" "-s" reload');`;
	assert.equal(scan("centralized-nginx-reload", content).length, 3);
});

test("Nginx rule allows central reloads and does not classify syntax checks, stops, strings or dynamic arguments", () => {
	const content = `import { execFile, exec } from "node:child_process";
execFile("nginx", ["-s", "reload"]);`;
	assert.deepEqual(scan("centralized-nginx-reload", content, "backend/internal/nginx.js"), []);
	assert.deepEqual(
		scan(
			"centralized-nginx-reload",
			`import { execFile, exec } from "node:child_process";
execFile("nginx", ["-tq"]);
execFile("nginx", ["-s", "stop"]);
execFile("nginx", ["-s", action]);
exec("echo nginx -s reload");
exec("nginx\\n-s reload");
const example = "nginx -s reload";
function local(execFile) { execFile("nginx", ["-s", "reload"]); }`,
		),
		[],
	);
});

test("Nginx rule ignores similarly named methods from unrelated modules", () => {
	const content = `import utils from "../other/utils.js";
import { execFile } from "unrelated";
utils.execFile("nginx", ["-s", "reload"]);
execFile("nginx", ["-s", "reload"]);`;
	assert.deepEqual(scan("centralized-nginx-reload", content), []);
});

test("scanner path normalization accepts repository paths and rejects traversal", () => {
	const content = 'require("legacy");';
	assert.equal(
		scan("backend-esm", content, ".\\backend\\internal\\example.js")[0].file,
		"backend/internal/example.js",
	);
	assert.equal(
		inspect({
			files: [{ path: "/repo/backend/internal/example.js", content }],
			workspaceRoot: "/repo",
			options: { policy: "backend-esm" },
		}).issues.length,
		1,
	);
	assert.throws(() => scan("backend-esm", content, "../backend/internal/example.js"), /inside workspaceRoot/);
	assert.throws(() => scan("backend-esm", content, "/repo/backend/internal/example.js"), /need workspaceRoot/);
	assert.throws(
		() =>
			inspect({
				files: [{ path: "/other/backend/internal/example.js", content }],
				workspaceRoot: "/repo",
				options: { policy: "backend-esm" },
			}),
		/inside workspaceRoot/,
	);
	assert.throws(
		() =>
			inspect({
				files: [{ path: "/repo/../other/backend/internal/example.js", content }],
				workspaceRoot: "/repo",
				options: { policy: "backend-esm" },
			}),
		/inside workspaceRoot/,
	);
});

test("invalid configuration, input and production syntax fail closed", () => {
	assert.throws(() => inspect({ files: [], options: { policy: "unknown" } }), /Unknown/);
	assert.throws(() => inspect({ options: { policy: "backend-esm" } }), /files array/);
	assert.throws(
		() => inspect({ files: [{ path: "backend/app.js" }], options: { policy: "backend-esm" } }),
		/path and content/,
	);
	assert.throws(() => scan("backend-esm", "const = ;"), /Could not parse backend\/internal\/example.js/);
});

test("stdin protocol emits only the expected JSON issue fields", () => {
	const input = {
		files: [{ path: "backend/app.js", content: 'require("legacy");', lines: ['require("legacy");'] }],
		options: { policy: "backend-esm" },
		workspaceRoot: "/repo",
	};
	const result = spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");
	const output = JSON.parse(result.stdout);
	assert.equal(output.issues.length, 1);
	assert.deepEqual(Object.keys(output.issues[0]).sort(), ["column", "file", "line", "message"]);
});

test("malformed stdin and syntax errors exit nonzero instead of emitting clean scan output", () => {
	for (const input of [
		"not json",
		JSON.stringify({
			files: [{ path: "backend/app.js", content: "const = ;" }],
			options: { policy: "backend-esm" },
		}),
	]) {
		const result = spawnSync(process.execPath, [script], { input, encoding: "utf8" });
		assert.equal(result.status, 1);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /architecture rule failed/);
	}
});
