import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { changeLocale, intl } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorDialog } from "./MonitorDialog";

const mocks = vi.hoisted(() => ({
	check: vi.fn(),
	query: vi.fn(),
	update: vi.fn(),
}));

vi.mock("src/hooks/useProxyHostMonitor", () => ({
	useProxyHostMonitor: mocks.query,
	useUpdateProxyHostMonitor: () => ({ mutate: mocks.update, isPending: false }),
	useCheckProxyHostMonitor: () => ({ mutate: mocks.check, isPending: false }),
}));
vi.mock("src/components", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const savedConfig = {
	enabled: true,
	type: "http" as const,
	path: "/health",
	intervalSeconds: 60,
	timeoutMs: 5000,
	expectedStatus: 200,
	alertEnabled: false,
};

describe("Host monitor settings", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.query.mockReturnValue({ data: { config: null, status: null, history: [] }, isLoading: false });
		await changeLocale("de");
	});
	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("creates HTTP monitoring with the selected path and status code", () => {
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="http"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText("HTTP-Pfad"), { target: { value: "/health/ready" } });
		fireEvent.change(screen.getByLabelText("Erwarteter HTTP-Status"), { target: { value: "204" } });
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

		expect(mocks.update).toHaveBeenCalledWith(
			{ ...savedConfig, path: "/health/ready", expectedStatus: 204, intervalSeconds: 60 },
			expect.any(Object),
		);
		expect(mocks.check).not.toHaveBeenCalled();
	});

	it("rejects a timeout greater than or equal to the interval", () => {
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="http"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);
		fireEvent.change(screen.getByLabelText(intl.formatMessage({ id: "proxy-host.monitor.interval" })), {
			target: { value: "15" },
		});
		fireEvent.change(screen.getByLabelText("Zeitlimit (Millisekunden)"), { target: { value: "15000" } });
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

		expect(screen.getByRole("alert")).toHaveTextContent("Das Zeitlimit muss kürzer als das Prüfintervall sein.");
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("shows recorded state changes and allows a manual check of an existing monitor", () => {
		mocks.query.mockReturnValue({
			data: {
				config: savedConfig,
				status: { state: "up", checkedAt: "2026-01-01T12:00:00Z", responseMs: 14, statusCode: 200 },
				history: [
					{
						id: 1,
						state: "up",
						checkedAt: "2026-01-01T12:00:00Z",
						responseMs: 14,
						statusCode: 200,
						transition: true,
					},
				],
			},
			isLoading: false,
		});
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="http"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByText("Statuswechsel")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Jetzt prüfen" }));
		expect(mocks.check).toHaveBeenCalledWith(undefined, expect.any(Object));
	});

	it("offers TCP monitoring by default when the host scheme does not support HTTP", () => {
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="grpc"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Prüfart")).toHaveValue("tcp");
		expect(screen.queryByLabelText("HTTP-Pfad")).not.toBeInTheDocument();
	});

	it("does not offer a monitor for file-system upstreams", () => {
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="path"
				hostEnabled
				targetSupported={false}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Dateisystem/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Speichern" })).not.toBeInTheDocument();
	});
});
