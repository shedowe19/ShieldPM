import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudflaredTunnel } from "@/api/backend";
import { CloudflaredTunnelModal } from "./CloudflaredTunnelModal";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), changeOpen: vi.fn() }));
vi.mock("@/hooks/useCloudflaredTunnel", () => ({
	useCloudflaredTunnel: () => ({ create: { mutate: mocks.create }, update: { mutate: mocks.update } }),
}));
vi.mock("@/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
const tunnel = { id: 1, name: "Saved tunnel", hasToken: true, status: 0, meta: {} } as CloudflaredTunnel;
const renderModal = () => render(<CloudflaredTunnelModal open onOpenChange={mocks.changeOpen} tunnel={tunnel} />);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const submit = async () => {
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
};

describe("Cloudflare secret replacement and dialog lifetime", () => {
	it("submits a rename without its configured connector token", async () => {
		renderModal();
		const token = screen.getByLabelText("cloudflared.token");
		expect(token).toHaveValue("");
		expect(token).toHaveAttribute("placeholder", "form.secret.keep-existing");
		await submit();
		expect(mocks.update.mock.calls[0][0]).toEqual({ id: 1, data: { name: "Saved tunnel" } });
	});
	it("requires a token when creating a new tunnel", async () => {
		render(<CloudflaredTunnelModal open onOpenChange={mocks.changeOpen} />);
		fireEvent.change(screen.getByLabelText("name"), { target: { value: "New tunnel" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(await screen.findByText("error.required_field")).toBeInTheDocument();
		expect(mocks.create).not.toHaveBeenCalled();
	});
	it("keeps an unsaved draft when the same tunnel list refreshes", () => {
		const { rerender } = renderModal();
		fireEvent.change(screen.getByLabelText("name"), { target: { value: "Unsaved draft" } });
		rerender(
			<CloudflaredTunnelModal
				open
				onOpenChange={mocks.changeOpen}
				tunnel={{ ...tunnel, name: "Background refresh" }}
			/>,
		);
		expect(screen.getByLabelText("name")).toHaveValue("Unsaved draft");
	});
	it("does not close a reopened or changed dialog after an older mutation finishes", async () => {
		const { rerender } = renderModal();
		await submit();
		const callbacks = mocks.update.mock.calls[0][1];
		fireEvent.click(screen.getByRole("button", { name: "cancel" }));
		mocks.changeOpen.mockClear();
		rerender(<CloudflaredTunnelModal open={false} onOpenChange={mocks.changeOpen} tunnel={tunnel} />);
		rerender(
			<CloudflaredTunnelModal
				open
				onOpenChange={mocks.changeOpen}
				tunnel={{ ...tunnel, id: 2, name: "Other tunnel" }}
			/>,
		);
		fireEvent.change(screen.getByLabelText("name"), { target: { value: "New draft" } });
		act(() => {
			callbacks.onSuccess();
			callbacks.onSettled();
		});
		expect(mocks.changeOpen).not.toHaveBeenCalled();
		expect(screen.getByLabelText("name")).toHaveValue("New draft");
		expect(screen.getByRole("button", { name: "save" })).not.toBeDisabled();
	});
	it("does not close anything after unmount", async () => {
		const { unmount } = renderModal();
		await submit();
		const callbacks = mocks.update.mock.calls[0][1];
		unmount();
		act(() => callbacks.onSuccess());
		expect(mocks.changeOpen).not.toHaveBeenCalled();
	});
});
