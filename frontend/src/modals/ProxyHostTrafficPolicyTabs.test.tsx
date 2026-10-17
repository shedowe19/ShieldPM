import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { Tabs } from "src/components/ui/tabs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ purge: vi.fn(), manage: true }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <>{id}</> }));
vi.mock("src/hooks/useHostTrafficPolicy", () => ({
	useUpstreamPoolStatus: () => ({ data: { targets: [] }, isError: false }),
	useHostCacheStatus: () => ({ data: { enabled: true, hitRatio: 0.5, sampleRequests: 42 }, isError: false }),
	usePurgeHostCache: () => ({ mutate: state.purge, isPending: false, isSuccess: false, isError: false }),
}));
vi.mock("src/hooks/useUser", () => ({
	useUser: () => ({
		isLoading: false,
		data: { roles: [], permissions: { proxyHosts: state.manage ? "manage" : "view" } },
	}),
}));

import ProxyHostCacheTab from "./ProxyHostCacheTab";
import ProxyHostUpstreamPoolTab from "./ProxyHostUpstreamPoolTab";

const initial = {
	forwardScheme: "http",
	forwardHost: "127.0.0.1",
	forwardPort: 8080,
	cachingEnabled: false,
	meta: { retained: { opaque: 7 }, ipFirewall: { enabled: true } },
};
beforeEach(() => {
	state.purge.mockReset();
	state.manage = true;
});
afterEach(cleanup);
describe("structured proxy traffic editors", () => {
	it("keeps unknown metadata while editing weighted pool targets in a real Formik form", async () => {
		const submitted = vi.fn();
		render(
			<Formik initialValues={initial} onSubmit={submitted}>
				<Form>
					<Tabs defaultValue="upstream-pool">
						<ProxyHostUpstreamPoolTab hostId={null} />
					</Tabs>
					<button type="submit">save</button>
				</Form>
			</Formik>,
		);
		fireEvent.click(screen.getByRole("button", { name: "traffic.pool.add" }));
		fireEvent.change(screen.getByLabelText("traffic.pool.host"), { target: { value: "::1" } });
		fireEvent.change(screen.getByLabelText("traffic.pool.weight"), { target: { value: "9" } });
		fireEvent.click(screen.getByRole("switch", { name: "traffic.pool.enabled" }));
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(submitted).toHaveBeenCalled());
		expect(submitted.mock.calls[0][0].meta).toMatchObject({
			retained: { opaque: 7 },
			ipFirewall: { enabled: true },
			upstreamPool: { enabled: true, targets: [{ host: "::1", weight: 9, backup: false }] },
		});
	});
	it("retains typed cache prefixes and per-route TTLs without replacing unrelated metadata", async () => {
		const submitted = vi.fn();
		render(
			<Formik initialValues={initial} onSubmit={submitted}>
				<Form>
					<Tabs defaultValue="cache">
						<ProxyHostCacheTab hostId={null} />
					</Tabs>
					<button type="submit">save</button>
				</Form>
			</Formik>,
		);
		fireEvent.change(screen.getByLabelText("traffic.cache.route"), { target: { value: "/assets/" } });
		fireEvent.change(screen.getByLabelText("traffic.cache.ttl"), { target: { value: "120" } });
		fireEvent.click(screen.getByRole("switch", { name: "traffic.cache.enabled" }));
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(submitted).toHaveBeenCalled());
		expect(submitted.mock.calls[0][0]).toMatchObject({
			cachingEnabled: true,
			meta: {
				retained: { opaque: 7 },
				ipFirewall: { enabled: true },
				cachePolicy: { enabled: true, routes: [{ path: "/assets/", ttlSeconds: 120 }] },
			},
		});
	});
	it("shows owner-authorized cache purge only to host managers and forwards an exact URI", async () => {
		const renderForm = () =>
			render(
				<Formik initialValues={initial} onSubmit={() => {}}>
					<Form>
						<Tabs defaultValue="cache">
							<ProxyHostCacheTab hostId={12} />
						</Tabs>
					</Form>
				</Formik>,
			);
		const shown = renderForm();
		fireEvent.change(screen.getByLabelText("traffic.cache.purge-path"), { target: { value: "/app.js?v=2" } });
		fireEvent.click(screen.getByRole("button", { name: "traffic.cache.purge" }));
		expect(state.purge).toHaveBeenCalledWith("/app.js?v=2");
		shown.unmount();
		state.manage = false;
		renderForm();
		expect(screen.queryByRole("button", { name: "traffic.cache.purge" })).not.toBeInTheDocument();
	});
});
