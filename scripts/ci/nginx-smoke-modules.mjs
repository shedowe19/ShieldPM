import fs from "node:fs/promises";
import path from "node:path";

const names = {
	ndk: "ndk_http_module.so",
	lua: "ngx_http_lua_module.so",
	modsecurity: "ngx_http_modsecurity_module.so",
	geoip2: "ngx_http_geoip2_module.so",
};

/** Resolve only the modules used by the isolated firewall test, in dependency order. */
export async function resolveNginxSmokeModules({
	version,
	configuration,
	isFile = async (file) =>
		(await fs.stat(file).catch(() => null))?.isFile() === true,
}) {
	const option = (name) => {
		const match = version.match(
			new RegExp(`--${name}=(?:"([^"]+)"|'([^']+)'|([^\\s]+))`),
		);
		return match?.[1] || match?.[2] || match?.[3];
	};
	const prefix = option("prefix") || "/usr/local/nginx";
	const modulesPath = option("modules-path");
	const configured = [
		...configuration.matchAll(
			/^\s*#?\s*load_module\s+(?:"([^"]+)"|'([^']+)'|([^;\s]+))\s*;/gm,
		),
	]
		.map((match) => match[1] || match[2] || match[3])
		.map((file) => (path.isAbsolute(file) ? file : path.resolve(prefix, file)));
	const directories = [
		modulesPath &&
			(path.isAbsolute(modulesPath)
				? modulesPath
				: path.resolve(prefix, modulesPath)),
		path.join(prefix, "modules"),
		"/etc/nginx/modules",
		"/usr/lib/nginx/modules",
		"/usr/local/nginx/modules",
	].filter(Boolean);
	const modules = {};
	for (const [kind, name] of Object.entries(names)) {
		const candidates = [
			...configured.filter((file) => path.basename(file) === name),
			...directories.map((directory) => path.join(directory, name)),
		];
		for (const candidate of new Set(candidates)) {
			if (await isFile(candidate)) {
				modules[kind] = candidate;
				break;
			}
		}
	}
	return modules;
}
