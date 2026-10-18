import { del, get, post } from "./base";

export const WASI_APPLICATION_MAX_BYTES = 16 * 1024 * 1024;

export interface WasiApplication {
	id: string;
	name: string;
	filename: string;
	sha256: string;
	size: number;
	runtime: "wasi-preview1";
	createdOn: string;
}

export interface WasiRunInput {
	args: string[];
	env: { name: string; value: string }[];
	stdin: string;
	timeoutMs?: number;
}

export interface WasiRunResult {
	status: "completed" | "failed" | "timed_out" | "output_limit" | "cancelled";
	exitCode: number | null;
	stdout: string;
	stderr: string;
	durationMs: number;
	truncated: boolean;
	signal?: string | null;
}

export const getWasiApplications = (signal?: AbortSignal) =>
	get<WasiApplication[]>({ url: "/nginx/wasm/applications" }, signal ? { signal } : undefined);

export const uploadWasiApplication = ({ file, name }: { file: File; name: string }) =>
	post<WasiApplication>({
		url: "/nginx/wasm/applications",
		params: { name, filename: file.name },
		rawBody: file,
		contentType: "application/wasm",
	});

export const deleteWasiApplication = (id: string) =>
	del<{ deleted: boolean }>({ url: `/nginx/wasm/applications/${id}` });

export async function runWasiApplication({
	id,
	input,
	signal,
}: {
	id: string;
	input: WasiRunInput;
	signal?: AbortSignal;
}): Promise<WasiRunResult> {
	const controller = new AbortController();
	const cancel = () => controller.abort(signal?.reason);
	if (signal?.aborted) cancel();
	else signal?.addEventListener("abort", cancel, { once: true });
	try {
		return await post<WasiRunResult>({ url: `/nginx/wasm/applications/${id}/run`, data: input }, controller);
	} finally {
		signal?.removeEventListener("abort", cancel);
	}
}
