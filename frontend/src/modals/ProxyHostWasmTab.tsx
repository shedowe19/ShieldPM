import { useFormikContext } from "formik";
import type { WasmFilter, WasmFilterKind } from "src/api/backend/wasm";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { useWasmCapability, useWasmHostStatus, useWasmSelfTest } from "src/hooks/useWasm";
import { intl } from "src/locale";

const text = (id: string, defaultMessage: string) =>
	intl.formatMessage({ id: `proxy-host.wasm.${id}`, defaultMessage });
export const createWasmFilter = (kind: WasmFilterKind): WasmFilter => ({
	id: `filter_${crypto.randomUUID().split("-").join("").slice(0, 16)}`,
	kind,
	enabled: true,
	failureMode: "closed",
	config:
		kind === "local_response"
			? { status: 503, body: "Temporarily unavailable" }
			: {
					header: kind === "api_key" ? "x-api-key" : "x-shieldpm-policy",
					...(kind === "api_key" ? { value: "" } : { operation: "set", value: "" }),
				},
});

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
				<h3 className="font-medium">{text("title", "WebAssembly filters")}</h3>
				<p className="text-sm text-muted-foreground">
					{text(
						"description",
						"Run trusted policies at the proxy. Filters run in the order shown, before the upstream receives the request.",
					)}
				</p>
				<p className="text-sm" role="status">
					{text("runtime", "Runtime")}: {capability.data?.state || "unverified"}{" "}
					{capability.data?.runtimeVersion ? `· Wasmtime ${capability.data.runtimeVersion}` : ""}
				</p>
				{capability.data?.version && (
					<p className="text-sm text-muted-foreground">
						{text("policy-version", "Policy version")}: {capability.data.version}
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
					{filter.kind !== "local_response" && (
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
					{filter.kind === "local_response" ? (
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
			<div className="flex flex-wrap gap-2">
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
		</TabsContent>
	);
}
