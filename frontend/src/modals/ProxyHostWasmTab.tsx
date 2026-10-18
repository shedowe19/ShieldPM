import { useField, useFormikContext } from "formik";
import { useEffect, useState } from "react";
import { WASM_MODULE_MAX_BYTES, type WasmArtifact, type WasmFilter, type WasmFilterKind } from "src/api/backend/wasm";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { useUser } from "src/hooks/useUser";
import {
	useUploadWasmArtifact,
	useWasmArtifacts,
	useWasmCapability,
	useWasmHostStatus,
	useWasmSelfTest,
} from "src/hooks/useWasm";
import { intl } from "src/locale";
import ProxyHostWasiConfiguration from "./ProxyHostWasiConfiguration";

const text = (id: string, defaultMessage: string) =>
	intl.formatMessage({ id: `proxy-host.wasm.${id}`, defaultMessage });
export const createWasmFilter = (kind: WasmFilterKind, moduleId?: string): WasmFilter => ({
	id: `filter_${crypto.randomUUID().split("-").join("").slice(0, 16)}`,
	kind,
	enabled: true,
	failureMode: "closed",
	config:
		kind === "application"
			? { applicationId: moduleId, mode: "handler", protocol: "stdio", settings: {} }
			: kind === "module"
				? { moduleId, configuration: {} }
				: kind === "local_response"
					? { status: 503, body: "Temporarily unavailable" }
					: {
							header: kind === "api_key" ? "x-api-key" : "x-shieldpm-policy",
							...(kind === "api_key" ? { value: "" } : { operation: "set", value: "" }),
						},
});

function configurationError(value: string): string | undefined {
	if (!value.trim()) return;
	if (new TextEncoder().encode(value).length > 64 * 1024) {
		return text("configuration-size", "Configuration must not exceed 64 KiB.");
	}
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return;
	} catch {
		// Keep the draft visible until it is valid JSON.
	}
	return text("configuration-invalid", "Enter a JSON object, for example {}.");
}

function ModuleConfiguration({ filter, index }: { filter: WasmFilter; index: number }) {
	const [draft, setDraft] = useState(() =>
		filter.config.configuration ? JSON.stringify(filter.config.configuration, null, 2) : "",
	);
	const [, meta, helpers] = useField({
		name: `meta.wasmFilters.${index}.config.configuration`,
		validate: () => configurationError(draft),
	});
	const { validateForm } = useFormikContext();
	// biome-ignore lint/correctness/useExhaustiveDependencies: The draft changes its registered validator even when the saved Formik value stays unchanged.
	useEffect(() => {
		// Clearing the field error alone leaves empty parent objects and keeps the host Save button disabled.
		void validateForm();
	}, [draft, validateForm]);
	const error = configurationError(draft) || meta.error;
	return (
		<div className="space-y-2">
			<Label htmlFor={`${filter.id}-configuration`}>{text("configuration", "Module configuration (JSON)")}</Label>
			<textarea
				id={`${filter.id}-configuration`}
				className="min-h-32 w-full rounded-md border bg-background p-2 font-mono text-sm"
				value={draft}
				spellCheck={false}
				aria-invalid={Boolean(error)}
				aria-describedby={`${filter.id}-configuration-help${error ? ` ${filter.id}-configuration-error` : ""}`}
				placeholder={
					filter.config.hasConfiguration
						? text("keep-configuration", "Leave empty to keep the stored configuration")
						: "{}"
				}
				onChange={(event) => {
					const next = event.target.value;
					setDraft(next);
					const nextError = configurationError(next);
					helpers.setError(nextError);
					if (!nextError) void helpers.setValue(next.trim() ? JSON.parse(next) : undefined, false);
				}}
			/>
			<p id={`${filter.id}-configuration-help`} className="text-sm text-muted-foreground">
				{text(
					"configuration-help",
					"Configuration is encrypted and write-only. Leave empty to keep it; enter {} to clear it. Saving the host validates and activates the module.",
				)}
			</p>
			{error && (
				<p id={`${filter.id}-configuration-error`} className="text-sm text-destructive" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

function ModuleCatalog({ filters, add }: { filters: WasmFilter[]; add: (entry: WasmArtifact) => void }) {
	const modules = useWasmArtifacts();
	const upload = useUploadWasmArtifact();
	const { data: user } = useUser("me");
	const [selected, setSelected] = useState("");
	const [uploaded, setUploaded] = useState<WasmArtifact | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const catalog =
		uploaded &&
		!modules.data?.some(
			(module) => module.runtime === uploaded.runtime && module.artifact.id === uploaded.artifact.id,
		)
			? [...(modules.data || []), uploaded]
			: modules.data || [];
	const key = (entry: WasmArtifact) => `${entry.runtime}:${entry.artifact.id}`;
	const selectedModule = catalog.find((module) => key(module) === selected);
	return (
		<section aria-labelledby="wasm-modules-title" className="rounded-lg border p-4 space-y-4">
			<div className="space-y-2">
				<h3 id="wasm-modules-title" className="font-medium">
					{text("modules", "Your Wasm modules")}
				</h3>
				<p className="text-sm text-muted-foreground">
					{text(
						"module-help",
						"Upload a trusted .wasm file. ShieldPM detects Proxy-Wasm HTTP filters and WASI Preview 1 applications so either can run on this host.",
					)}{" "}
					<a href="/settings/wasi" className="text-primary underline">
						{text("standalone-wasi", "Test applications separately in Settings → WASI applications.")}
					</a>
				</p>
			</div>
			{user?.roles.includes("admin") ? (
				<div className="space-y-3 rounded-md bg-muted/40 p-3">
					<Label htmlFor="wasm-module-file">{text("module-file", "Wasm module file (.wasm)")}</Label>
					<Input
						id="wasm-module-file"
						type="file"
						accept=".wasm,application/wasm"
						disabled={upload.isPending}
						onChange={(event) => {
							const next = event.target.files?.[0] || null;
							setFile(next);
							setError("");
							if (next && !name) setName(next.name.replace(/\.wasm$/i, ""));
						}}
					/>
					<Label htmlFor="wasm-module-name">{text("module-name", "Module name")}</Label>
					<Input
						id="wasm-module-name"
						maxLength={128}
						value={name}
						disabled={upload.isPending}
						onChange={(event) => setName(event.target.value)}
					/>
					<p className="text-sm text-muted-foreground">
						{text(
							"upload-trust",
							"Administrators can upload trusted code. Modules can inspect and change this host's HTTP traffic. Maximum file size: 16 MiB.",
						)}
					</p>
					<Button
						type="button"
						disabled={!file || !name.trim() || upload.isPending}
						onClick={async () => {
							if (!file) return;
							setError("");
							if (!/\.wasm$/i.test(file.name)) {
								setError(text("file-type", "Select a .wasm module file."));
								return;
							}
							if (!file.size || file.size > WASM_MODULE_MAX_BYTES) {
								setError(text("file-size", "Select a non-empty module of at most 16 MiB."));
								return;
							}
							try {
								const module = await upload.mutateAsync({ file, name: name.trim() });
								setUploaded(module);
								setSelected(key(module));
							} catch (cause) {
								setError(
									cause instanceof Error
										? cause.message
										: text("upload-failed", "The module could not be uploaded."),
								);
							}
						}}
					>
						{text(
							upload.isPending ? "uploading" : "upload",
							upload.isPending ? "Uploading module…" : "Upload module",
						)}
					</Button>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					{text(
						"admin-upload",
						"An administrator can upload modules. You can use the modules already available below.",
					)}
				</p>
			)}
			{error && (
				<p className="text-sm text-destructive" role="alert">
					{error}
				</p>
			)}
			<div className="space-y-2">
				<Label htmlFor="wasm-module-catalog">{text("select-module", "Available module")}</Label>
				<select
					id="wasm-module-catalog"
					className="w-full rounded-md border bg-background p-2"
					value={selected}
					disabled={modules.isLoading}
					onChange={(event) => setSelected(event.target.value)}
				>
					<option value="">{text("choose-module", "Select a module")}</option>
					{catalog.map((module) => (
						<option key={key(module)} value={key(module)}>
							{module.artifact.name} · {module.artifact.filename} ·{" "}
							{module.runtime === "proxy-wasm" ? "Proxy-Wasm" : "WASI Preview 1"}
						</option>
					))}
				</select>
				{selectedModule && (
					<p className="break-all text-xs text-muted-foreground">
						{selectedModule.runtime === "proxy-wasm"
							? `Proxy-Wasm ${selectedModule.artifact.abi}`
							: "WASI Preview 1"}{" "}
						· {Math.ceil(selectedModule.artifact.size / 1024)} KiB · SHA-256{" "}
						{selectedModule.artifact.sha256}
					</p>
				)}
				{modules.isError && (
					<p className="text-sm text-destructive" role="alert">
						{text("catalog-failed", "Available modules could not be loaded.")}
					</p>
				)}
				{!modules.isLoading && !modules.isError && catalog.length === 0 && (
					<p className="text-sm text-muted-foreground">{text("catalog-empty", "No uploaded modules yet.")}</p>
				)}
			</div>
			<Button
				type="button"
				disabled={!selectedModule || filters.length >= 8}
				onClick={() => selectedModule && add(selectedModule)}
			>
				{text("add-module", "Add module to host")}
			</Button>
		</section>
	);
}

export default function ProxyHostWasmTab() {
	const { values, setFieldValue } = useFormikContext<{ id?: number; meta?: { wasmFilters?: WasmFilter[] } }>();
	const filters = values.meta?.wasmFilters || [];
	const capability = useWasmCapability();
	const status = useWasmHostStatus(values.id);
	const selfTest = useWasmSelfTest();
	const update = (next: WasmFilter[]) => setFieldValue("meta.wasmFilters", next);
	const patch = (index: number, next: Partial<WasmFilter>) =>
		update(filters.map((filter, i) => (i === index ? { ...filter, ...next } : filter)));
	const move = (index: number, direction: number) => {
		const next = [...filters];
		[next[index], next[index + direction]] = [next[index + direction], next[index]];
		update(next);
	};
	return (
		<TabsContent value="wasm" className="mt-0 space-y-5">
			<div className="rounded-lg border p-4 space-y-2">
				<h3 className="font-medium">{text("title", "WebAssembly modules and applications")}</h3>
				<p className="text-sm text-muted-foreground">
					{text(
						"description",
						"Run Wasm filters and WASI applications on this host. Entries run in the order shown; saving validates and activates the HTTP chain.",
					)}
				</p>
				<p className="text-sm" role="status">
					{text("runtime", "Runtime")}: {capability.data?.state || "unverified"}{" "}
					{capability.data?.runtimeVersion ? `· Wasmtime ${capability.data.runtimeVersion}` : ""}
				</p>
				<p className="text-sm text-muted-foreground">
					{text(
						"application-runtime-help",
						"WASI applications use the command runtime independently. The Proxy-Wasm runtime check applies to HTTP filter modules.",
					)}
				</p>
				{capability.data?.version && (
					<p className="text-sm text-muted-foreground">
						{text("policy-version", "Built-in template version")}: {capability.data.version}
					</p>
				)}
				{capability.data && (
					<p className="text-sm text-muted-foreground">
						{text("built", "Built in")}:{" "}
						{text(capability.data.built ? "yes" : "no", capability.data.built ? "yes" : "no")} ·{" "}
						{text("installed", "Installed")}:{" "}
						{text(capability.data.installed ? "yes" : "no", capability.data.installed ? "yes" : "no")} ·{" "}
						{text("configured", "Configured")}:{" "}
						{text(capability.data.configured ? "yes" : "no", capability.data.configured ? "yes" : "no")}
					</p>
				)}
				{status.data && (
					<p className="text-sm" role="status">
						{text("host-status", "Host activation")}: {status.data.state}
						{status.data.message ? ` · ${status.data.message}` : ""}
					</p>
				)}
				{(capability.isError || selfTest.isError) && (
					<p className="text-sm text-destructive" role="alert">
						{text(
							"test-failed",
							"Runtime verification failed. Check the installed Nginx runtime and permissions.",
						)}
					</p>
				)}
				<Button type="button" variant="outline" disabled={selfTest.isPending} onClick={() => selfTest.mutate()}>
					{text("test", "Verify runtime")}
				</Button>
			</div>
			<ModuleCatalog
				filters={filters}
				add={(entry) =>
					update([
						...filters,
						createWasmFilter(entry.runtime === "proxy-wasm" ? "module" : "application", entry.artifact.id),
					])
				}
			/>
			{filters.length > 0 && <h3 className="font-medium">{text("chain", "Host execution order")}</h3>}
			{filters.map((filter, index) => (
				<div key={filter.id} className="rounded-lg border p-4 space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Label htmlFor={`${filter.id}-enabled`} className="flex-1">
							{index + 1}. {text(filter.kind, filter.kind.split("_").join(" "))}
						</Label>
						<Switch
							id={`${filter.id}-enabled`}
							checked={filter.enabled}
							onCheckedChange={(enabled) => patch(index, { enabled })}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-label={text("up", "Move filter up")}
							disabled={index === 0}
							onClick={() => move(index, -1)}
						>
							↑
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-label={text("down", "Move filter down")}
							disabled={index === filters.length - 1}
							onClick={() => move(index, 1)}
						>
							↓
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => update(filters.filter((_, i) => i !== index))}
						>
							{text("remove", "Remove")}
						</Button>
					</div>
					{filter.kind !== "local_response" && filter.kind !== "module" && filter.kind !== "application" && (
						<div className="space-y-2">
							<Label htmlFor={`${filter.id}-header`}>{text("header", "Header name")}</Label>
							<Input
								id={`${filter.id}-header`}
								value={filter.config.header || ""}
								maxLength={128}
								onChange={(event) =>
									patch(index, { config: { ...filter.config, header: event.target.value } })
								}
							/>
						</div>
					)}
					{filter.kind === "application" ? (
						<ProxyHostWasiConfiguration
							filter={filter}
							index={index}
							patch={(config) => patch(index, { config })}
						/>
					) : filter.kind === "module" ? (
						<>
							<p className="break-all text-xs text-muted-foreground">
								{text("module-id", "Module SHA-256")}: {filter.config.moduleId}
							</p>
							<ModuleConfiguration filter={filter} index={index} />
						</>
					) : filter.kind === "local_response" ? (
						<>
							<Label htmlFor={`${filter.id}-status`}>{text("status", "HTTP status")}</Label>
							<Input
								id={`${filter.id}-status`}
								type="number"
								min={200}
								max={599}
								value={filter.config.status || 503}
								onChange={(event) =>
									patch(index, { config: { ...filter.config, status: Number(event.target.value) } })
								}
							/>
							<Label htmlFor={`${filter.id}-body`}>{text("body", "Response body")}</Label>
							<textarea
								id={`${filter.id}-body`}
								className="w-full rounded-md border bg-background p-2"
								maxLength={4096}
								value={filter.config.body || ""}
								onChange={(event) =>
									patch(index, { config: { ...filter.config, body: event.target.value } })
								}
							/>
						</>
					) : (
						<>
							{filter.kind !== "api_key" && (
								<div className="space-y-2">
									<Label htmlFor={`${filter.id}-operation`}>{text("operation", "Operation")}</Label>
									<select
										id={`${filter.id}-operation`}
										className="w-full rounded-md border bg-background p-2"
										value={filter.config.operation || "set"}
										onChange={(event) =>
											patch(index, {
												config: {
													...filter.config,
													operation: event.target.value as "set" | "remove",
												},
											})
										}
									>
										<option value="set">{text("set", "Set or replace")}</option>
										<option value="remove">{text("remove-header", "Remove header")}</option>
									</select>
								</div>
							)}
							{filter.config.operation !== "remove" && (
								<div className="space-y-2">
									<Label htmlFor={`${filter.id}-value`}>
										{text(
											filter.kind === "api_key" ? "key" : "value",
											filter.kind === "api_key" ? "API key" : "Header value",
										)}
									</Label>
									<Input
										id={`${filter.id}-value`}
										type={filter.kind === "api_key" ? "password" : "text"}
										autoComplete="new-password"
										value={filter.config.value || ""}
										maxLength={4096}
										placeholder={
											filter.config.hasSecret
												? text("keep-key", "Stored key is retained when left blank")
												: ""
										}
										onChange={(event) =>
											patch(index, { config: { ...filter.config, value: event.target.value } })
										}
									/>
								</div>
							)}
						</>
					)}
					{filter.kind !== "api_key" && (
						<div className="space-y-2">
							<Label htmlFor={`${filter.id}-failure`}>{text("failure", "On runtime failure")}</Label>
							<select
								id={`${filter.id}-failure`}
								className="w-full rounded-md border bg-background p-2"
								value={filter.failureMode}
								onChange={(event) =>
									patch(index, { failureMode: event.target.value as "closed" | "open" })
								}
							>
								<option value="closed">{text("closed", "Reject request")}</option>
								<option value="open">{text("open", "Continue without this filter")}</option>
							</select>
						</div>
					)}
					{filter.kind === "api_key" && (
						<p className="text-sm text-muted-foreground">
							{text(
								"auth-closed",
								"Authentication always rejects requests when the filter fails. API keys are write-only.",
							)}
						</p>
					)}
				</div>
			))}
			<details className="rounded-lg border p-4">
				<summary className="cursor-pointer font-medium">{text("templates", "Built-in templates")}</summary>
				<div className="mt-3 flex flex-wrap gap-2">
					{(["api_key", "request_header", "response_header", "local_response"] as const).map((kind) => (
						<Button
							key={kind}
							type="button"
							variant="outline"
							disabled={filters.length >= 8}
							onClick={() => update([...filters, createWasmFilter(kind)])}
						>
							{text(`add-${kind}`, `Add ${kind.split("_").join(" ")}`)}
						</Button>
					))}
				</div>
			</details>
		</TabsContent>
	);
}
