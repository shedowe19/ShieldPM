import { useField, useFormikContext } from "formik";
import { useEffect, useState } from "react";
import type { WasmApplicationSettings, WasmFilter } from "src/api/backend/wasm";
import { Label } from "src/components/ui/label";
import { intl } from "src/locale";

const text = (id: string, defaultMessage: string) =>
	intl.formatMessage({ id: `proxy-host.wasm.${id}`, defaultMessage });
const bytes = (value: string) => new TextEncoder().encode(value).length;

export function applicationSettingsError(value: string): string | undefined {
	if (!value.trim()) return;
	try {
		const settings = JSON.parse(value);
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error();
		if (Object.keys(settings).some((key) => !["args", "env", "timeoutMs"].includes(key))) throw new Error();
		if (settings.args === null || settings.env === null) throw new Error();
		const args = settings.args ?? [];
		const env = settings.env ?? [];
		if (
			!Array.isArray(args) ||
			args.length > 32 ||
			args.some((arg) => typeof arg !== "string" || arg.includes("\0") || bytes(arg) > 4096)
		)
			throw new Error();
		if (
			!Array.isArray(env) ||
			env.length > 32 ||
			env.some(
				(entry) =>
					!entry ||
					typeof entry !== "object" ||
					Array.isArray(entry) ||
					Object.keys(entry).some((key) => !["name", "value"].includes(key)) ||
					typeof entry.name !== "string" ||
					!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(entry.name) ||
					entry.name.startsWith("SHIELDPM_HTTP_") ||
					typeof entry.value !== "string" ||
					entry.value.includes("\0") ||
					bytes(entry.value) > 4096,
			)
		)
			throw new Error();
		if (new Set(env.map((entry) => entry.name)).size !== env.length) throw new Error();
		if (
			args.reduce((sum, arg) => sum + bytes(arg) + 1, 0) +
				env.reduce((sum, entry) => sum + bytes(entry.name) + bytes(entry.value) + 2, 0) >
			64 * 1024
		) {
			return text("application-settings-size", "Arguments and environment together must not exceed 64 KiB.");
		}
		if (
			settings.timeoutMs !== undefined &&
			(!Number.isInteger(settings.timeoutMs) || settings.timeoutMs < 100 || settings.timeoutMs > 60_000)
		) {
			throw new Error();
		}
		return;
	} catch {
		return text(
			"application-settings-invalid",
			"Enter an object with args (string array), env (name/value array), and timeoutMs (100–60000). SHIELDPM_HTTP_ names are reserved.",
		);
	}
}

export default function ProxyHostWasiConfiguration({
	filter,
	index,
	patch,
}: {
	filter: WasmFilter;
	index: number;
	patch: (config: WasmFilter["config"]) => void;
}) {
	const [draft, setDraft] = useState(() =>
		filter.config.settings ? JSON.stringify(filter.config.settings, null, 2) : "",
	);
	const [, meta, helpers] = useField({
		name: `meta.wasmFilters.${index}.config.settings`,
		validate: () => applicationSettingsError(draft),
	});
	const { validateForm } = useFormikContext();
	// biome-ignore lint/correctness/useExhaustiveDependencies: The draft changes its registered validator even when the saved Formik value stays unchanged.
	useEffect(() => {
		// Recompute the whole error tree after a draft validator changes, including empty parent objects.
		void validateForm();
	}, [draft, validateForm]);
	const error = applicationSettingsError(draft) || meta.error;
	const mode = filter.config.mode || "handler";
	const protocol = filter.config.protocol || "stdio";
	return (
		<>
			<p className="break-all text-xs text-muted-foreground">
				{text("application-id", "Application SHA-256")}: {filter.config.applicationId}
			</p>
			<div className="space-y-2">
				<Label htmlFor={`${filter.id}-mode`}>{text("application-mode", "Application role")}</Label>
				<select
					id={`${filter.id}-mode`}
					className="w-full rounded-md border bg-background p-2"
					value={mode}
					onChange={(event) => {
						const next = event.target.value as "filter" | "handler";
						patch({
							...filter.config,
							mode: next,
							protocol: next === "filter" ? "http-json-v1" : protocol,
						});
					}}
				>
					<option value="handler">
						{text("application-handler", "Handle request and return a response")}
					</option>
					<option value="filter">
						{text("application-filter", "Inspect or change request before forwarding")}
					</option>
				</select>
				<p className="text-sm text-muted-foreground">
					{text(
						"application-order-help",
						"Enable at most one response handler and place it after the other enabled entries. Request filters may continue forwarding or return a response.",
					)}
				</p>
				<Label htmlFor={`${filter.id}-protocol`}>
					{text("application-protocol", "Input and output format")}
				</Label>
				<select
					id={`${filter.id}-protocol`}
					className="w-full rounded-md border bg-background p-2"
					value={protocol}
					disabled={mode === "filter"}
					onChange={(event) =>
						patch({ ...filter.config, protocol: event.target.value as "stdio" | "http-json-v1" })
					}
				>
					<option value="stdio">{text("application-stdio", "Standard input → plain text response")}</option>
					<option value="http-json-v1">
						{text("application-json", "HTTP JSON v1 → request changes or response")}
					</option>
				</select>
				<p className="text-sm text-muted-foreground">
					{protocol === "stdio"
						? text(
								"application-stdio-help",
								"Each request starts the application. Its body is standard input; a successful exit returns standard output as HTTP 200 text/plain. SHIELDPM_HTTP_ environment values contain request metadata.",
							)
						: text(
								"application-json-help",
								"The application reads a version 1 JSON request with headers and a base64 body. It must return a version 1 continue action with optional request changes, or a respond action with status, headers and a base64 body. A handler must respond.",
							)}
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${filter.id}-settings`}>
					{text("application-settings", "Application execution settings (JSON)")}
				</Label>
				<textarea
					id={`${filter.id}-settings`}
					className="min-h-32 w-full rounded-md border bg-background p-2 font-mono text-sm"
					value={draft}
					spellCheck={false}
					aria-invalid={Boolean(error)}
					aria-describedby={`${filter.id}-settings-help${error ? ` ${filter.id}-settings-error` : ""}`}
					placeholder={
						filter.config.hasSettings
							? text("keep-settings", "Leave empty to keep the stored execution settings")
							: '{"args":[],"env":[],"timeoutMs":10000}'
					}
					onChange={(event) => {
						const next = event.target.value;
						setDraft(next);
						const nextError = applicationSettingsError(next);
						helpers.setError(nextError);
						if (!nextError)
							void helpers.setValue(
								next.trim() ? (JSON.parse(next) as WasmApplicationSettings) : undefined,
								false,
							);
					}}
				/>
				<p id={`${filter.id}-settings-help`} className="text-sm text-muted-foreground">
					{text(
						"application-settings-help",
						"Settings are encrypted and write-only. Leave empty to retain them; {} restores defaults. Use args for up to 32 arguments, env for up to 32 name/value entries, and timeoutMs for 100–60000 ms. Request bodies are limited to 64 KiB; output to 1 MiB.",
					)}
				</p>
				{error && (
					<p id={`${filter.id}-settings-error`} className="text-sm text-destructive" role="alert">
						{error}
					</p>
				)}
			</div>
		</>
	);
}
