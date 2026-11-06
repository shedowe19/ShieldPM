import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TrafficFlowConfig, TrafficFlowSetting } from "src/api/backend/trafficFlowSettings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrafficFlowSettings from "./TrafficFlow";

const api = vi.hoisted(() => ({ getTrafficFlowSetting: vi.fn(), saveTrafficFlowSetting: vi.fn() }));
vi.mock("src/api/backend/trafficFlowSettings", () => api);
// Keep form-state tests independent of Radix pointer mechanics; Chromium tests exercise the actual select.
vi.mock("src/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		disabled,
		children,
	}: {
		value: string;
		onValueChange: (value: string) => void;
		disabled?: boolean;
		children: ReactNode;
	}) => (
		<select
			id="flow-client-mode"
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
			disabled={disabled}
		>
			{children}
		</select>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
}));
let stored: TrafficFlowSetting;
let client: QueryClient;
beforeEach(() => {
	stored = {
		id: "traffic-flow",
		value: "configured",
		meta: { enabled: true, liveEnabled: true, clientMode: "prefix" },
		runtime: { nativeAvailable: true, liveEffective: true, reason: null },
	};
	api.getTrafficFlowSetting.mockReset().mockImplementation(async () => structuredClone(stored));
	api.saveTrafficFlowSetting.mockReset().mockImplementation(async (meta: TrafficFlowConfig) => {
		stored = { ...stored, meta, runtime: { ...stored.runtime, liveEffective: meta.enabled && meta.liveEnabled } };
		return structuredClone(stored);
	});
	client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
	cleanup();
	client.clear();
});
const mount = () =>
	render(
		<QueryClientProvider client={client}>
			<TrafficFlowSettings />
		</QueryClientProvider>,
	);
const ready = () => screen.findByRole("switch", { name: "Enable traffic observations" });

describe("Traffic Flow settings", () => {
	it("loads enabled collection and live measurement with private networks as the default", async () => {
		mount();
		expect(await ready()).toBeChecked();
		expect(screen.getByRole("switch", { name: "Enable live data rates" })).toBeChecked();
		expect(screen.getByRole("combobox")).toHaveValue("prefix");
		expect(screen.queryByText(/You are explicitly choosing/)).not.toBeInTheDocument();
		expect(screen.getByText(/not access logs or historical Analytics/)).toBeInTheDocument();
	});
	it("saves explicit addresses, hidden mode and disabling, then refetches actual saved values", async () => {
		mount();
		await ready();
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "address" } });
		expect(screen.getByText(/You are explicitly choosing/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Save and apply" }));
		await screen.findByText("Settings saved and applied.");
		expect(api.saveTrafficFlowSetting).toHaveBeenLastCalledWith(
			{ enabled: true, liveEnabled: true, clientMode: "address" },
			expect.anything(),
		);
		expect(api.getTrafficFlowSetting.mock.calls.length).toBeGreaterThan(1);
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "hidden" } });
		fireEvent.click(screen.getByRole("switch", { name: "Enable traffic observations" }));
		fireEvent.click(screen.getByRole("button", { name: "Save and apply" }));
		await screen.findByText("Settings saved and applied.");
		expect(stored.meta).toEqual({ enabled: false, liveEnabled: true, clientMode: "hidden" });
		expect(screen.getByRole("switch", { name: "Enable traffic observations" })).not.toBeChecked();
		expect(screen.getByRole("switch", { name: "Enable live data rates" })).toBeDisabled();
		expect(screen.getByRole("combobox")).toHaveValue("hidden");
	});
	it("keeps the unsaved choice and reports an apply error without claiming success", async () => {
		api.saveTrafficFlowSetting.mockRejectedValue(
			new Error("Nginx validation failed; previous configuration restored"),
		);
		mount();
		await ready();
		fireEvent.click(screen.getByRole("switch", { name: "Enable traffic observations" }));
		fireEvent.click(screen.getByRole("button", { name: "Save and apply" }));
		await screen.findByText(/Nginx validation failed/);
		expect(screen.queryByText("Settings saved and applied.")).not.toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "Enable traffic observations" })).not.toBeChecked();
		expect(stored.meta.enabled).toBe(true);
		expect(client.getQueryData<TrafficFlowSetting>(["setting", "traffic-flow"])?.meta.enabled).toBe(true);
	});
	it("preserves desired live-on with an older binary and permits saving again to probe an upgrade", async () => {
		stored.runtime = { nativeAvailable: false, liveEffective: false, reason: "native_module_unavailable" };
		mount();
		await ready();
		expect(screen.getByRole("switch", { name: "Enable live data rates" })).toBeChecked();
		expect(screen.getByText(/enabled in Settings but currently inactive/)).toBeInTheDocument();
		stored.runtime = { nativeAvailable: true, liveEffective: true, reason: null };
		fireEvent.click(screen.getByRole("button", { name: "Save and apply" }));
		await screen.findByText("Settings saved and applied.");
		await waitFor(() =>
			expect(screen.queryByText(/enabled in Settings but currently inactive/)).not.toBeInTheDocument(),
		);
		expect(stored.meta.liveEnabled).toBe(true);
	});
	it("distinguishes a configuration apply failure from an unavailable native binary", async () => {
		stored.runtime = { nativeAvailable: true, liveEffective: false, reason: "configuration_failed" };
		mount();
		await ready();
		expect(screen.getByText(/Nginx configuration could not be applied/)).toBeInTheDocument();
		expect(screen.queryByText(/After upgrading Nginx/)).not.toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "Enable live data rates" })).toBeChecked();
	});

	it("does not invent enabled defaults when the settings request fails", async () => {
		api.getTrafficFlowSetting.mockRejectedValue(new Error("Forbidden"));
		mount();
		await screen.findByText("Forbidden");
		expect(screen.queryByRole("switch")).not.toBeInTheDocument();
	});
});
