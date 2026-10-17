import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import messages from "src/locale/lang/en.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getWorkspaceHosts: vi.fn(),
	getWorkspaceItems: vi.fn(),
	saveWorkspaceItem: vi.fn(),
	removeWorkspaceItem: vi.fn(),
	setWorkspaceTags: vi.fn(),
	previewHostProfile: vi.fn(),
	applyHostProfile: vi.fn(),
}));
vi.mock("src/api/backend/hostWorkspace", () => api);
vi.mock("src/components", () => ({ HasPermission: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => (messages as Record<string, string>)[id] || id },
}));

import HostWorkspace from "./index";

let queryClient: QueryClient;
const renderWorkspace = () => {
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<HostWorkspace />
			</MemoryRouter>
		</QueryClientProvider>,
	);
};
afterEach(() => {
	cleanup();
	queryClient?.clear();
});
beforeEach(() => {
	vi.resetAllMocks();
	api.getWorkspaceHosts.mockResolvedValue({
		items: [
			{ id: 1, domainNames: ["one.example"], tags: ["prod"], enabled: true },
			{ id: 2, domainNames: ["two.example"], tags: [], enabled: false },
		],
		pagination: { totalPages: 1, totalItems: 2 },
	});
	api.getWorkspaceItems.mockResolvedValue([
		{ id: 10, kind: "profile", name: "Shield", definition: { settings: { blockExploits: true } } },
		{ id: 11, kind: "view", name: "Production", definition: { tags: ["prod"], monitor: "down" } },
	]);
	api.previewHostProfile.mockResolvedValue({
		plan: "reviewed-plan",
		results: [
			{ id: 1, ready: true, before: { blockExploits: false }, after: { blockExploits: true } },
			{ id: 2, ready: false, error: "Permission denied" },
		],
	});
	api.applyHostProfile.mockResolvedValue({
		activated: true,
		results: [
			{ id: 1, success: true },
			{ id: 2, success: false, error: "Host changed; preview again" },
		],
	});
});
describe("host workspace user workflows", () => {
	it("requires an explicit review before activation and displays per-host failures", async () => {
		renderWorkspace();
		await screen.findByText("one.example");
		fireEvent.click(screen.getByRole("checkbox", { name: "Select one.example" }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Select two.example" }));
		fireEvent.change(screen.getByLabelText("Saved profile"), { target: { value: "10" } });
		expect(screen.queryByRole("button", { name: "Apply reviewed changes" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
		expect(await screen.findByText(/Permission denied/)).toBeInTheDocument();
		expect(api.previewHostProfile).toHaveBeenCalledWith(10, [1, 2]);
		expect(api.applyHostProfile).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Apply reviewed changes" }));
		expect(await screen.findByText(/Host changed; preview again/)).toBeInTheDocument();
		expect(api.applyHostProfile).toHaveBeenCalledWith("reviewed-plan");
		expect(screen.queryByRole("button", { name: "Apply reviewed changes" })).not.toBeInTheDocument();
	});
	it("loads saved filters and retains typed comma-separated tags", async () => {
		renderWorkspace();
		fireEvent.click(await screen.findByRole("button", { name: "Production" }));
		expect(screen.getByLabelText("Tags")).toHaveValue("prod");
		expect(screen.getByLabelText("Monitoring state")).toHaveValue("down");
		fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "prod, media," } });
		expect(screen.getByLabelText("Tags")).toHaveValue("prod, media,");
		await waitFor(() =>
			expect(api.getWorkspaceHosts).toHaveBeenLastCalledWith(
				{ tags: ["prod", "media"], monitor: "down" },
				1,
				expect.any(AbortSignal),
			),
		);
	});
	it("reports tag failures without discarding other successful changes", async () => {
		api.setWorkspaceTags.mockImplementation(async (id: number) => {
			if (id === 2) throw new Error("Permission changed");
			return {};
		});
		renderWorkspace();
		await screen.findByText("one.example");
		fireEvent.click(screen.getByRole("button", { name: "Select this page" }));
		fireEvent.change(screen.getByLabelText("Replace tags on selected hosts"), {
			target: { value: "MEDIA, prod, media" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Apply tags" }));
		expect(await screen.findByText(/2: Permission changed/)).toBeInTheDocument();
		expect(api.setWorkspaceTags.mock.calls).toEqual([
			[1, ["media", "prod"]],
			[2, ["media", "prod"]],
		]);
	});
	it("invalidates a reviewed plan when host selection changes", async () => {
		renderWorkspace();
		await screen.findByText("one.example");
		fireEvent.click(screen.getByRole("checkbox", { name: "Select one.example" }));
		fireEvent.change(screen.getByLabelText("Saved profile"), { target: { value: "10" } });
		fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
		await screen.findByRole("button", { name: "Apply reviewed changes" });
		fireEvent.click(screen.getByRole("checkbox", { name: "Select two.example" }));
		expect(screen.queryByRole("button", { name: "Apply reviewed changes" })).not.toBeInTheDocument();
		expect(api.applyHostProfile).not.toHaveBeenCalled();
	});
	it("discards a late preview after the selected hosts change", async () => {
		let resolvePreview!: (value: unknown) => void;
		api.previewHostProfile.mockReturnValue(
			new Promise((resolve) => {
				resolvePreview = resolve;
			}),
		);
		renderWorkspace();
		await screen.findByText("one.example");
		fireEvent.click(screen.getByRole("checkbox", { name: "Select one.example" }));
		fireEvent.change(screen.getByLabelText("Saved profile"), { target: { value: "10" } });
		fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
		await waitFor(() => expect(api.previewHostProfile).toHaveBeenCalled());
		fireEvent.click(screen.getByRole("checkbox", { name: "Select two.example" }));
		resolvePreview({
			plan: "obsolete",
			results: [{ id: 1, ready: true, before: {}, after: { blockExploits: true } }],
		});
		await waitFor(() => expect(screen.getByRole("button", { name: "Preview changes" })).toBeEnabled());
		expect(screen.queryByRole("button", { name: "Apply reviewed changes" })).not.toBeInTheDocument();
	});
});
