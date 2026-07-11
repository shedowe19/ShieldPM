import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	mutate: vi.fn(),
	peers: [] as Array<Record<string, unknown>>,
	refetch: vi.fn(),
	showHelp: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({
	IconCheck: () => <svg />,
	IconEdit: () => <svg />,
	IconEye: () => <svg />,
	IconHelp: () => <svg />,
	IconPlayerPlay: () => <svg />,
	IconPlayerStop: () => <svg />,
	IconPlus: () => <svg />,
	IconRefresh: () => <svg />,
	IconTrash: () => <svg />,
}));

vi.mock("@tanstack/react-query", () => ({
	useMutation: () => ({ mutate: mocks.mutate }),
	useQuery: () => ({ data: undefined }),
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("lucide-react", () => ({
	Lock: () => <svg />,
	Network: () => <svg />,
	RefreshCcw: () => <svg />,
	Settings: () => <svg />,
	Shield: () => <svg />,
}));

vi.mock("./WireguardTunnels.lazy", () => ({ showWireguardTunnelsHelpModal: mocks.showHelp }));
vi.mock("@/api/backend/wireguardSettings", () => ({
	getWireguardSettings: vi.fn(),
	updateWireguardSettings: vi.fn(),
}));
vi.mock("@/components/HasPermission", () => ({
	HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/components/Nginx/WireguardConfigModal", () => ({ WireguardConfigModal: () => null }));
vi.mock("@/components/Nginx/WireguardPeerModal", () => ({ WireguardPeerModal: () => null }));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: PropsWithChildren) => <span>{children}</span> }));
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
vi.mock("@/components/ui/table", () => ({
	Table: ({ children }: PropsWithChildren) => <table>{children}</table>,
	TableBody: ({ children }: PropsWithChildren) => <tbody>{children}</tbody>,
	TableCell: ({ children }: PropsWithChildren) => <td>{children}</td>,
	TableHead: ({ children }: PropsWithChildren) => <th>{children}</th>,
	TableHeader: ({ children }: PropsWithChildren) => <thead>{children}</thead>,
	TableRow: ({ children }: PropsWithChildren) => <tr>{children}</tr>,
}));
vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipProvider: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/hooks/useHealth", () => ({ useHealth: () => ({ data: { demo: false } }) }));
vi.mock("@/hooks/useWireguardPeer", () => ({
	useWireguardPeer: () => ({
		disable: { mutate: mocks.mutate },
		enable: { mutate: mocks.mutate },
		remove: { mutate: mocks.mutate },
	}),
	useWireguardPeers: () => ({
		data: { peers: mocks.peers },
		isLoading: false,
		refetch: mocks.refetch,
	}),
}));
vi.mock("@/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("@/modules/Permissions", () => ({ MANAGE: "manage", WIREGUARD_PEERS: "wireguard_peers" }));

import { WireguardTunnels } from "./WireguardTunnels";

type ButtonProps = ComponentProps<"button"> & { size?: string; variant?: string };

const createPeer = (status: number) => ({
	clientAddress: "10.8.0.2",
	id: 42,
	lastHandshake: null,
	meta: {},
	name: "laptop",
	persistentKeepalive: 0,
	status,
	transferRx: 0,
	transferTx: 0,
});

describe("WireguardTunnels", () => {
	afterEach(cleanup);

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.peers = [createPeer(0)];
	});

	it("gives header and disabled-peer icon controls localized accessible names", () => {
		render(<WireguardTunnels />);

		for (const label of [
			"wireguard.refresh",
			"action.help",
			"wireguard.config.view",
			"action.enable",
			"wireguard.edit",
			"action.delete",
		]) {
			expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-label", label);
		}
	});

	it("labels an active peer toggle as a disable action", () => {
		mocks.peers = [createPeer(2)];
		render(<WireguardTunnels />);

		expect(screen.getByRole("button", { name: "action.disable" })).toHaveAttribute("aria-label", "action.disable");
	});
});
