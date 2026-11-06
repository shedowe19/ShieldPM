import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TrafficFlowSnapshot } from "src/api/backend/getTrafficFlow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficFlow } from "./TrafficFlow";
import { displayClientLabel } from "./TrafficFlowRows";

const mocks = vi.hoisted(() => ({ useTrafficFlow: vi.fn() }));
vi.mock("src/components/HasPermission", () => ({ HasPermission: ({ children }: { children: ReactNode }) => children }));
vi.mock("./useTrafficFlow", () => ({ useTrafficFlow: mocks.useTrafficFlow }));

const snapshot: TrafficFlowSnapshot = {
	enabled: true,
	generatedAt: new Date().toISOString(),
	configurationRevision: "test",
	sampleComplete: false,
	window: { start: "2026-11-05T16:00:00Z", end: "2026-11-05T16:01:00Z" },
	capabilities: { currentRates: false, source: "completed_requests" },
	hosts: [
		{
			id: 3,
			domains: ["example.test", "alias.test"],
			enabled: true,
			truncated: false,
			clients: [
				{
					id: "prefix:3",
					label: "192.0.2.0/24",
					requests: 2,
					completedBytes: 9000,
					lastSeen: "2026-11-05T16:00:10Z",
					currentBytesPerSecond: null,
				},
			],
			targets: [
				{
					id: "configured:3",
					label: "upstream.test:80",
					kind: "configured",
					requests: null,
					lastSeen: null,
					currentBytesPerSecond: null,
				},
			],
		},
	],
	truncated: false,
	collector: { state: "receiving", lastObservedAt: "2026-11-05T16:00:10Z" },
	pollIntervalMs: 5000,
};

beforeEach(() =>
	mocks.useTrafficFlow.mockReturnValue({ data: snapshot, error: null, isLoading: false, available: true }),
);
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
const open = () => fireEvent.click(screen.getByRole("button", { name: "Open traffic flow" }));

describe("TrafficFlow", () => {
	it("explains masked IPv4 with a wildcard and preserves explicitly displayed addresses", () => {
		expect(displayClientLabel("10.0.17.0/24", "prefix")).toBe("10.0.17.*");
		expect(displayClientLabel("10.0.17.21", "address")).toBe("10.0.17.21");
		expect(displayClientLabel("2001:db8:abcd::/48", "prefix")).toBe("2001:db8:abcd::/48");
	});
	it("does not mount its query until explicitly opened", () => {
		render(<TrafficFlow />);
		expect(mocks.useTrafficFlow).not.toHaveBeenCalled();
		open();
		expect(mocks.useTrafficFlow).toHaveBeenCalledWith(false);
	});
	it("labels unknown rates and completed bytes honestly with focusable details", () => {
		const { container } = render(<TrafficFlow />);
		open();
		expect(screen.getByText(/Current per-connection throughput is unavailable/)).toBeInTheDocument();
		expect(screen.getByText(/Client addresses are grouped for privacy/)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Completed requests: 2. Completed response-body bytes: 9000/ }),
		).toBeInTheDocument();
		expect(container.querySelectorAll('line[stroke-width="2"]')).toHaveLength(4);
		expect(container.querySelector('line[stroke-dasharray="6 4"]')).not.toBeNull();
		expect(screen.getByText("example.test")).toHaveAttribute("title", "example.test, alias.test");
		expect(screen.getByText("+1 more domain")).toBeInTheDocument();
		expect(screen.getByText("192.0.2.*")).toHaveAttribute("title", "192.0.2.0/24");
	});
	it("shows measured directional rates and one shared width scale while keeping configured rates unknown", () => {
		const rate = {
			uploadBytesPerSecond: 1024,
			downloadBytesPerSecond: 65536,
			bytesPerSecond: 66560,
			smoothedBytesPerSecond: 66560,
			windowStart: "2026-11-05T12:00:00Z",
			windowEnd: "2026-11-05T12:00:01Z",
			samples: 1,
		};
		mocks.useTrafficFlow.mockReturnValue({
			data: {
				...snapshot,
				capabilities: { currentRates: true, source: "native_http_transport" },
				hosts: [
					{
						...snapshot.hosts[0],
						clientRate: rate,
						clients: [
							{ ...snapshot.hosts[0].clients[0], rate, currentBytesPerSecond: rate.bytesPerSecond },
						],
					},
				],
			},
			error: null,
			isLoading: false,
			available: true,
		});
		const { container } = render(<TrafficFlow />);
		open();
		expect(screen.getByText(/Live measured HTTP\/1, HTTP\/2 stream/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Upload: 1024 B\/s. Download: 65536 B\/s/ })).toBeInTheDocument();
		expect(screen.getByText(/Fixed logarithmic scale/)).toBeInTheDocument();
		const rates = [...container.querySelectorAll("section line")].map((line) =>
			Number(line.getAttribute("stroke-width")),
		);
		expect(rates.filter((width) => width > 2)).toHaveLength(3);
		expect(container.querySelector('line[stroke-dasharray="6 4"]')).toHaveAttribute("stroke-width", "2");
	});

	it("explains unavailable native data and address mode without treating an IP as identity", () => {
		mocks.useTrafficFlow.mockReturnValue({
			data: {
				...snapshot,
				clientMode: "address",
				diagnostics: {
					liveEnabled: false,
					receiverState: "receiving",
					nativeLastObservedAt: null,
					reason: "native_disabled",
				},
			},
			error: null,
			isLoading: false,
			available: true,
		});
		render(<TrafficFlow />);
		open();
		expect(screen.getByText(/Live measurement is disabled in Settings/)).toBeInTheDocument();
		expect(screen.getByText(/An IP address is not a person or a unique device/)).toBeInTheDocument();
		expect(screen.getByText("Client IP · not a person or device")).toBeInTheDocument();
	});
	it("hides client addresses in hidden mode and links administrators to the existing Settings section", () => {
		mocks.useTrafficFlow.mockReturnValue({
			data: {
				...snapshot,
				clientMode: "hidden",
				hosts: [{ ...snapshot.hosts[0], clients: [{ ...snapshot.hosts[0].clients[0], label: "hidden" }] }],
			},
			error: null,
			isLoading: false,
			available: true,
		});
		const { container } = render(<TrafficFlow />);
		open();
		expect(screen.getByText(/retains one group per host without client IP/)).toBeInTheDocument();
		expect(screen.getByText("No client addresses retained")).toBeInTheDocument();
		expect(container.textContent).not.toContain("192.0.2.");
		expect(screen.getByRole("link", { name: "Traffic Flow settings" })).toHaveAttribute(
			"href",
			"/settings?tab=traffic-flow",
		);
	});

	it("moves only fresh verified active rates and stops immediately when paused", () => {
		const rate = {
			uploadBytesPerSecond: 1,
			downloadBytesPerSecond: 100,
			bytesPerSecond: 101,
			smoothedBytesPerSecond: 101,
			windowStart: new Date(Date.now() - 1000).toISOString(),
			windowEnd: new Date().toISOString(),
			samples: 1,
		};
		mocks.useTrafficFlow.mockReturnValue({
			data: {
				...snapshot,
				generatedAt: new Date().toISOString(),
				capabilities: { currentRates: true, source: "native_http_transport" },
				hosts: [
					{
						...snapshot.hosts[0],
						clientRate: rate,
						clients: [{ ...snapshot.hosts[0].clients[0], rate, activeRequests: 1 }],
					},
				],
			},
			error: null,
			isLoading: false,
			available: true,
		});
		const { container } = render(<TrafficFlow />);
		open();
		expect(container.querySelectorAll('[data-flow-motion="verified"]')).toHaveLength(3);
		expect(container.querySelector("animateTransform")).toHaveAttribute("dur", "1.6s");
		expect(container.querySelector('[data-flow-motion="verified"]')).toHaveAttribute("fill", "hsl(var(--primary))");
		expect(container.querySelector('[data-flow-motion="verified"]')).toHaveAttribute(
			"stroke",
			"hsl(var(--background))",
		);
		fireEvent.click(screen.getByRole("button", { name: "Pause" }));
		expect(container.querySelector("[data-flow-motion]")).toBeNull();
	});
	it.each(["completed", "stale"])("does not animate %s measured snapshots", (state) => {
		const rate = {
			uploadBytesPerSecond: 1,
			downloadBytesPerSecond: 100,
			bytesPerSecond: 101,
			smoothedBytesPerSecond: 101,
			windowStart: new Date(Date.now() - 1000).toISOString(),
			windowEnd: new Date(Date.now() - (state === "stale" ? 10000 : 0)).toISOString(),
			samples: 1,
		};
		mocks.useTrafficFlow.mockReturnValue({
			data: {
				...snapshot,
				capabilities: { currentRates: true, source: "native_http_transport" },
				hosts: [
					{
						...snapshot.hosts[0],
						clientRate: rate,
						clients: [
							{ ...snapshot.hosts[0].clients[0], rate, activeRequests: state === "completed" ? 0 : 1 },
						],
					},
				],
			},
			error: null,
			isLoading: false,
			available: true,
		});
		const { container } = render(<TrafficFlow />);
		open();
		expect(container.querySelector("[data-flow-motion]")).toBeNull();
	});

	it("pauses, resumes and provides a searchable accessible list", () => {
		render(<TrafficFlow />);
		open();
		fireEvent.click(screen.getByRole("button", { name: "Pause" }));
		expect(mocks.useTrafficFlow).toHaveBeenLastCalledWith(true);
		fireEvent.click(screen.getByRole("button", { name: "Resume" }));
		expect(mocks.useTrafficFlow).toHaveBeenLastCalledWith(false);
		fireEvent.click(screen.getByRole("button", { name: "List view" }));
		expect(screen.getByText(/9000 completed response-body bytes/)).toBeInTheDocument();
		fireEvent.change(screen.getByRole("textbox", { name: "Filter proxy hosts" }), { target: { value: "absent" } });
		expect(screen.getByText("No authorized proxy hosts match this filter.")).toBeInTheDocument();
	});
	it("hides old topology when access or the connection fails", () => {
		mocks.useTrafficFlow.mockReturnValue({
			data: snapshot,
			error: new Error("Forbidden"),
			isLoading: false,
			available: true,
		});
		render(<TrafficFlow />);
		open();
		expect(screen.getByRole("alert")).toHaveTextContent("Previous topology is hidden");
		expect(screen.queryByText("example.test, alias.test")).not.toBeInTheDocument();
	});
	it("separately exposes disabled, stale and incomplete snapshots", () => {
		mocks.useTrafficFlow.mockReturnValue({
			data: { ...snapshot, generatedAt: "2000-01-01T00:00:00Z", truncated: true },
			error: null,
			available: true,
		});
		const view = render(<TrafficFlow />);
		open();
		expect(screen.getByRole("status")).toHaveTextContent("Stale snapshot");
		expect(screen.getByRole("alert")).toHaveTextContent("snapshot is incomplete");
		mocks.useTrafficFlow.mockReturnValue({ data: { ...snapshot, enabled: false }, error: null, available: true });
		view.rerender(<TrafficFlow />);
		expect(screen.getByText(/Traffic Flow is disabled/)).toBeInTheDocument();
		expect(screen.queryByText("example.test, alias.test")).not.toBeInTheDocument();
	});
});
