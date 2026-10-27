import path from "node:path";

const invalid = () => new Error("Legacy generated host configuration requires regeneration before restore");
const dispatcher = /^(.+)\/wasm\/artifacts\/[a-f0-9]{64}\.lua$/;
const configuration = /^(.+)\/wasm\/hosts\/([1-9][0-9]*-[a-f0-9]{64}\.json)$/;
const quoted = '"([^"\\\\\\r\\n]+)"';
const localPath = new RegExp(`^local wasm_path = ${quoted}$`);
const packagePath = new RegExp(`^local wasm_dispatcher = package\\.loaded\\[${quoted}\\]$`);
const headerCall = new RegExp(`^if wasm_dispatcher then wasm_dispatcher\\.header_filter\\(${quoted}\\) end$`);
const accessCall = new RegExp(`^wasm_dispatcher\\.access\\(${quoted}\\)$`);
const safePath = (value) => path.posix.isAbsolute(value) && path.posix.normalize(value) === value;

/** Remove only the exact retired generated hooks; custom Lua and authorization stay intact. */
export function removeRetiredHostHooks(content) {
	if (content.includes("\0")) throw invalid();
	const newline = content.includes("\r\n") ? "\r\n" : "\n";
	const lines = content.split(/\r?\n/);
	const keep = lines.map(() => true);
	const policies = new Map();
	const normalized = (index) => lines[index]?.trim();
	for (let index = 0; index < lines.length; index++) {
		const marker = /^# ShieldPM Wasm configuration: ([1-9][0-9]*-[a-f0-9]{64}\.json)$/.exec(normalized(index));
		if (!marker) {
			if (normalized(index)?.startsWith("# ShieldPM Wasm configuration:")) throw invalid();
			continue;
		}
		let start = index + 1;
		while (start <= index + 3 && normalized(start) === "") start++;
		const modulePath = packagePath.exec(normalized(start + 2))?.[1];
		const configPath = headerCall.exec(normalized(start + 3))?.[1];
		const artifact = modulePath && dispatcher.exec(modulePath);
		const config = configPath && configuration.exec(configPath);
		if (
			!artifact ||
			!config ||
			!safePath(modulePath) ||
			!safePath(configPath) ||
			artifact[1] !== config[1] ||
			config[2] !== marker[1] ||
			!normalized(start)?.startsWith("# Trusted Wasm filters:") ||
			normalized(start + 1) !== "header_filter_by_lua_block {" ||
			normalized(start + 4) !== "}" ||
			normalized(start + 5) !== "body_filter_by_lua_block {" ||
			packagePath.exec(normalized(start + 6))?.[1] !== modulePath ||
			normalized(start + 7) !== "if wasm_dispatcher then wasm_dispatcher.body_filter() end" ||
			normalized(start + 8) !== "}"
		)
			throw invalid();
		for (let position = index; position <= start + 8; position++) keep[position] = false;
		if (normalized(index - 1) === "lua_check_client_abort on;") keep[index - 1] = false;
		const key = JSON.stringify([modulePath, configPath]);
		policies.set(key, (policies.get(key) || 0) + 1);
		index = start + 8;
	}
	for (let index = 0; index < lines.length; index++) {
		const modulePath = localPath.exec(normalized(index))?.[1];
		if (!modulePath || !dispatcher.test(modulePath)) continue;
		const configPath = accessCall.exec(normalized(index + 6))?.[1];
		const key = JSON.stringify([modulePath, configPath]);
		if (
			!policies.get(key) ||
			normalized(index + 1) !== "local wasm_dispatcher = package.loaded[wasm_path]" ||
			normalized(index + 2) !== "if not wasm_dispatcher then" ||
			normalized(index + 3) !== "wasm_dispatcher = dofile(wasm_path)" ||
			normalized(index + 4) !== "package.loaded[wasm_path] = wasm_dispatcher" ||
			normalized(index + 5) !== "end"
		)
			throw invalid();
		for (let position = index; position <= index + 6; position++) keep[position] = false;
		policies.set(key, policies.get(key) - 1);
		index += 6;
	}
	if ([...policies.values()].some((remaining) => remaining !== 0)) throw invalid();
	return keep.every(Boolean) ? content : lines.filter((_line, index) => keep[index]).join(newline);
}
