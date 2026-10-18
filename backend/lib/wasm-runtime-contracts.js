/** Shared, compile-only runtime contracts; accepting WASI imports does not make a command a Proxy-Wasm filter. */
// API7's Wasmtime linker defines WASI Preview 1 for SDK support in otherwise
// valid Proxy-Wasm HTTP modules. This does not admit standalone WASI programs.
export const wasiPreview1Functions = new Set([
	"args_get",
	"args_sizes_get",
	"environ_get",
	"environ_sizes_get",
	"clock_res_get",
	"clock_time_get",
	"fd_advise",
	"fd_allocate",
	"fd_close",
	"fd_datasync",
	"fd_fdstat_get",
	"fd_fdstat_set_flags",
	"fd_fdstat_set_rights",
	"fd_filestat_get",
	"fd_filestat_set_size",
	"fd_filestat_set_times",
	"fd_pread",
	"fd_prestat_get",
	"fd_prestat_dir_name",
	"fd_pwrite",
	"fd_read",
	"fd_readdir",
	"fd_renumber",
	"fd_seek",
	"fd_sync",
	"fd_tell",
	"fd_write",
	"path_create_directory",
	"path_filestat_get",
	"path_filestat_set_times",
	"path_link",
	"path_open",
	"path_readlink",
	"path_remove_directory",
	"path_rename",
	"path_symlink",
	"path_unlink_file",
	"poll_oneoff",
	"proc_exit",
	"proc_raise",
	"sched_yield",
	"random_get",
	"sock_accept",
	"sock_recv",
	"sock_send",
	"sock_shutdown",
]);

const httpCallbacks = [
	"proxy_on_request_headers",
	"proxy_on_response_headers",
	"proxy_on_request_body",
	"proxy_on_response_body",
];
const proxyLifecycle = [
	"proxy_abi_version_0_2_1",
	"proxy_on_memory_allocate",
	"proxy_on_context_create",
	"proxy_on_configure",
	"proxy_on_done",
	"proxy_on_delete",
];

/** @param {{imports: WebAssembly.ModuleImportDescriptor[], exports: WebAssembly.ModuleExportDescriptor[]}} inspection */
export function hasProxyWasmImports({ imports }) {
	return imports.every(
		(entry) =>
			entry.kind === "function" &&
			((entry.module === "env" && /^proxy_[a-z0-9_]+$/.test(entry.name)) ||
				(entry.module === "wasi_snapshot_preview1" && wasiPreview1Functions.has(entry.name))),
	);
}

/** @param {{imports: WebAssembly.ModuleImportDescriptor[], exports: WebAssembly.ModuleExportDescriptor[]}} inspection */
export function proxyWasmMetadata(inspection) {
	const functions = new Set(
		inspection.exports.filter((entry) => entry.kind === "function").map((entry) => entry.name),
	);
	if (
		!hasProxyWasmImports(inspection) ||
		proxyLifecycle.some((name) => !functions.has(name)) ||
		!inspection.exports.some((entry) => entry.kind === "memory" && entry.name === "memory") ||
		!httpCallbacks.some((name) => functions.has(name))
	)
		return null;
	return { abi: "0.2.1", callbacks: httpCallbacks.filter((name) => functions.has(name)) };
}

/** @param {{imports: WebAssembly.ModuleImportDescriptor[], exports: WebAssembly.ModuleExportDescriptor[]}} inspection */
export function isWasiPreview1Command({ imports, exports }) {
	return (
		imports.every(
			(entry) =>
				entry.kind === "function" &&
				entry.module === "wasi_snapshot_preview1" &&
				wasiPreview1Functions.has(entry.name),
		) &&
		exports.some((entry) => entry.kind === "function" && entry.name === "_start") &&
		exports.some((entry) => entry.kind === "memory" && entry.name === "memory") &&
		!exports.some((entry) => entry.name === "_initialize")
	);
}
