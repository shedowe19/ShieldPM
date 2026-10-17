import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { WasmFilter } from "src/api/backend/wasm";
import { Tabs } from "src/components/ui/tabs";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostWasmTab from "./ProxyHostWasmTab";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage },
}));
const { testRuntime } = vi.hoisted(() => ({ testRuntime: vi.fn() }));
vi.mock("src/hooks/useWasm", () => ({
	useWasmCapability: () => ({ data: { state: "functional", version: "1.0.0" } }),
	useWasmHostStatus: () => ({ data: { state: "validated" } }),
	useWasmSelfTest: () => ({ mutate: testRuntime, isPending: false }),
}));
function Values() {
	const { values } = useFormikContext<{ meta: { wasmFilters: WasmFilter[] } }>();
	return <output data-testid="values">{JSON.stringify(values)}</output>;
}
function show(filters: WasmFilter[] = []) {
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<Formik initialValues={{ id: 8, meta: { wasmFilters: filters } }} onSubmit={() => {}}>
				<Form>
					<Tabs value="wasm">
						<ProxyHostWasmTab />
					</Tabs>
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
});
