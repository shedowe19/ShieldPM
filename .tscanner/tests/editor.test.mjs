import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { configureEditor } from "../scripts/editor.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

function fixture(context, platform = "linux", arch = "x64") {
	const root = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-editor-"));
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const project = path.join(root, ".tscanner");
	const directory = path.join(project, "node_modules/@tscanner", `cli-${platform}-${arch}`);
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(path.join(project, "package.json"), '{"private":true}');
	const executable = platform === "win32" ? "tscanner.exe" : "tscanner";
	fs.writeFileSync(
		path.join(directory, "package.json"),
		JSON.stringify({ name: `@tscanner/cli-${platform}-${arch}` }),
	);
	const binary = path.join(directory, executable);
	fs.writeFileSync(binary, "", { mode: 0o640 });
	const vscode = path.join(root, ".vscode");
	fs.mkdirSync(vscode);
	return { root, binary, vscode, settings: path.join(vscode, "settings.json") };
}

test("editor setup preserves JSONC comments, trailing commas, unrelated settings and permissions", (context) => {
	const env = fixture(context);
	const source =
		'// Local preferences\r\n{\r\n  // Keep these settings\r\n  "editor.fontSize": 15,\r\n' +
		'  "custom": { "enabled": true, "items": ["value", -1, null,], },\r\n}\r\n';
	fs.writeFileSync(env.settings, source, { mode: 0o640 });
	const native = configureEditor({ root: env.root });
	const actual = fs.readFileSync(env.settings, "utf8");
	assert.equal(actual.replace(`\r\n  "tscanner.lsp.bin": ${JSON.stringify(native)},`, ""), source);
	assert.equal(fs.statSync(env.settings).mode & 0o777, 0o640);
	assert.equal(fs.statSync(env.binary).mode & 0o111, 0o111);
	assert.deepEqual(fs.readdirSync(env.vscode), ["settings.json"]);
});

test("editor setup replaces only the existing value and is idempotent", (context) => {
	const env = fixture(context);
	const source = '{\n "editor.wordWrap": "on",\n "tscanner.lsp.bin" /* keep */: "old/path", // retained\n}\n';
	fs.writeFileSync(env.settings, source);
	const native = configureEditor({ root: env.root });
	const expected = source.replace('"old/path"', JSON.stringify(native));
	assert.equal(fs.readFileSync(env.settings, "utf8"), expected);
	const before = fs.statSync(env.settings);
	assert.equal(configureEditor({ root: env.root }), native);
	assert.equal(fs.readFileSync(env.settings, "utf8"), expected);
	assert.equal(fs.statSync(env.settings).mtimeMs, before.mtimeMs);
});

test("missing settings create one private repository-relative binary setting", (context) => {
	const env = fixture(context);
	const native = configureEditor({ root: env.root });
	assert.deepEqual(JSON.parse(fs.readFileSync(env.settings, "utf8")), { "tscanner.lsp.bin": native });
	assert.equal(native, ".tscanner/node_modules/@tscanner/cli-linux-x64/tscanner");
	assert.equal(fs.statSync(env.settings).mode & 0o777, 0o600);
});

test("corrupt or non-JSON settings fail without overwriting or revealing their contents", (context) => {
	const env = fixture(context);
	for (const source of [
		'{"secret":"private-value",',
		"[]",
		'{"secret": callProvider()}',
		'{"secret": undefined}',
		"{'secret':'private-value'}",
		'{"items":[,]}',
		'({"secret":"private-value"})',
	]) {
		fs.writeFileSync(env.settings, source);
		assert.throws(
			() => configureEditor({ root: env.root }),
			(error) => {
				assert.match(error.message, /valid JSONC object/);
				assert.doesNotMatch(error.message, /private-value|callProvider/);
				return true;
			},
		);
		assert.equal(fs.readFileSync(env.settings, "utf8"), source);
	}
});

test("duplicate target keys, including escaped keys, are rejected without overwriting", (context) => {
	const env = fixture(context);
	const source = '{"tscanner.lsp.bin":"one","\\u0074scanner.lsp.bin":"two"}';
	fs.writeFileSync(env.settings, source);
	assert.throws(() => configureEditor({ root: env.root }), /duplicate tscanner/);
	assert.equal(fs.readFileSync(env.settings, "utf8"), source);
});

test("symbolic settings files and editor directories are rejected", (context) => {
	const env = fixture(context);
	const outside = path.join(env.root, "other.json");
	fs.writeFileSync(outside, '{"preserve":true}');
	fs.symlinkSync(outside, env.settings);
	assert.throws(() => configureEditor({ root: env.root }), /symbolic link/);
	assert.equal(fs.readFileSync(outside, "utf8"), '{"preserve":true}');
	fs.unlinkSync(env.settings);
	fs.rmdirSync(env.vscode);
	const directory = path.join(env.root, "other-directory");
	fs.mkdirSync(directory);
	fs.symlinkSync(directory, env.vscode, "dir");
	assert.throws(() => configureEditor({ root: env.root }), /symbolic link/);
	assert.deepEqual(fs.readdirSync(directory), []);
});

for (const [platform, arch] of [
	["linux", "x64"],
	["linux", "arm64"],
	["darwin", "x64"],
	["darwin", "arm64"],
	["win32", "x64"],
]) {
	test(`editor resolves the supported ${platform}/${arch} native package`, (context) => {
		const env = fixture(context, platform, arch);
		const native = configureEditor({ root: env.root, platform, arch });
		assert.equal(
			native,
			`.tscanner/node_modules/@tscanner/cli-${platform}-${arch}/` +
				(platform === "win32" ? "tscanner.exe" : "tscanner"),
		);
	});
}

test("unsupported platforms and missing binaries do not create settings", (context) => {
	const env = fixture(context);
	assert.throws(() => configureEditor({ root: env.root, platform: "win32", arch: "arm64" }), /Unsupported/);
	fs.unlinkSync(env.binary);
	assert.throws(() => configureEditor({ root: env.root }), /binary is missing/);
	assert.equal(fs.existsSync(env.settings), false);
});

test("editor setup makes a fresh real native scanner executable with its pinned version", (context) => {
	const env = fixture(context, process.platform, process.arch);
	const binary = path.join(
		repositoryRoot,
		".tscanner/node_modules/@tscanner",
		`cli-${process.platform}-${process.arch}`,
		process.platform === "win32" ? "tscanner.exe" : "tscanner",
	);
	fs.copyFileSync(binary, env.binary);
	if (process.platform !== "win32") {
		fs.chmodSync(env.binary, 0o640);
		assert.equal(fs.statSync(env.binary).mode & 0o111, 0);
	}
	const native = configureEditor({ root: env.root });
	const result = spawnSync(path.join(env.root, native), ["--version"], { encoding: "utf8", timeout: 10000 });
	assert.equal(result.status, 0, result.error?.message ?? result.stderr);
	assert.match(result.stdout, /^tscanner 0\.1\.3\s*$/);
});
