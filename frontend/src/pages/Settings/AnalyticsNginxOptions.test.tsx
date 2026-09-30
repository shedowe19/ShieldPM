import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Analytics from "./Analytics";
import Nginx from "./Nginx";

const api = vi.hoisted(() => ({
	getCertificateOptions: vi.fn(),
	updateCertificateOptions: vi.fn(),
	getIpRangesOptions: vi.fn(),
	updateIpRangesOptions: vi.fn(),
	getAnalyticsOptions: vi.fn(),
	updateAnalyticsOptions: vi.fn(),
	getNginxOptions: vi.fn(),
	updateNginxOptions: vi.fn(),
}));
vi.mock("src/api/backend/runtimeOptions", () => api);
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("src/components/Loading", () => ({ Loading: () => <div role="status">Loading options</div> }));

const clients: QueryClient[] = [];
const initialAnalytics = { detailedRetentionHours: 24, aggregationRetentionDays: 35 };
function setup(nginx = false) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	render(<QueryClientProvider client={client}>{nginx ? <Nginx /> : <Analytics />}</QueryClientProvider>);
	return client;
}
beforeEach(() => {
	vi.resetAllMocks();
	api.getAnalyticsOptions.mockResolvedValue(initialAnalytics);
	api.getNginxOptions.mockResolvedValue({ beautifierEnabled: false });
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

describe("analytics and Nginx options", () => {
	it.each([false, true])("does not guess options before the initial GET (nginx=%s)", async (nginx) => {
		let resolve: (value: object) => void = () => undefined;
		(nginx ? api.getNginxOptions : api.getAnalyticsOptions).mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		setup(nginx);
		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
		expect(screen.queryByRole("switch")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		await act(async () =>
			resolve(nginx ? { beautifierEnabled: true } : { detailedRetentionHours: 48, aggregationRetentionDays: 90 }),
		);
		expect(await screen.findByRole("button", { name: "save" })).toBeDisabled();
		if (nginx) expect(screen.getByRole("switch")).toBeChecked();
		else expect(screen.getByLabelText("settings.analytics.detailed-hours")).toHaveValue(48);
	});

	it.each([false, true])("shows a failed initial GET without replacement values (nginx=%s)", async (nginx) => {
		(nginx ? api.getNginxOptions : api.getAnalyticsOptions).mockRejectedValue(new Error("Options unavailable"));
		setup(nginx);
		expect(await screen.findByText("Options unavailable")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
		expect(screen.queryByRole("switch")).not.toBeInTheDocument();
	});

	it("saves both analytics periods with their separate units and locks fields while pending", async () => {
		let resolve: (value: object) => void = () => undefined;
		api.updateAnalyticsOptions.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const client = setup();
		const details = await screen.findByLabelText("settings.analytics.detailed-hours");
		const aggregates = screen.getByLabelText("settings.analytics.aggregation-days");
		fireEvent.change(details, { target: { value: "12" } });
		fireEvent.change(aggregates, { target: { value: "7" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(api.updateAnalyticsOptions).toHaveBeenCalled());
		expect(api.updateAnalyticsOptions.mock.calls[0][0]).toEqual({
			detailedRetentionHours: 12,
			aggregationRetentionDays: 7,
		});
		expect(details).toBeDisabled();
		expect(aggregates).toBeDisabled();
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		await act(async () => resolve({ detailedRetentionHours: 12, aggregationRetentionDays: 7 }));
		await waitFor(() => expect(details).toBeEnabled());
		expect(client.getQueryData(["analytics-options"])).toEqual({
			detailedRetentionHours: 12,
			aggregationRetentionDays: 7,
		});
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		expect(api.updateNginxOptions).not.toHaveBeenCalled();
	});

	it("saves the Nginx toggle independently and locks it while pending", async () => {
		let resolve: (value: object) => void = () => undefined;
		api.updateNginxOptions.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const client = setup(true);
		const toggle = await screen.findByRole("switch");
		fireEvent.click(toggle);
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(api.updateNginxOptions).toHaveBeenCalled());
		expect(api.updateNginxOptions.mock.calls[0][0]).toEqual({ beautifierEnabled: true });
		expect(toggle).toBeDisabled();
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		await act(async () => resolve({ beautifierEnabled: true }));
		await waitFor(() => expect(toggle).toBeEnabled());
		expect(client.getQueryData(["nginx-options"])).toEqual({ beautifierEnabled: true });
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		expect(api.updateAnalyticsOptions).not.toHaveBeenCalled();
	});

	it.each(["settings.analytics.detailed-hours", "settings.analytics.aggregation-days"])(
		"rejects invalid %s without submitting",
		async (label) => {
			setup();
			const input = await screen.findByLabelText(label);
			for (const value of ["", "0", "-1", "1.5", "9007199254740992"]) {
				fireEvent.change(input, { target: { value } });
				expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
			}
			expect(api.updateAnalyticsOptions).not.toHaveBeenCalled();
		},
	);

	it("accepts upgraded large safe retention values and prompts review at the migration sentinel", async () => {
		api.getAnalyticsOptions.mockResolvedValue({
			detailedRetentionHours: Number.MAX_SAFE_INTEGER,
			aggregationRetentionDays: 100000,
		});
		api.updateAnalyticsOptions.mockResolvedValue({
			detailedRetentionHours: 100000,
			aggregationRetentionDays: 100001,
		});
		setup();
		const details = await screen.findByLabelText("settings.analytics.detailed-hours");
		expect(details).toHaveValue(Number.MAX_SAFE_INTEGER);
		expect(screen.getByText("settings.analytics.retention-review")).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("settings.analytics.aggregation-days"), { target: { value: "100001" } });
		expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
		fireEvent.change(details, { target: { value: "100000" } });
		expect(screen.queryByText("settings.analytics.retention-review")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(api.updateAnalyticsOptions).toHaveBeenCalled());
		expect(api.updateAnalyticsOptions.mock.calls[0][0]).toEqual({
			detailedRetentionHours: 100000,
			aggregationRetentionDays: 100001,
		});
	});

	it.each([false, true])(
		"preserves a dirty draft across refreshed data and save errors (nginx=%s)",
		async (nginx) => {
			const client = setup(nginx);
			await screen.findByRole("button", { name: "save" });
			if (nginx) fireEvent.click(screen.getByRole("switch"));
			else
				fireEvent.change(screen.getByLabelText("settings.analytics.detailed-hours"), {
					target: { value: "72" },
				});
			const get = nginx ? api.getNginxOptions : api.getAnalyticsOptions;
			get.mockResolvedValue(
				nginx ? { beautifierEnabled: false } : { detailedRetentionHours: 48, aggregationRetentionDays: 90 },
			);
			await act(async () => {
				await client.refetchQueries({ queryKey: [nginx ? "nginx-options" : "analytics-options"] });
			});
			(nginx ? api.updateNginxOptions : api.updateAnalyticsOptions).mockRejectedValue(new Error("Save failed"));
			fireEvent.click(screen.getByRole("button", { name: "save" }));
			expect(await screen.findByText("Save failed")).toBeInTheDocument();
			if (nginx) expect(screen.getByRole("switch")).toBeChecked();
			else {
				expect(screen.getByLabelText("settings.analytics.detailed-hours")).toHaveValue(72);
				expect(screen.getByLabelText("settings.analytics.aggregation-days")).toHaveValue(35);
			}
			expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
		},
	);
});
