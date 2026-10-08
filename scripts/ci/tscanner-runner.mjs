import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const forbiddenAuthVariables = [
	"OPENAI_API_KEY",
	"CODEX_API_KEY",
	"CODEX_ACCESS_TOKEN",
	"CODEX_REFRESH_TOKEN",
	"OPENAI_BASE_URL",
	"OPENAI_API_BASE",
	"CODEX_API_PROXY_BASE_URL",
	"CODEX_BASE_URL",
	"CHATGPT_BASE_URL",
	"AZURE_OPENAI_API_KEY",
];
const refusal =
	"AI scans are local opt-in operations and cannot run in CI without the explicitly enabled trusted ShieldPM self-hosted runner.";

function privateOwnedFile(stat, directory = false) {
	return (
		(directory ? stat.isDirectory() : stat.isFile()) &&
		(stat.mode & 0o077) === 0 &&
		typeof process.getuid === "function" &&
		stat.uid === process.getuid()
	);
}

export function assertNoSystemCodexConfig(paths = ["/etc/codex/config.toml", "/etc/codex/managed_config.toml"]) {
	for (const file of paths) {
		try {
			fs.lstatSync(file);
		} catch (error) {
			if (error.code === "ENOENT") continue;
		}
		throw new Error("The dedicated subscription runner must not load system Codex configuration.");
	}
}

// Only filesystem tests inject system paths; executable entrypoints always check the fixed system defaults.
export function assertTrustedAiRunner(environment = process.env, root = workspaceRoot, systemConfigPaths) {
	if (
		environment.CI !== "true" ||
		environment.GITHUB_ACTIONS !== "true" ||
		environment.RUNNER_ENVIRONMENT !== "self-hosted" ||
		environment.RUNNER_OS !== "Linux" ||
		environment.GITHUB_REPOSITORY !== "shedowe19/ShieldPM" ||
		environment.GITHUB_REF !== "refs/heads/develop" ||
		environment.GITHUB_ACTOR !== "shedowe19" ||
		!["push", "workflow_dispatch"].includes(environment.GITHUB_EVENT_NAME) ||
		environment.SHIELDPM_CODEX_RUNNER_ENABLED !== "true" ||
		environment.SHIELDPM_TSCANNER_RUNNER_AI !== "chatgpt"
	) {
		throw new Error(refusal);
	}
	if (forbiddenAuthVariables.some((name) => environment[name]?.trim())) {
		throw new Error("The subscription runner cannot use API keys, bearer tokens, or API endpoint overrides.");
	}
	assertNoSystemCodexConfig(systemConfigPaths);
	try {
		const configuration = JSON.parse(fs.readFileSync(path.join(root, ".tscanner/config.jsonc"), "utf8"));
		const enabledRules = Object.values(configuration.aiRules ?? {}).filter((rule) => rule.enabled !== false);
		if (
			configuration.ai?.provider !== "custom" ||
			configuration.ai?.command !== "./.tscanner/providers/codex" ||
			!enabledRules.length ||
			enabledRules.some((rule) => rule.mode !== "agentic")
		) {
			throw new Error("Invalid subscription scanner configuration.");
		}
		let directory = fs.realpathSync(root);
		while (true) {
			if (fs.existsSync(path.join(directory, ".codex/config.toml"))) {
				throw new Error("Project Codex configuration is not allowed on the subscription runner.");
			}
			const parent = path.dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	} catch {
		throw new Error(
			"Runner scans require the Codex custom provider, agentic rules, and no project Codex configuration.",
		);
	}
	const codexHome = environment.CODEX_HOME;
	if (!codexHome || !path.isAbsolute(codexHome)) {
		throw new Error("CODEX_HOME must be an absolute private runner directory outside the checkout.");
	}
	let descriptor;
	try {
		const actualHome = fs.realpathSync(codexHome);
		const actualRoot = fs.realpathSync(root);
		const relative = path.relative(actualRoot, actualHome);
		if (
			actualHome !== path.resolve(codexHome) ||
			!relative ||
			(!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) ||
			!privateOwnedFile(fs.lstatSync(codexHome), true)
		) {
			throw new Error("Invalid private authentication directory.");
		}
		const authPath = path.join(actualHome, "auth.json");
		if (!privateOwnedFile(fs.lstatSync(authPath))) throw new Error("Invalid authentication file.");
		descriptor = fs.openSync(authPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
		const stat = fs.fstatSync(descriptor);
		if (!privateOwnedFile(stat) || stat.size < 1 || stat.size > 64 * 1024) {
			throw new Error("Invalid authentication file.");
		}
		const authentication = JSON.parse(fs.readFileSync(descriptor, "utf8"));
		if (
			authentication.auth_mode !== "chatgpt" ||
			(authentication.OPENAI_API_KEY !== undefined && authentication.OPENAI_API_KEY !== null) ||
			!["id_token", "access_token", "refresh_token"].every(
				(name) => typeof authentication.tokens?.[name] === "string" && authentication.tokens[name].trim(),
			)
		) {
			throw new Error("Missing ChatGPT subscription authentication.");
		}
		return actualHome;
	} catch {
		throw new Error(
			"Runner authentication must be a private, runner-owned ChatGPT auth.json outside the checkout. Log in as the runner user.",
		);
	} finally {
		if (descriptor !== undefined) fs.closeSync(descriptor);
	}
}

export function verifyTrustedAiRunner(environment = process.env, root = workspaceRoot) {
	assertTrustedAiRunner(environment, root);
	const executable = environment.SHIELDPM_TSCANNER_CODEX_CLI || "codex";
	if (/[\0\r\n]/.test(executable)) throw new Error("The runner Codex executable is invalid.");
	const result = spawnSync(
		executable,
		[
			"--config",
			'forced_login_method="chatgpt"',
			"--config",
			'model_provider="openai"',
			"--config",
			'cli_auth_credentials_store="file"',
			"login",
			"status",
		],
		{ cwd: root, env: environment, stdio: "ignore", timeout: 15_000 },
	);
	if (result.error || result.signal || result.status !== 0) {
		throw new Error("Codex CLI subscription login is unavailable. Install and log in as the runner user.");
	}
	const sandbox = spawnSync(
		process.execPath,
		[path.join(root, ".tscanner/providers/codex.mjs"), "--verify-runner-sandbox"],
		{ cwd: root, env: environment, stdio: "ignore", timeout: 15_000 },
	);
	if (sandbox.error || sandbox.signal || sandbox.status !== 0) {
		throw new Error(
			"The runner Codex sandbox must deny access to subscription credentials. Check the CLI and host setup.",
		);
	}
	process.stdout.write("Trusted self-hosted runner and ChatGPT subscription login verified.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		if (process.argv.length !== 2) throw new Error("The runner preflight does not accept arguments.");
		verifyTrustedAiRunner();
	} catch (error) {
		process.stderr.write(`TScanner runner preflight failed: ${error.message}\n`);
		process.exitCode = 1;
	}
}
