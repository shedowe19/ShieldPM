import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	mutate: vi.fn(),
	loadError: null as Error | null,
	pending: false,
	settings: {
		endpoint: "vpn.example.com",
		listenPort: 51820,
		serverAddress: "10.8.0.1/24",
		subnet: "10.8.0.0/24",
	} as { endpoint: string; listenPort: number; serverAddress: string; subnet: string } | undefined,
}));

vi.mock("@tabler/icons-react", () => ({ IconEdit: () => <svg /> }));
vi.mock("@tanstack/react-query", () => ({
	useMutation: () => ({ isPending: mocks.pending, mutate: mocks.mutate }),
	useQuery: () => ({ data: mocks.settings, error: mocks.loadError }),
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("lucide-react", () => ({ Settings: () => <svg /> }));
vi.mock("@/api/backend/wireguardSettings", () => ({
	getWireguardSettings: vi.fn(),
	updateWireguardSettings: vi.fn(),
}));
vi.mock("@/components/HasPermission", () => ({
	HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/components/ui/button", () => ({
	Button: ({ children, size: _size, variant: _variant, ...props }: PropsWithChildren<ButtonProps>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));
vi.mock("@/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <section>{children}</section>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardHeader: ({ children }: PropsWithChildren) => <header>{children}</header>,
	CardTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));
vi.mock("@/locale", () => ({ T: ({ id }: { id: string }) => <>{id}</> }));
vi.mock("@/modules/Permissions", () => ({ MANAGE: "manage", WIREGUARD_PEERS: "wireguard_peers" }));

import { WireguardSettingsCard } from "./WireguardSettingsCard";

type ButtonProps = ComponentProps<"button"> & { size?: string; variant?: string };

describe("WireguardSettingsCard", () => {
	afterEach(cleanup);
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadError = null;
		mocks.pending = false;
		mocks.settings = {
			endpoint: "vpn.example.com",
			listenPort: 51820,
			serverAddress: "10.8.0.1/24",
			subnet: "10.8.0.0/24",
		};
	});

	it("uses a localized server-address label and saves the edited settings", () => {
		render(<WireguardSettingsCard />);

		fireEvent.click(screen.getByRole("button", { name: "edit" }));
		fireEvent.change(screen.getByLabelText("wireguard.settings.serverAddress"), {
			target: { value: "10.8.0.2/24" },
		});
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		expect(mocks.mutate).toHaveBeenCalledWith({
			endpoint: "vpn.example.com",
			listenPort: 51820,
			serverAddress: "10.8.0.2/24",
			subnet: "10.8.0.0/24",
		});
	});

	it("cannot save guessed defaults after the settings request fails", () => {
		mocks.settings = undefined;
		mocks.loadError = new Error("Settings unavailable");
		render(<WireguardSettingsCard />);
		expect(screen.getByText("Settings unavailable")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "edit" })).toBeDisabled();
		expect(screen.queryByText("51820")).not.toBeInTheDocument();
	});

	it("preserves unsaved values across background query updates", () => {
		const { rerender } = render(<WireguardSettingsCard />);
		fireEvent.click(screen.getByRole("button", { name: "edit" }));
		fireEvent.change(screen.getByLabelText("wireguard.settings.endpoint"), {
			target: { value: "edited.example.com" },
		});
		if (!mocks.settings) throw new Error("Missing settings fixture");
		mocks.settings = { ...mocks.settings, endpoint: "refetched.example.com" };
		rerender(<WireguardSettingsCard />);
		expect(screen.getByLabelText("wireguard.settings.endpoint")).toHaveValue("edited.example.com");
	});

	it("blocks invalid ports and modifications while saving", () => {
		const { rerender } = render(<WireguardSettingsCard />);
		fireEvent.click(screen.getByRole("button", { name: "edit" }));
		fireEvent.change(screen.getByLabelText("wireguard.settings.port"), { target: { value: "65536" } });
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		fireEvent.change(screen.getByLabelText("wireguard.settings.port"), { target: { value: "" } });
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		mocks.pending = true;
		rerender(<WireguardSettingsCard />);
		expect(screen.getByLabelText("wireguard.settings.endpoint")).toBeDisabled();
		expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
	});
});
