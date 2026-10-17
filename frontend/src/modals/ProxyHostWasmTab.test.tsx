import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { WasmFilter } from "src/api/backend/wasm";
import { Tabs } from "src/components/ui/tabs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProxyHostWasmTab from "./ProxyHostWasmTab";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage },
}));
const { testRuntime, uploadModule, moduleCatalog, user } = vi.hoisted(() => ({
	testRuntime: vi.fn(),
	uploadModule: vi.fn(),
	moduleCatalog: {
		data: [
			{
				id: "a".repeat(64),
				name: "Tenant filter",
				filename: "tenant.wasm",
				sha256: "a".repeat(64),
				size: 1024,
				abi: "0.2.1",
				createdOn: "2026-10-17",
			},
		],
		isLoading: false,
		isError: false,
	},
	user: { roles: ["admin"] },
}));
vi.mock("src/hooks/useUser", () => ({ useUser: () => ({ data: user }) }));
beforeEach(() => {
	user.roles = ["admin"];
	moduleCatalog.isError = false;
	uploadModule.mockReset();
});
vi.mock("src/hooks/useWasm", () => ({
	useWasmCapability: () => ({ data: { state: "functional", version: "1.0.0" } }),
	useWasmHostStatus: () => ({ data: { state: "validated" } }),
	useWasmSelfTest: () => ({ mutate: testRuntime, isPending: false }),
	useWasmModules: () => moduleCatalog,
	useUploadWasmModule: () => ({ mutateAsync: uploadModule, isPending: false }),
}));
function Values() {
	const { values } = useFormikContext<{ meta: { wasmFilters: WasmFilter[] } }>();
	return <output data-testid="values">{JSON.stringify(values)}</output>;
}
function show(filters: WasmFilter[] = [], onSubmit = vi.fn()) {
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<Formik initialValues={{ id: 8, meta: { wasmFilters: filters } }} onSubmit={onSubmit}>
				<Form>
					<Tabs value="wasm">
						<ProxyHostWasmTab />
					</Tabs>
					<button type="submit">Save host</button>
					<Values />
				</Form>
			</Formik>
		</QueryClientProvider>,
	);
}
const values = () => JSON.parse(screen.getByTestId("values").textContent || "{}").meta.wasmFilters;
describe("ProxyHostWasmTab", () => {
	it("adds fail-closed API policies and preserves existing write-only keys", async () => {
		show([
			{
				id: "existing",
				kind: "api_key",
				enabled: true,
				failureMode: "closed",
				config: { header: "x-api-key", hasSecret: true },
			},
		]);
		expect(screen.getByLabelText("API key")).toHaveValue("");
		expect(screen.getByPlaceholderText("Stored key is retained when left blank")).toBeInTheDocument();
		fireEvent.click(screen.getByText("Built-in templates"));
		fireEvent.click(screen.getByRole("button", { name: "Add api key" }));
		await waitFor(() => expect(values()).toHaveLength(2));
		expect(values()[0].config.hasSecret).toBe(true);
		expect(values()[1]).toMatchObject({ kind: "api_key", enabled: true, failureMode: "closed" });
	});
	it("reorders policies and removes the exact selected filter", async () => {
		show([
			{
				id: "one",
				kind: "request_header",
				enabled: true,
				failureMode: "closed",
				config: { header: "x-one", value: "1", operation: "set" },
			},
			{
				id: "two",
				kind: "response_header",
				enabled: true,
				failureMode: "open",
				config: { header: "x-two", value: "2", operation: "set" },
			},
		]);
		fireEvent.click(screen.getAllByRole("button", { name: "Move filter down" })[0]);
		await waitFor(() => expect(values().map((filter: WasmFilter) => filter.id)).toEqual(["two", "one"]));
		fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
		await waitFor(() => expect(values().map((filter: WasmFilter) => filter.id)).toEqual(["one"]));
	});
	it("runs explicit capability verification and exposes activation state", () => {
		show();
		expect(screen.getByText(/Host activation.*validated/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Verify runtime" }));
		expect(testRuntime).toHaveBeenCalledOnce();
	});
	it("adds an uploaded module with configuration and retains exact key casing when reordered", async () => {
		show([
			{
				id: "header",
				kind: "request_header",
				enabled: true,
				failureMode: "closed",
				config: { header: "x-tenant", value: "1" },
			},
		]);
		fireEvent.change(screen.getByLabelText("Available module"), { target: { value: "a".repeat(64) } });
		fireEvent.click(screen.getByRole("button", { name: "Add module to host" }));
		await waitFor(() => expect(values()).toHaveLength(2));
		fireEvent.change(screen.getByLabelText("Module configuration (JSON)"), {
			target: { value: '{"TenantID":"demo","nested_key":{"ExactCase":true}}' },
		});
		await waitFor(() =>
			expect(values()[1].config.configuration).toEqual({ TenantID: "demo", nested_key: { ExactCase: true } }),
		);
		fireEvent.click(screen.getAllByRole("button", { name: "Move filter up" })[1]);
		await waitFor(() =>
			expect(values()[0]).toMatchObject({
				kind: "module",
				config: { moduleId: "a".repeat(64), configuration: { TenantID: "demo" } },
			}),
		);
		expect(screen.getByLabelText("Module configuration (JSON)")).toHaveValue(
			'{"TenantID":"demo","nested_key":{"ExactCase":true}}',
		);
	});
	it("blocks save while JSON is invalid and accepts a corrected object", async () => {
		const submit = vi.fn();
		show(
			[
				{
					id: "custom",
					kind: "module",
					enabled: true,
					failureMode: "closed",
					config: { moduleId: "a".repeat(64), configuration: {} },
				},
			],
			submit,
		);
		const input = screen.getByLabelText("Module configuration (JSON)");
		fireEvent.change(input, { target: { value: '{"incomplete":' } });
		fireEvent.click(screen.getByRole("button", { name: "Save host" }));
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Enter a JSON object"));
		expect(submit).not.toHaveBeenCalled();
		expect(input).toHaveValue('{"incomplete":');
		fireEvent.change(input, { target: { value: '{"CaseSensitive":true}' } });
		fireEvent.click(screen.getByRole("button", { name: "Save host" }));
		await waitFor(() => expect(submit).toHaveBeenCalledOnce());
	});
	it("keeps write-only module configuration when blank and allows an explicit reset", async () => {
		show([
			{
				id: "custom",
				kind: "module",
				enabled: true,
				failureMode: "closed",
				config: { moduleId: "a".repeat(64), hasConfiguration: true },
			},
		]);
		const input = screen.getByPlaceholderText("Leave empty to keep the stored configuration");
		expect(input).toHaveValue("");
		expect(values()[0].config).toEqual({ moduleId: "a".repeat(64), hasConfiguration: true });
		fireEvent.change(input, { target: { value: "{}" } });
		await waitFor(() => expect(values()[0].config.configuration).toEqual({}));
		fireEvent.change(input, { target: { value: "" } });
		await waitFor(() => expect(values()[0].config).not.toHaveProperty("configuration"));
	});
	it("uploads binary files, selects the returned module and preserves the host draft", async () => {
		const uploaded = {
			...moduleCatalog.data[0],
			id: "b".repeat(64),
			name: "Custom plugin",
			filename: "custom.wasm",
			sha256: "b".repeat(64),
		};
		uploadModule.mockResolvedValue(uploaded);
		show();
		const file = new File([new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])], "custom.wasm", {
			type: "application/wasm",
		});
		fireEvent.change(screen.getByLabelText("Wasm module file (.wasm)"), { target: { files: [file] } });
		fireEvent.change(screen.getByLabelText("Module name"), { target: { value: "Custom plugin" } });
		fireEvent.click(screen.getByRole("button", { name: "Upload module" }));
		await waitFor(() => expect(uploadModule).toHaveBeenCalledWith({ file, name: "Custom plugin" }));
		await waitFor(() => expect(screen.getByLabelText("Available module")).toHaveValue(uploaded.id));
		expect(values()).toEqual([]);
		fireEvent.click(screen.getByRole("button", { name: "Add module to host" }));
		await waitFor(() => expect(values()[0].config.moduleId).toBe(uploaded.id));
	});
	it("preserves the selected module, file and current host draft after an upload failure", async () => {
		uploadModule.mockRejectedValue(new Error("The module has an unsupported ABI"));
		const existing: WasmFilter = {
			id: "custom",
			kind: "module",
			enabled: true,
			failureMode: "closed",
			config: { moduleId: "a".repeat(64), configuration: { keepCase: 1 } },
		};
		show([existing]);
		fireEvent.change(screen.getByLabelText("Available module"), { target: { value: "a".repeat(64) } });
		const file = new File(["not wasm"], "broken.wasm");
		fireEvent.change(screen.getByLabelText("Wasm module file (.wasm)"), { target: { files: [file] } });
		fireEvent.click(screen.getByRole("button", { name: "Upload module" }));
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("unsupported ABI"));
		expect(screen.getByLabelText("Available module")).toHaveValue("a".repeat(64));
		expect(screen.getByLabelText("Module name")).toHaveValue("broken");
		expect(values()).toEqual([existing]);
		expect(screen.getByRole("button", { name: "Upload module" })).toBeEnabled();
	});
	it.each(["bad.txt", "empty.wasm", "huge.wasm"])(
		"rejects invalid upload %s without replacing current filters",
		async (filename) => {
			show();
			const file = new File(filename === "empty.wasm" ? [] : ["payload"], filename);
			if (filename === "huge.wasm") Object.defineProperty(file, "size", { value: 16 * 1024 * 1024 + 1 });
			fireEvent.change(screen.getByLabelText("Wasm module file (.wasm)"), { target: { files: [file] } });
			fireEvent.click(screen.getByRole("button", { name: "Upload module" }));
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(uploadModule).not.toHaveBeenCalled();
			expect(values()).toEqual([]);
		},
	);
	it("allows non-admins to select existing modules but does not offer code upload", () => {
		user.roles = [];
		show();
		expect(screen.queryByLabelText("Wasm module file (.wasm)")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Available module")).toBeEnabled();
		expect(screen.getByText(/An administrator can upload modules/)).toBeInTheDocument();
	});
});
