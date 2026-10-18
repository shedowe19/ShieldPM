import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WasiApplication, WasiRunResult } from "src/api/backend/wasiApplications";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WasiApplications from "./WasiApplications";

const mocks = vi.hoisted(() => ({
	getWasiApplications: vi.fn(),
	uploadWasiApplication: vi.fn(),
	deleteWasiApplication: vi.fn(),
	runWasiApplication: vi.fn(),
}));
vi.mock("src/api/backend/wasiApplications", async (original) => ({
	...(await original<typeof import("src/api/backend/wasiApplications")>()),
	...mocks,
}));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));

const application: WasiApplication = {
	id: "a".repeat(64),
	name: "Text tool",
	filename: "text.wasm",
	sha256: "a".repeat(64),
	size: 1024,
	runtime: "wasi-preview1",
	createdOn: "2026-10-18T00:00:00Z",
};
const completed: WasiRunResult = {
	status: "completed",
	exitCode: 0,
	stdout: "Hello from WASI\n",
	stderr: "",
	durationMs: 12,
	truncated: false,
};
let catalog: WasiApplication[];
let clients: QueryClient[];
beforeEach(() => {
	vi.resetAllMocks();
	catalog = [application];
	clients = [];
	mocks.getWasiApplications.mockImplementation(async () => [...catalog]);
	mocks.runWasiApplication.mockResolvedValue(completed);
	mocks.deleteWasiApplication.mockImplementation(async (id) => {
		catalog = catalog.filter((entry) => entry.id !== id);
		return { deleted: true };
	});
});
afterEach(() => {
	cleanup();
	for (const client of clients) client.clear();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function show() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	clients.push(client);
	return render(
		<QueryClientProvider client={client}>
			<WasiApplications />
		</QueryClientProvider>,
	);
}
async function select(id = application.id) {
	await screen.findByRole("option", { name: "Text tool" });
	fireEvent.change(screen.getByLabelText("wasi.application"), { target: { value: id } });
}
const change = (label: string, value: string) =>
	fireEvent.change(screen.getByLabelText(`wasi.${label}`), { target: { value } });
const run = () => fireEvent.click(screen.getByRole("button", { name: "wasi.run" }));

describe("standalone WASI applications", () => {
	it("uploads a binary application, selects it and runs with case-sensitive environment values", async () => {
		const uploaded = { ...application, id: "b".repeat(64), name: "Uploaded app", filename: "upload.wasm" };
		mocks.uploadWasiApplication.mockImplementation(async () => {
			catalog.push(uploaded);
			return uploaded;
		});
		show();
		await screen.findByRole("option", { name: "Text tool" });
		expect(screen.getByText("wasi.trust-notice")).toBeInTheDocument();
		const file = new File([new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])], "upload.wasm");
		fireEvent.change(screen.getByLabelText("wasi.file"), { target: { files: [file] } });
		change("name", "Uploaded app");
		fireEvent.click(screen.getByRole("button", { name: "wasi.upload" }));
		await waitFor(() => expect(screen.getByLabelText("wasi.application")).toHaveValue(uploaded.id));
		expect(mocks.uploadWasiApplication).toHaveBeenCalledWith({ file, name: "Uploaded app" }, expect.anything());
		change("args", '["--format", "exact Value"]');
		change("env", '{"TenantID":"Keep_CASE", "lower_key":"value"}');
		change("stdin", "some input\n");
		change("timeout", "2.5");
		run();
		await waitFor(() => expect(screen.getByLabelText("wasi.stdout")).toHaveTextContent("Hello from WASI"));
		expect(mocks.runWasiApplication).toHaveBeenCalledWith(
			{
				id: uploaded.id,
				input: {
					args: ["--format", "exact Value"],
					env: [
						{ name: "TenantID", value: "Keep_CASE" },
						{ name: "lower_key", value: "value" },
					],
					stdin: "some input\n",
					timeoutMs: 2500,
				},
				signal: expect.any(AbortSignal),
			},
			expect.anything(),
		);
		expect(screen.getByRole("status")).toHaveTextContent("wasi.status.completed · wasi.exit-code: 0");
		expect(screen.getByLabelText("wasi.name")).toHaveValue("");
	});

	it.each([
		["args", '{"wrong":"object"}', "wasi.args-invalid"],
		["args", '["unfinished"', "wasi.args-invalid"],
		["args", '["ok",42]', "wasi.args-invalid"],
		["env", '{"API_KEY":42}', "wasi.env-invalid"],
		["env", '{"invalid-name":"value"}', "wasi.env-invalid"],
		["stdin", "é".repeat(32769), "wasi.stdin-limit"],
	])("rejects invalid %s without running or losing the draft", async (field, draft, expected) => {
		show();
		await select();
		change(field, draft);
		run();
		expect(await screen.findByRole("alert")).toHaveTextContent(expected);
		expect(mocks.runWasiApplication).not.toHaveBeenCalled();
		expect(screen.getByLabelText(`wasi.${field}`)).toHaveValue(draft);
		expect(screen.getByLabelText("wasi.application")).toHaveValue(application.id);
	});

	it("shows a nonzero exit and stderr as an execution result, rendering program text safely", async () => {
		mocks.runWasiApplication.mockResolvedValue({
			...completed,
			status: "failed",
			exitCode: 7,
			stdout: '<img src="x" onerror="alert(1)">',
			stderr: "input rejected\nnext line",
		});
		const { container } = show();
		await select();
		run();
		expect(await screen.findByRole("status")).toHaveTextContent("wasi.status.failed · wasi.exit-code: 7");
		expect(screen.getByLabelText("wasi.stderr")).toHaveTextContent("input rejected next line");
		expect(screen.getByLabelText("wasi.stdout")).toHaveTextContent('<img src="x" onerror="alert(1)">');
		expect(container.querySelector("img")).toBeNull();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it.each(["0", "60.001", "0.1001"])("rejects a time limit of %s seconds before execution", async (timeout) => {
		show();
		await select();
		change("timeout", timeout);
		run();
		expect(await screen.findByRole("alert")).toHaveTextContent("wasi.timeout-invalid");
		expect(mocks.runWasiApplication).not.toHaveBeenCalled();
	});

	it("converts a three-decimal-second limit without floating-point rejection", async () => {
		show();
		await select();
		change("timeout", "1.001");
		run();
		await screen.findByRole("status");
		expect(mocks.runWasiApplication.mock.calls[0][0].input.timeoutMs).toBe(1001);
	});

	it.each([
		{ args: Array.from({ length: 32 }, () => "x".repeat(2049)) },
		{ args: Array.from({ length: 16 }, () => "x".repeat(4096)) },
	])("counts string terminators when bounding the combined argument and environment payload", async ({ args }) => {
		show();
		await select();
		change("args", JSON.stringify(args));
		run();
		expect(await screen.findByRole("alert")).toHaveTextContent("wasi.input-limit");
		expect(mocks.runWasiApplication).not.toHaveBeenCalled();
	});

	it.each(["timed_out", "output_limit"] as const)("keeps captured output for a %s result", async (status) => {
		mocks.runWasiApplication.mockResolvedValue({
			...completed,
			status,
			exitCode: null,
			stderr: "captured before stop",
			truncated: status === "output_limit",
		});
		show();
		await select();
		run();
		expect(await screen.findByRole("status")).toHaveTextContent(`wasi.status.${status} · wasi.exit-code: —`);
		expect(screen.getByLabelText("wasi.stderr")).toHaveTextContent("captured before stop");
		expect(!!screen.queryByText("wasi.output-truncated")).toBe(status === "output_limit");
	});

	it("aborts an active request on Stop and unlocks the preserved run draft", async () => {
		mocks.runWasiApplication.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) =>
					signal.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), {
						once: true,
					}),
				),
		);
		show();
		await select();
		change("stdin", "preserved input");
		run();
		await screen.findByRole("button", { name: "wasi.stop" });
		expect(screen.getByLabelText("wasi.application")).toBeDisabled();
		expect(screen.getByRole("button", { name: "wasi.delete" })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "wasi.stop" }));
		expect(await screen.findByRole("status")).toHaveTextContent("wasi.status.cancelled");
		expect(mocks.runWasiApplication.mock.calls[0][0].signal.aborted).toBe(true);
		expect(screen.getByRole("button", { name: "wasi.run" })).toBeEnabled();
		expect(screen.getByLabelText("wasi.stdin")).toHaveValue("preserved input");
		expect(screen.getByText("wasi.cancelled-output")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("does not show a successful late response after cancellation and aborts on unmount", async () => {
		let finish: (result: WasiRunResult) => void = () => {};
		mocks.runWasiApplication.mockImplementation(() => new Promise<WasiRunResult>((resolve) => (finish = resolve)));
		const view = show();
		await select();
		run();
		await screen.findByRole("button", { name: "wasi.stop" });
		fireEvent.click(screen.getByRole("button", { name: "wasi.stop" }));
		await act(async () => finish(completed));
		expect(screen.getByRole("status")).toHaveTextContent("wasi.status.cancelled");
		expect(screen.queryByText("Hello from WASI")).not.toBeInTheDocument();
		run();
		await waitFor(() => expect(mocks.runWasiApplication).toHaveBeenCalledTimes(2));
		const signal = mocks.runWasiApplication.mock.calls[1][0].signal;
		view.unmount();
		expect(signal.aborted).toBe(true);
		await act(async () => finish(completed));
	});

	it("preserves file and input drafts on upload or execution errors", async () => {
		mocks.uploadWasiApplication.mockRejectedValue(new Error("Unsupported WASI imports"));
		mocks.runWasiApplication.mockRejectedValue(new Error("Runner unavailable"));
		show();
		await select();
		const file = new File(["wasm"], "draft.wasm");
		fireEvent.change(screen.getByLabelText("wasi.file"), { target: { files: [file] } });
		fireEvent.click(screen.getByRole("button", { name: "wasi.upload" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported WASI imports");
		expect(screen.getByLabelText("wasi.name")).toHaveValue("draft");
		expect(screen.getByRole("button", { name: "wasi.upload" })).toBeEnabled();
		change("args", '["--keep"]');
		run();
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Runner unavailable"));
		expect(screen.getByLabelText("wasi.args")).toHaveValue('["--keep"]');
		expect(screen.getByLabelText("wasi.application")).toHaveValue(application.id);
		expect(screen.getByRole("button", { name: "wasi.run" })).toBeEnabled();
	});

	it("clears a previous result on selection and deletes only after confirmation", async () => {
		catalog.push({ ...application, id: "b".repeat(64), name: "Other app" });
		const confirm = vi.fn().mockReturnValue(false);
		vi.stubGlobal("confirm", confirm);
		show();
		await select();
		run();
		await screen.findByRole("status");
		fireEvent.change(screen.getByLabelText("wasi.application"), { target: { value: "b".repeat(64) } });
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "wasi.delete" }));
		expect(mocks.deleteWasiApplication).not.toHaveBeenCalled();
		confirm.mockReturnValue(true);
		fireEvent.click(screen.getByRole("button", { name: "wasi.delete" }));
		await waitFor(() => expect(screen.getByLabelText("wasi.application")).toHaveValue(""));
		expect(mocks.deleteWasiApplication).toHaveBeenCalledWith("b".repeat(64), expect.anything());
		expect(screen.queryByRole("option", { name: "Other app" })).not.toBeInTheDocument();
	});

	it.each(["wrong.txt", "empty.wasm", "large.wasm"])("rejects invalid upload %s locally", async (filename) => {
		show();
		await select();
		const file = new File(filename === "empty.wasm" ? [] : ["data"], filename);
		if (filename === "large.wasm") Object.defineProperty(file, "size", { value: 16 * 1024 * 1024 + 1 });
		fireEvent.change(screen.getByLabelText("wasi.file"), { target: { files: [file] } });
		fireEvent.click(screen.getByRole("button", { name: "wasi.upload" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("wasi.file-invalid");
		expect(mocks.uploadWasiApplication).not.toHaveBeenCalled();
	});

	it("shows catalog failures and prevents actions using unavailable application metadata", async () => {
		mocks.getWasiApplications.mockRejectedValue(new Error("Catalog unavailable"));
		show();
		expect(await screen.findByRole("alert")).toHaveTextContent("Catalog unavailable");
		expect(screen.getByLabelText("wasi.application")).toBeDisabled();
		expect(screen.getByLabelText("wasi.file")).toBeDisabled();
		expect(mocks.runWasiApplication).not.toHaveBeenCalled();
	});
});
