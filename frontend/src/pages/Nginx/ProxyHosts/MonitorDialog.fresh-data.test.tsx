import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), check: vi.fn() }));
vi.mock("src/api/backend/proxyHostMonitor", () => ({
	getProxyHostMonitor: mocks.get,
	updateProxyHostMonitor: mocks.update,
	checkProxyHostMonitor: mocks.check,
	getProxyHostMonitorStatuses: vi.fn(),
}));
vi.mock("src/components", () => ({ HasPermission: ({ children }: PropsWithChildren) => children }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));

import { MonitorDialog } from "./MonitorDialog";

const config = {
	enabled: true,
	type: "http" as const,
	path: "/cached",
	intervalSeconds: 60,
	timeoutMs: 5000,
	expectedStatus: 200,
	alertEnabled: false,
	skipCertificateVerification: false,
	upstreamCa: null,
	upstreamServerName: null,
};
const detail = { config, status: null, history: [] };
function deferred() {
	let resolve!: (value: typeof detail) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<typeof detail>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function mountMonitor(cacheAge = 120_000) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
	client.setQueryData(["proxy-host-monitors", 7], detail, { updatedAt: Date.now() - cacheAge });
	render(
		<QueryClientProvider client={client}>
			<MonitorDialog
				hostId={7}
				domain="app.example"
				forwardScheme="http"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>
		</QueryClientProvider>,
	);
	return client;
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.update.mockResolvedValue(detail);
});
afterEach(cleanup);

it.each([0, 120_000])("waits for current monitor settings before saving (cache age %s)", async (cacheAge) => {
	const pending = deferred();
	mocks.get.mockReturnValue(pending.promise);
	mountMonitor(cacheAge);
	await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(7));
	expect(screen.queryByLabelText("proxy-host.monitor.path")).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	await act(async () => pending.resolve({ ...detail, config: { ...config, path: "/current" } }));
	expect(await screen.findByLabelText("proxy-host.monitor.path")).toHaveValue("/current");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({ path: "/current" })));
});

it("keeps edited settings through live measurements and a failed background refresh", async () => {
	mocks.get.mockResolvedValue({ ...detail, config: { ...config, path: "/current" } });
	const client = mountMonitor();
	const input = await screen.findByLabelText("proxy-host.monitor.path");
	fireEvent.change(input, { target: { value: "/draft" } });
	act(() => {
		client.setQueryData(["proxy-host-monitors", 7], {
			...detail,
			config: { ...config, path: "/later" },
			status: { state: "up", message: "Current measurement", checkedAt: "2026-10-05T00:00:00Z" },
			history: [{ id: 1, state: "up", message: "Current history", checkedAt: "2026-10-05T00:00:00Z" }],
		});
	});
	expect(await screen.findByText("Current measurement")).toBeInTheDocument();
	expect(await screen.findByText("Current history")).toBeInTheDocument();
	expect(input).toHaveValue("/draft");
	mocks.get.mockRejectedValue(new Error("Background refresh failed"));
	await act(async () => client.refetchQueries({ queryKey: ["proxy-host-monitors", 7] }));
	expect(screen.getByLabelText("proxy-host.monitor.path")).toHaveValue("/draft");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({ path: "/draft" })));
});

it("blocks stale monitor saves after an opening error and accepts a successful retry", async () => {
	const pending = deferred();
	mocks.get.mockReturnValue(pending.promise);
	const client = mountMonitor();
	await act(async () => pending.reject(new Error("Monitor could not be loaded")));
	expect(await screen.findByText("Monitor could not be loaded")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	expect(mocks.update).not.toHaveBeenCalled();
	mocks.get.mockResolvedValue({ ...detail, config: { ...config, path: "/recovered" } });
	await act(async () => client.refetchQueries({ queryKey: ["proxy-host-monitors", 7] }));
	expect(await screen.findByLabelText("proxy-host.monitor.path")).toHaveValue("/recovered");
});

it("allows creating a monitor when the current response has no saved configuration", async () => {
	mocks.get.mockResolvedValue({ config: null, status: null, history: [] });
	mountMonitor();
	const input = await screen.findByLabelText("proxy-host.monitor.path");
	expect(input).toHaveValue("/");
	fireEvent.change(input, { target: { value: "/health" } });
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({ path: "/health" })));
});
