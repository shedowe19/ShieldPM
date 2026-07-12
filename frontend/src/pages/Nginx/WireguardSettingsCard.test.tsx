import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	mutate: vi.fn(),
	settings: {
		endpoint: "vpn.example.com",
		listenPort: 51820,
		serverAddress: "10.8.0.1/24",
		subnet: "10.8.0.0/24",
	},
}));

vi.mock("@tabler/icons-react", () => ({ IconEdit: () => <svg /> }));
vi.mock("@tanstack/react-query", () => ({
	useMutation: () => ({ isPending: false, mutate: mocks.mutate }),
	useQuery: () => ({ data: mocks.settings }),
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
	beforeEach(() => {
		vi.clearAllMocks();
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
});
