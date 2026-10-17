import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "./messages.json";

const state = vi.hoisted(() => ({
	detail: null as any,
	targets: [] as any[],
	deliveries: [] as any[],
	save: vi.fn(),
	mute: vi.fn(),
	retry: vi.fn(),
	remove: vi.fn(),
}));
vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: {
		formatMessage: ({ id }: { id: string }) => {
			const key = id.replace("incidents.", "") as keyof typeof messages.incidents;
			return messages.incidents[key] || id;
		},
	},
}));
vi.mock("src/hooks/useIncidents", () => ({
	useIncidentCenter: (hostId: number) => {
		const query = (data: unknown) => ({ data, error: null, isLoading: false, refetch: vi.fn() });
		return {
			hosts: query([{ id: 11, domainNames: ["site.example"], enabled: true, owned: true }]),
			incidents: query([
				{
					id: 4,
					hostId: 11,
					openedAt: "2026-10-17T10:00:00Z",
					resolvedAt: null,
					failureCount: 3,
					message: "HTTP 503",
				},
			]),
			detail: query(hostId ? state.detail : null),
			targets: query(state.targets),
			deliveries: query(state.deliveries),
		};
	},
	useIncidentActions: () => ({
		saveTarget: { mutate: state.save },
		mute: { mutate: state.mute },
		retry: { mutate: state.retry },
		deleteTarget: { mutate: state.remove },
	}),
}));

import { IncidentCenterContent, LatencyChart } from "./index";

describe("Incident center workflows", () => {
	afterEach(() => cleanup());
	beforeEach(() => {
		vi.clearAllMocks();
		state.targets = [];
		state.deliveries = [];
		state.detail = {
			daily: [{ day: "2026-10-17", uptimePercent: null, coveragePercent: 0, unknownMs: 43200000, downMs: 0 }],
			latency: [],
			mute: null,
		};
	});
	it("renders unknown measurement coverage and keeps a latency gap separate", async () => {
		render(<IncidentCenterContent />);
		fireEvent.click(screen.getByRole("button", { name: "site.example" }));
		expect(await screen.findByText("0.00%")).toBeInTheDocument();
		expect(screen.getByText("12h 0m 0s")).toBeInTheDocument();
		expect(screen.getByText(messages.incidents.availabilityHelp)).toBeInTheDocument();
		const { container } = render(
			<LatencyChart
				data={[
					{ bucket: "2026-10-17T10:00:00Z", avgMs: 20, maxMs: 30, minMs: 10, samples: 1 },
					{ bucket: "2026-10-17T11:00:00Z", avgMs: 30, maxMs: 40, minMs: 20, samples: 1 },
				]}
			/>,
		);
		expect(container.querySelectorAll("polyline")).toHaveLength(2);
	});
	it("creates a real channel payload with a selected public endpoint", async () => {
		render(<IncidentCenterContent />);
		fireEvent.click(screen.getByRole("button", { name: "Add channel" }));
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Operations" } });
		fireEvent.change(screen.getByLabelText("HTTPS endpoint"), {
			target: { value: "https://notify.example/events" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(state.save).toHaveBeenCalledWith(
			{
				id: undefined,
				data: {
					name: "Operations",
					type: "webhook",
					enabled: true,
					hostIds: [],
					url: "https://notify.example/events",
				},
			},
			expect.any(Object),
		);
	});
	it("retains hidden endpoint/token on edit and carries the target version", () => {
		state.targets = [
			{ id: 8, name: "Existing", type: "ntfy", enabled: true, hostIds: [], hasCredentials: true, version: 3 },
		];
		render(<IncidentCenterContent />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		expect(screen.getByLabelText("HTTPS endpoint")).toHaveValue("");
		expect(screen.getByLabelText("Bearer token (optional)")).toHaveValue("");
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(state.save.mock.calls[0][0]).toEqual({
			id: 8,
			data: { name: "Renamed", type: "ntfy", enabled: true, hostIds: [], version: 3 },
		});
	});
	it("preserves a mute draft through polling, submits timezone-aware dates and can clear it", async () => {
		state.detail.mute = { startsAt: "2026-10-17T15:00:00Z", endsAt: "2026-10-17T16:00:00Z", reason: "Deploy" };
		const { rerender } = render(<IncidentCenterContent />);
		fireEvent.click(screen.getByRole("button", { name: "site.example" }));
		const reason = await screen.findByLabelText("Reason");
		fireEvent.change(reason, { target: { value: "My unsaved draft" } });
		state.detail = structuredClone(state.detail);
		rerender(<IncidentCenterContent />);
		expect(screen.getByLabelText("Reason")).toHaveValue("My unsaved draft");
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(state.mute).toHaveBeenCalledWith({
				hostId: 11,
				mute: {
					startsAt: "2026-10-17T15:00:00.000Z",
					endsAt: "2026-10-17T16:00:00.000Z",
					reason: "My unsaved draft",
				},
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "Clear mute" }));
		expect(state.mute).toHaveBeenLastCalledWith({ hostId: 11, mute: null });
	});
	it("shows delivery failures and exposes a concrete retry action", () => {
		state.deliveries = [
			{
				id: 23,
				hostId: 11,
				targetName: "Operations",
				status: "failed",
				attempts: 5,
				createdOn: "2026-10-17T11:00:00Z",
				lastError: "Notification endpoint returned HTTP 503",
			},
		];
		render(<IncidentCenterContent />);
		expect(screen.getByText("Notification endpoint returned HTTP 503")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(state.retry).toHaveBeenCalledWith(23);
	});
});
