import { Loader2, Play, Square, Terminal, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WASI_APPLICATION_MAX_BYTES, type WasiRunInput, type WasiRunResult } from "src/api/backend/wasiApplications";
import { Alert } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useWasiApplications } from "src/hooks/useWasiApplications";
import { intl, T } from "src/locale";

const message = (id: string) => intl.formatMessage({ id: `wasi.${id}` });
const byteLength = (value: string) => new TextEncoder().encode(value).length;
const textAreaClass = "min-h-32 w-full rounded-md border bg-background p-2 font-mono text-sm";

function runInput(argsText: string, envText: string, stdin: string, timeout: string): WasiRunInput {
	let args: unknown;
	let environment: unknown;
	try {
		args = JSON.parse(argsText);
	} catch {
		throw new Error(message("args-invalid"));
	}
	if (
		!Array.isArray(args) ||
		args.length > 32 ||
		args.some((value) => typeof value !== "string" || value.includes("\0") || byteLength(value) > 4096)
	) {
		throw new Error(message("args-invalid"));
	}
	try {
		environment = JSON.parse(envText);
	} catch {
		throw new Error(message("env-invalid"));
	}
	if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
		throw new Error(message("env-invalid"));
	}
	const entries = Object.entries(environment);
	if (
		entries.length > 32 ||
		entries.some(
			([name, value]) =>
				!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ||
				typeof value !== "string" ||
				value.includes("\0") ||
				byteLength(value) > 4096,
		)
	) {
		throw new Error(message("env-invalid"));
	}
	const env = entries.map(([name, value]) => ({ name, value: value as string }));
	if (
		args.reduce((size, value) => size + byteLength(value) + 1, 0) +
			env.reduce((size, entry) => size + byteLength(entry.name) + byteLength(entry.value) + 2, 0) >
		64 * 1024
	) {
		throw new Error(message("input-limit"));
	}
	if (byteLength(stdin) > 64 * 1024) throw new Error(message("stdin-limit"));
	const timeoutMs = Math.round(Number(timeout) * 1000);
	if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(timeout.trim()) || timeoutMs < 100 || timeoutMs > 60_000) {
		throw new Error(message("timeout-invalid"));
	}
	return { args, env, stdin, timeoutMs };
}

function RunResult({ result }: { result: WasiRunResult }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<T id="wasi.result" />
				</CardTitle>
				<CardDescription role="status" aria-live="polite">
					<T id={`wasi.status.${result.status}`} /> · <T id="wasi.exit-code" />: {result.exitCode ?? "—"} ·{" "}
					<T id="wasi.duration" />: {result.durationMs} ms
					{result.signal ? ` · ${result.signal}` : ""}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{result.status === "cancelled" ? (
					<p className="text-sm text-muted-foreground">
						<T id="wasi.cancelled-output" />
					</p>
				) : (
					<>
						{result.truncated && (
							<Alert role="note">
								<T id="wasi.output-truncated" />
							</Alert>
						)}
						{(["stdout", "stderr"] as const).map((stream) => (
							<div key={stream} className="space-y-2">
								<h3 className="font-medium">
									<T id={`wasi.${stream}`} />
								</h3>
								<pre
									role="region"
									aria-label={message(stream)}
									className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-sm whitespace-pre-wrap break-all"
								>
									{result[stream] || message("no-output")}
								</pre>
							</div>
						))}
					</>
				)}
			</CardContent>
		</Card>
	);
}

export default function WasiApplications() {
	const { state, upload, remove, run } = useWasiApplications();
	const [selected, setSelected] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState("");
	const [args, setArgs] = useState("[]");
	const [env, setEnv] = useState("{}");
	const [stdin, setStdin] = useState("");
	const [timeout, setTimeoutSeconds] = useState("10");
	const [error, setError] = useState("");
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<WasiRunResult | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const controller = useRef<AbortController | null>(null);
	const generation = useRef(0);
	const application = state.data?.find((entry) => entry.id === selected);
	const busy = running || upload.isPending || remove.isPending;
	const available = !state.isPending && !state.error;

	useEffect(
		() => () => {
			generation.current += 1;
			controller.current?.abort();
		},
		[],
	);

	const startRun = async () => {
		if (!application || busy || !available) return;
		setError("");
		let input: WasiRunInput;
		try {
			input = runInput(args, env, stdin, timeout);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : message("run-failed"));
			return;
		}
		const current = ++generation.current;
		const abort = new AbortController();
		const started = performance.now();
		controller.current = abort;
		setRunning(true);
		setResult(null);
		try {
			const response = await run.mutateAsync({ id: application.id, input, signal: abort.signal });
			if (generation.current === current && !abort.signal.aborted) setResult(response);
		} catch (cause) {
			if (generation.current === current && !abort.signal.aborted) {
				setError(cause instanceof Error ? cause.message : message("run-failed"));
			}
		} finally {
			if (generation.current === current) {
				if (abort.signal.aborted) {
					setResult({
						status: "cancelled",
						exitCode: null,
						stdout: "",
						stderr: "",
						durationMs: Math.round(performance.now() - started),
						truncated: false,
					});
				}
				controller.current = null;
				setRunning(false);
				run.reset();
			}
		}
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Terminal className="size-5" />
						<T id="wasi.title" />
					</CardTitle>
					<CardDescription>
						<T id="wasi.description" />
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{(error || state.error) && (
						<Alert variant="destructive" role="alert">
							{error || state.error?.message}
						</Alert>
					)}
					<Alert role="note">
						<T id="wasi.trust-notice" />
					</Alert>
					<form
						className="grid gap-4 md:grid-cols-2"
						onSubmit={async (event) => {
							event.preventDefault();
							if (!file || !name.trim() || busy || !available) return;
							setError("");
							if (!/\.wasm$/i.test(file.name) || !file.size || file.size > WASI_APPLICATION_MAX_BYTES) {
								setError(message("file-invalid"));
								return;
							}
							try {
								const uploaded = await upload.mutateAsync({ file, name: name.trim() });
								setSelected(uploaded.id);
								setResult(null);
								setFile(null);
								setName("");
								if (fileInput.current) fileInput.current.value = "";
							} catch (cause) {
								setError(cause instanceof Error ? cause.message : message("upload-failed"));
							} finally {
								upload.reset();
							}
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="wasi-file">
								<T id="wasi.file" />
							</Label>
							<Input
								ref={fileInput}
								id="wasi-file"
								type="file"
								accept=".wasm,application/wasm"
								disabled={busy || !available}
								onChange={(event) => {
									const next = event.target.files?.[0] || null;
									setFile(next);
									setError("");
									if (next && !name) setName(next.name.replace(/\.wasm$/i, ""));
								}}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="wasi-name">
								<T id="wasi.name" />
							</Label>
							<Input
								id="wasi-name"
								value={name}
								maxLength={128}
								disabled={busy}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>
						<Button type="submit" disabled={!file || !name.trim() || busy || !available}>
							<Upload className="mr-2 size-4" />
							<T id="wasi.upload" />
						</Button>
					</form>
					<p className="text-sm text-muted-foreground">
						<T id="wasi.file-help" />
					</p>
					{state.isPending && <Loader2 className="size-5 animate-spin" aria-label={message("loading")} />}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>
						<T id="wasi.run-title" />
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="wasi-application">
							<T id="wasi.application" />
						</Label>
						<select
							id="wasi-application"
							className="h-10 w-full rounded-md border bg-background px-3 text-sm"
							value={selected}
							disabled={busy || !available}
							onChange={(event) => {
								setSelected(event.target.value);
								setResult(null);
								setError("");
							}}
						>
							<option value="">{message("select")}</option>
							{state.data?.map((entry) => (
								<option key={entry.id} value={entry.id}>
									{entry.name || entry.filename}
								</option>
							))}
						</select>
						{state.data?.length === 0 && (
							<p className="text-sm text-muted-foreground">
								<T id="wasi.empty" />
							</p>
						)}
					</div>
					{application && (
						<>
							<p className="break-all text-sm text-muted-foreground">
								{application.filename} · {(application.size / 1024 ** 2).toFixed(2)} MiB · SHA-256:{" "}
								{application.sha256}
							</p>
							<form
								noValidate
								className="space-y-4"
								onSubmit={(event) => {
									event.preventDefault();
									void startRun();
								}}
							>
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-2">
										<Label htmlFor="wasi-args">
											<T id="wasi.args" />
										</Label>
										<textarea
											id="wasi-args"
											className={textAreaClass}
											value={args}
											spellCheck={false}
											disabled={busy}
											onChange={(event) => setArgs(event.target.value)}
											aria-describedby="wasi-args-help"
										/>
										<p id="wasi-args-help" className="text-sm text-muted-foreground">
											<T id="wasi.args-help" />
										</p>
									</div>
									<div className="space-y-2">
										<Label htmlFor="wasi-env">
											<T id="wasi.env" />
										</Label>
										<textarea
											id="wasi-env"
											className={textAreaClass}
											value={env}
											spellCheck={false}
											disabled={busy}
											onChange={(event) => setEnv(event.target.value)}
											aria-describedby="wasi-env-help"
										/>
										<p id="wasi-env-help" className="text-sm text-muted-foreground">
											<T id="wasi.env-help" />
										</p>
									</div>
								</div>
								<div className="space-y-2">
									<Label htmlFor="wasi-stdin">
										<T id="wasi.stdin" />
									</Label>
									<textarea
										id="wasi-stdin"
										className={textAreaClass}
										value={stdin}
										disabled={busy}
										onChange={(event) => setStdin(event.target.value)}
										spellCheck={false}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="wasi-timeout">
										<T id="wasi.timeout" />
									</Label>
									<Input
										id="wasi-timeout"
										type="number"
										min="0.1"
										max="60"
										step="0.001"
										value={timeout}
										disabled={busy}
										onChange={(event) => setTimeoutSeconds(event.target.value)}
									/>
								</div>
								<div className="flex flex-wrap gap-3">
									<Button type="submit" disabled={busy || !available}>
										{running ? (
											<Loader2 className="mr-2 size-4 animate-spin" />
										) : (
											<Play className="mr-2 size-4" />
										)}
										<T id={running ? "wasi.running" : "wasi.run"} />
									</Button>
									{running && (
										<Button
											type="button"
											variant="outline"
											onClick={() => controller.current?.abort()}
										>
											<Square className="mr-2 size-4" />
											<T id="wasi.stop" />
										</Button>
									)}
									<Button
										type="button"
										variant="ghost"
										disabled={busy || !available}
										onClick={async () => {
											if (!window.confirm(message("delete-confirm"))) return;
											setError("");
											try {
												await remove.mutateAsync(application.id);
												setSelected("");
												setResult(null);
											} catch (cause) {
												setError(
													cause instanceof Error ? cause.message : message("delete-failed"),
												);
											}
										}}
									>
										<T id="wasi.delete" />
									</Button>
								</div>
							</form>
						</>
					)}
				</CardContent>
			</Card>
			{result && <RunResult result={result} />}
		</div>
	);
}
