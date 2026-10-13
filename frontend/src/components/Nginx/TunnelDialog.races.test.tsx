import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TorOnion, WireguardPeer } from "@/api/backend";
import { TorOnionModal } from "./TorOnionModal";
import { WireguardPeerModal } from "./WireguardPeerModal";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), getPeers: vi.fn(), onCreated: vi.fn() }));
vi.mock("@/api/backend", () => ({
	createTorOnion: mocks.create,
	updateTorOnion: mocks.update,
	createWireguardPeer: mocks.create,
	updateWireguardPeer: mocks.update,
}));
vi.mock("@/api/backend/getWireguardPeers", () => ({ getWireguardPeers: mocks.getPeers }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));

const cases = [
	{ kind: "Tor", editing: false, label: "name" },
	{ kind: "Tor", editing: true, label: "name" },
	{ kind: "WireGuard", editing: false, label: "wireguard.peer.name" },
	{ kind: "WireGuard", editing: true, label: "wireguard.peer.name" },
] as const;
const clients: QueryClient[] = [];
beforeEach(() => {
	vi.resetAllMocks();
	mocks.getPeers.mockResolvedValue({ peers: [], server: { subnet: "10.9.0.0/24" } });
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

function mount(testCase: (typeof cases)[number]) {
	function ControlledDialog({ revision }: { revision: number }) {
		const [open, setOpen] = useState(true);
		const [selected, setSelected] = useState(false);
		const entity =
			selected || testCase.editing
				? { id: selected ? 2 : 1, name: `Saved ${revision}`, virtualPort: 80, targetPort: 80 }
				: null;
		return (
			<>
				<button
					type="button"
					onClick={() => {
						setSelected(true);
						setOpen(true);
					}}
				>
					Open other draft
				</button>
				{testCase.kind === "Tor" ? (
					<TorOnionModal open={open} onOpenChange={setOpen} service={entity as TorOnion | null} />
				) : (
					<WireguardPeerModal
						open={open}
						onOpenChange={setOpen}
						peer={entity as WireguardPeer | null}
						onCreated={mocks.onCreated}
					/>
				)}
			</>
		);
	}
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	clients.push(client);
	const content = (revision: number) => (
		<QueryClientProvider client={client}>
			<ControlledDialog revision={revision} />
		</QueryClientProvider>
	);
	const view = render(content(0));
	return { ...view, refresh: () => view.rerender(content(1)) };
}

it.each(cases)(
	"keeps a later $kind draft open after an earlier mutation settles (editing: $editing)",
	async (testCase) => {
		let finish!: (value: unknown) => void;
		const pending = new Promise((resolve) => {
			finish = resolve;
		});
		mocks.create.mockReturnValue(pending);
		mocks.update.mockReturnValue(pending);
		mount(testCase);
		fireEvent.change(screen.getByLabelText(testCase.label), { target: { value: "First draft" } });
		await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(testCase.editing ? mocks.update : mocks.create).toHaveBeenCalledTimes(1));
		fireEvent.click(screen.getByRole("button", { name: "cancel" }));
		fireEvent.click(screen.getByRole("button", { name: "Open other draft" }));
		const input = screen.getByLabelText(testCase.label);
		fireEvent.change(input, { target: { value: "Later draft" } });
		await act(async () => {
			finish({ id: 9, name: "First draft" });
		});
		await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
		expect(screen.getByLabelText(testCase.label)).toBe(input);
		expect(input).toHaveValue("Later draft");
		expect(mocks.onCreated).not.toHaveBeenCalled();
	},
);

it.each(cases.filter(({ editing }) => editing))(
	"preserves a $kind draft and its pending save across same-ID prop refreshes",
	async (testCase) => {
		let finish!: (value: unknown) => void;
		mocks.update.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		const view = mount(testCase);
		const input = screen.getByLabelText(testCase.label);
		fireEvent.change(input, { target: { value: "My draft" } });
		view.refresh();
		expect(input).toHaveValue("My draft");
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
		view.refresh();
		expect(input).toHaveValue("My draft");
		await act(async () => {
			finish({ id: 1, name: "My draft" });
		});
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
	},
);

it.each(cases)(
	"closes the current $kind dialog after its own mutation succeeds (editing: $editing)",
	async (testCase) => {
		mocks.create.mockResolvedValue({ id: 9, name: "Created" });
		mocks.update.mockResolvedValue({ id: 1, name: "Updated" });
		mount(testCase);
		fireEvent.change(screen.getByLabelText(testCase.label), { target: { value: "Current draft" } });
		await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		if (testCase.kind === "WireGuard" && !testCase.editing) expect(mocks.onCreated).toHaveBeenCalledTimes(1);
	},
);
