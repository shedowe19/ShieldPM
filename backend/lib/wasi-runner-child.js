/** Fixed execution process for administrator-trusted WASI Preview 1 commands. */
import { WASI } from "node:wasi";

process.once("message", async (message) => {
	const input = /** @type {{bytes: Uint8Array, args: string[], env: {name: string, value: string}[]}} */ (message);
	let result = { status: "failed", exit_code: null };
	try {
		const wasi = new WASI({
			version: "preview1",
			args: ["application.wasm", ...input.args],
			env: Object.fromEntries(input.env.map(({ name, value }) => [name, value])),
			preopens: {},
			returnOnExit: true,
			stdin: 0,
			stdout: 1,
			stderr: 2,
		});
		// The administrator selected these bytes. No JavaScript, arbitrary child file or host imports are accepted.
		const module = await WebAssembly.compile(new Uint8Array(input.bytes));
		const instance = await WebAssembly.instantiate(
			module,
			/** @type {WebAssembly.Imports} */ (wasi.getImportObject()),
		);
		// The Preview 1 exit code is u32; Node may expose its high bit as a signed JavaScript integer.
		const exitCode = wasi.start(instance) >>> 0;
		result = { status: exitCode === 0 ? "completed" : "failed", exit_code: exitCode };
	} catch {
		// Engine errors may contain module-controlled names or data; never expose them through the control channel.
	}
	process.send?.(result, () => process.disconnect());
});
