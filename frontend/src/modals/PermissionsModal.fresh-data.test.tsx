import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), setPermissions: vi.fn(), show: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: <T,>(component: T) => component, show: mocks.show } }));
vi.mock("src/api/backend", () => ({ getUser: mocks.getUser, setPermissions: mocks.setPermissions }));
vi.mock("src/hooks", async () => ({
	...(await import("src/hooks/useUser")),
	useHealth: () => ({ data: { demo: false } }),
}));
vi.mock("src/components", () => ({ Loading: () => <div>Permissions loading</div> }));
vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => children,
	DialogFooter: ({ children }: PropsWithChildren) => children,
	DialogHeader: ({ children }: PropsWithChildren) => children,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));

import { showPermissionsModal } from "./PermissionsModal";

const cached = {
	id: 7,
	name: "User",
	roles: ["admin"],
	permissions: { visibility: "user", accessLists: "manage", certificates: "manage" },
};
const fresh = {
	...cached,
	roles: [],
	permissions: { ...cached.permissions, accessLists: "hidden", certificates: "hidden" },
};
function deferred() {
	let resolve!: (value: typeof fresh) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<typeof fresh>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
let client: QueryClient;
function mount() {
	client.setQueryData(["user", 7], cached);
	showPermissionsModal(7);
	const [Modal, props] = mocks.show.mock.calls[0];
	render(
		<QueryClientProvider client={client}>
			<Modal {...props} visible remove={vi.fn()} />
		</QueryClientProvider>,
	);
}
function accessControl(text: string) {
	const section = screen.getByText("access-lists").closest("div");
	if (!section) throw new Error("Access permission section is missing");
	return within(section).getByText(text);
}
beforeEach(() => {
	vi.clearAllMocks();
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	mocks.setPermissions.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	client.clear();
});

it("waits for opening roles and capabilities and saves the fresh pristine permissions", async () => {
	const pending = deferred();
	mocks.getUser.mockReturnValue(pending.promise);
	mount();
	await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	await act(async () => pending.resolve(fresh));
	await screen.findByText("access-lists");
	expect(accessControl("permissions.hidden")).toHaveAttribute("data-state", "on");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.setPermissions).toHaveBeenCalled());
	expect(mocks.setPermissions.mock.calls[0]).toEqual([
		7,
		expect.objectContaining({ accessLists: "hidden", certificates: "hidden" }),
	]);
});

it("preserves changed capabilities through cache updates and a background error before save", async () => {
	mocks.getUser.mockResolvedValue(fresh);
	mount();
	await screen.findByText("access-lists");
	fireEvent.click(accessControl("permissions.view"));
	act(() => client.setQueryData(["user", 7], cached));
	mocks.getUser.mockRejectedValue(new Error("Background permission fetch failed"));
	await act(async () => {
		await client.refetchQueries({ queryKey: ["user", 7] });
	});
	expect(accessControl("permissions.view")).toHaveAttribute("data-state", "on");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.setPermissions).toHaveBeenCalled());
	expect(mocks.setPermissions.mock.calls[0]).toEqual([
		7,
		expect.objectContaining({ accessLists: "view", certificates: "hidden" }),
	]);
});

it("blocks cached permission saves after the opening request fails", async () => {
	const pending = deferred();
	mocks.getUser.mockReturnValue(pending.promise);
	mount();
	await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
	await act(async () => pending.reject(new Error("Opening permission fetch failed")));
	expect(await screen.findByText("Opening permission fetch failed")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	expect(mocks.setPermissions).not.toHaveBeenCalled();
});
