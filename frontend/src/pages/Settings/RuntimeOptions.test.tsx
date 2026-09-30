import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CertificateOptionsCard from "./CertificateOptionsCard";
import Network from "./Network";

const api = vi.hoisted(() => ({
	getCertificateOptions: vi.fn(),
	updateCertificateOptions: vi.fn(),
	getIpRangesOptions: vi.fn(),
	updateIpRangesOptions: vi.fn(),
}));
vi.mock("src/api/backend/runtimeOptions", () => api);
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("src/components/Loading", () => ({ Loading: () => <div role="status">Loading options</div> }));
vi.mock("src/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		disabled,
	}: PropsWithChildren<{ value: string; onValueChange: (value: string) => void; disabled?: boolean }>) => (
		<select
			id="certificateKeyType"
			value={value}
			disabled={disabled}
			onChange={(event) => onValueChange(event.target.value)}
		>
			<option value="ecdsa">ECDSA</option>
			<option value="rsa">RSA</option>
		</select>
	),
	SelectContent: () => null,
	SelectItem: () => null,
	SelectTrigger: () => null,
	SelectValue: () => null,
}));

const clients: QueryClient[] = [];
function setup(network = false) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	render(
		<QueryClientProvider client={client}>{network ? <Network /> : <CertificateOptionsCard />}</QueryClientProvider>,
	);
	return client;
}
beforeEach(() => {
	vi.resetAllMocks();
	api.getCertificateOptions.mockResolvedValue({ keyType: "ecdsa", renewalIntervalHours: 12 });
	api.getIpRangesOptions.mockResolvedValue({ enabled: true, refreshIntervalHours: 168 });
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

describe("runtime settings cards", () => {
	it.each([false, true])(
		"does not offer guessed options while the first lookup is pending (network=%s)",
		async (network) => {
			let resolve: (value: object) => void = () => undefined;
			const get = network ? api.getIpRangesOptions : api.getCertificateOptions;
			get.mockReturnValue(
				new Promise((done) => {
					resolve = done;
				}),
			);
			setup(network);
			expect(screen.getByRole("status")).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
			await act(async () =>
				resolve(
					network
						? { enabled: false, refreshIntervalHours: 24 }
						: { keyType: "rsa", renewalIntervalHours: 6 },
				),
			);
			expect(await screen.findByRole("button", { name: "save" })).toBeDisabled();
		},
	);
	it.each([false, true])(
		"shows initial loading errors without editable guessed values (network=%s)",
		async (network) => {
			(network ? api.getIpRangesOptions : api.getCertificateOptions).mockRejectedValue(
				new Error("Options unavailable"),
			);
			setup(network);
			expect(await screen.findByText("Options unavailable")).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		},
	);
	it("saves key type and a check interval independently with controls locked while pending", async () => {
		let resolve: (value: object) => void = () => undefined;
		api.updateCertificateOptions.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const client = setup();
		const key = await screen.findByLabelText("settings.certificates.key-type");
		const interval = screen.getByLabelText("settings.certificates.renewal-interval");
		fireEvent.change(key, { target: { value: "rsa" } });
		fireEvent.change(interval, { target: { value: "6" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() =>
			expect(api.updateCertificateOptions).toHaveBeenCalledWith(
				{ keyType: "rsa", renewalIntervalHours: 6 },
				expect.anything(),
			),
		);
		expect(key).toBeDisabled();
		expect(interval).toBeDisabled();
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		await act(async () => resolve({ keyType: "rsa", renewalIntervalHours: 6 }));
		await waitFor(() => expect(key).toBeEnabled());
		expect(client.getQueryData(["certificate-options"])).toEqual({ keyType: "rsa", renewalIntervalHours: 6 });
		expect(api.updateIpRangesOptions).not.toHaveBeenCalled();
	});
	it.each(["", "0", "13", "1.5"])(
		"rejects a certificate check interval of '%s' before submitting",
		async (interval) => {
			setup();
			await screen.findByLabelText("settings.certificates.key-type");
			fireEvent.change(screen.getByLabelText("settings.certificates.renewal-interval"), {
				target: { value: interval },
			});
			expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
			expect(api.updateCertificateOptions).not.toHaveBeenCalled();
		},
	);
	it("preserves a selected refresh interval when disabling automatic downloads", async () => {
		api.getIpRangesOptions.mockResolvedValue({ enabled: false, refreshIntervalHours: 168 });
		api.updateIpRangesOptions.mockResolvedValue({ enabled: false, refreshIntervalHours: 12 });
		setup(true);
		const interval = await screen.findByLabelText("settings.network.ip-ranges-interval");
		expect(interval).toBeEnabled();
		expect(interval).toHaveValue(168);
		fireEvent.click(screen.getByRole("switch"));
		expect(interval).toBeEnabled();
		fireEvent.change(interval, { target: { value: "12" } });
		fireEvent.click(screen.getByRole("switch"));
		expect(interval).toBeEnabled();
		expect(interval).toHaveValue(12);
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() =>
			expect(api.updateIpRangesOptions).toHaveBeenCalledWith(
				{ enabled: false, refreshIntervalHours: 12 },
				expect.anything(),
			),
		);
		expect(api.updateCertificateOptions).not.toHaveBeenCalled();
	});
	it("allows correcting an invalid interval after automatic downloads are switched off", async () => {
		api.updateIpRangesOptions.mockResolvedValue({ enabled: false, refreshIntervalHours: 24 });
		setup(true);
		const interval = await screen.findByLabelText("settings.network.ip-ranges-interval");
		fireEvent.change(interval, { target: { value: "" } });
		fireEvent.click(screen.getByRole("switch"));
		expect(interval).toBeEnabled();
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		fireEvent.change(interval, { target: { value: "24" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(api.updateIpRangesOptions).toHaveBeenCalled());
		expect(api.updateIpRangesOptions.mock.calls[0][0]).toEqual({ enabled: false, refreshIntervalHours: 24 });
	});
	it.each(["", "0", "5", "7", "600"])(
		"rejects a Cloudflare refresh interval of '%s' before submitting",
		async (interval) => {
			setup(true);
			await screen.findByRole("switch");
			fireEvent.change(screen.getByLabelText("settings.network.ip-ranges-interval"), {
				target: { value: interval },
			});
			expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
			expect(api.updateIpRangesOptions).not.toHaveBeenCalled();
		},
	);
	it("keeps unsaved network choices across refreshes and failed saves", async () => {
		const client = setup(true);
		const interval = await screen.findByLabelText("settings.network.ip-ranges-interval");
		fireEvent.change(interval, { target: { value: "12" } });
		api.getIpRangesOptions.mockResolvedValue({ enabled: false, refreshIntervalHours: 24 });
		await act(async () => {
			await client.refetchQueries({ queryKey: ["ip-ranges-options"] });
		});
		expect(interval).toHaveValue(12);
		expect(interval).toBeEnabled();
		api.updateIpRangesOptions.mockRejectedValue(new Error("Save failed"));
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(await screen.findByText("Save failed")).toBeInTheDocument();
		expect(interval).toHaveValue(12);
		expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
	});
});
