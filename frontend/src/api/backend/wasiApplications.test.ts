import AuthStore from "src/modules/AuthStore";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	deleteWasiApplication,
	getWasiApplications,
	runWasiApplication,
	uploadWasiApplication,
} from "./wasiApplications";

beforeEach(() => AuthStore.setCsrfToken("synthetic-csrf"));
afterEach(() => {
	AuthStore.clear();
	vi.unstubAllGlobals();
});

it("uploads unchanged application bytes through the authenticated CSRF-aware client", async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "a".repeat(64), created_on: "2026-10-18" }));
	vi.stubGlobal("fetch", fetchMock);
	const file = new File([new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])], "my app.wasm");
	await expect(uploadWasiApplication({ file, name: "My app" })).resolves.toMatchObject({ createdOn: "2026-10-18" });
	expect(fetchMock).toHaveBeenCalledWith(
		"/api/nginx/wasm/applications?filename=my%20app.wasm&name=My%20app",
		expect.objectContaining({
			method: "POST",
			credentials: "include",
			body: file,
			headers: { "Content-Type": "application/wasm", "X-XSRF-TOKEN": "synthetic-csrf" },
		}),
	);
});

it("preserves argument and environment values while mapping API fields and output metadata", async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValue(
			Response.json({ status: "failed", exit_code: 9, stdout: "Exact_Text", stderr: "reason", duration_ms: 4 }),
		);
	vi.stubGlobal("fetch", fetchMock);
	await expect(
		runWasiApplication({
			id: "a".repeat(64),
			input: {
				args: ["Case_sensitive"],
				env: [{ name: "TenantID", value: "Exact_VALUE" }],
				stdin: "input\n",
				timeoutMs: 1500,
			},
		}),
	).resolves.toMatchObject({ exitCode: 9, stdout: "Exact_Text", durationMs: 4 });
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
		args: ["Case_sensitive"],
		env: [{ name: "TenantID", value: "Exact_VALUE" }],
		stdin: "input\n",
		timeout_ms: 1500,
	});
});

it("forwards cancellation to execution and removes the forwarding listener after completion", async () => {
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	let requestSignal: AbortSignal | undefined;
	vi.stubGlobal(
		"fetch",
		vi.fn((_url, options: RequestInit) => {
			requestSignal = options.signal as AbortSignal;
			return new Promise((_resolve, reject) => {
				requestSignal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")));
			});
		}),
	);
	const promise = runWasiApplication({
		id: "a".repeat(64),
		input: { args: [], env: [], stdin: "" },
		signal: controller.signal,
	});
	controller.abort();
	await expect(promise).rejects.toMatchObject({ name: "AbortError" });
	expect(requestSignal?.aborted).toBe(true);
	expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});

it("lists with the query cancellation signal and deletes the chosen application", async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
	vi.stubGlobal("fetch", fetchMock);
	const controller = new AbortController();
	await getWasiApplications(controller.signal);
	expect(fetchMock).toHaveBeenLastCalledWith(
		"/api/nginx/wasm/applications",
		expect.objectContaining({ method: "GET", signal: controller.signal, credentials: "include" }),
	);
	fetchMock.mockResolvedValue(Response.json({ deleted: true }));
	await deleteWasiApplication("a".repeat(64));
	expect(fetchMock).toHaveBeenLastCalledWith(
		`/api/nginx/wasm/applications/${"a".repeat(64)}`,
		expect.objectContaining({ method: "DELETE", credentials: "include" }),
	);
});
