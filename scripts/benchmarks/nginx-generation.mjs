import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Use the same Node runtime/dependencies as the backend. Results are JSON lines
// prefixed NGINX_BENCHMARK; ordinary tests never execute this opt-in workload.
const backend = fileURLToPath(new URL("../../backend/", import.meta.url));
const vitest = fileURLToPath(
	new URL("../../backend/node_modules/vitest/vitest.mjs", import.meta.url),
);
const result = spawnSync(
	process.execPath,
	[
		vitest,
		"run",
		"test/benchmarks/nginx-generation.spec.js",
		"--maxWorkers=2",
		"--disableConsoleIntercept",
	],
	{
		cwd: backend,
		env: { ...process.env, SHIELDPM_NGINX_BENCHMARK: "true" },
		stdio: "inherit",
	},
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
