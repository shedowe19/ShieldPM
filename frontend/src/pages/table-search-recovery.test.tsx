import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Access from "./Access/TableWrapper";
import Certificates from "./Certificates/TableWrapper";
import DdnsProviders from "./Nginx/DdnsProviders/TableWrapper";
import UsersPage from "./Users";
import Users from "./Users/TableWrapper";

const mocks = vi.hoisted(() => ({ admin: false, permission: "manage" }));
vi.mock("src/api/backend", () => ({
	getAccessLists: vi.fn(),
	getCertificates: vi.fn(),
	getDdnsProviders: vi.fn(),
	getUsers: vi.fn(),
	deleteAccessList: vi.fn(),
	deleteCertificate: vi.fn(),
	deleteDdnsProvider: vi.fn(),
	deleteUser: vi.fn(),
	toggleUser: vi.fn(),
	downloadCertificate: vi.fn(),
	downloadRootCa: vi.fn(),
}));
vi.mock("src/hooks", async () => await import("src/hooks/useAccessLists"));
vi.mock("src/hooks/useUser", () => ({
	useUser: () => ({
		data: {
			id: 1,
			roles: mocks.admin ? ["admin"] : [],
			permissions: {
				accessLists: mocks.permission,
				certificates: mocks.permission,
				ddnsProviders: mocks.permission,
			},
		},
	}),
}));
vi.mock("src/hooks/useHealth", () => ({ useHealth: () => ({ data: { demo: false } }) }));
vi.mock("src/components", async () => ({
	...(await import("src/components/EmptyData")),
	...(await import("src/components/HasPermission")),
	...(await import("src/components/Table/Formatter/UserAvatar")),
	...(await import("src/components/Table/Formatter/ValueWithDateFormatter")),
	...(await import("src/components/Table/Formatter/TrueFalseFormatter")),
	LoadingPage: () => null,
}));
vi.mock("src/context", () => ({ useAuthState: () => ({ loginAs: vi.fn() }) }));
vi.mock("src/notifications", () => ({ showError: vi.fn(), showObjectSuccess: vi.fn() }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
	formatDateTime: () => "date",
	parseDate: () => null,
}));
vi.mock("src/modals/account-lazy", () => ({ showUserModal: vi.fn() }));
vi.mock("./Access/lazy", () => ({
	showAccessListModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));
vi.mock("./Certificates/lazy", () => ({
	showCustomCertificateModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showDNSCertificateModal: vi.fn(),
	showHelpModal: vi.fn(),
	showHTTPCertificateModal: vi.fn(),
	showInternalCertificateModal: vi.fn(),
	showRenewCertificateModal: vi.fn(),
}));
vi.mock("./Nginx/DdnsProviders/lazy", () => ({
	showDdnsProviderModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));
vi.mock("./Users/lazy", () => ({
	showPermissionsModal: vi.fn(),
	showSetPasswordModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
}));

const row = {
	id: 7,
	name: "last",
	nickname: "last",
	email: "last@example.test",
	roles: [],
	avatar: "",
	domainNames: ["last.example.test"],
	domains: ["last.example.test"],
	niceName: "last",
	provider: "other",
	items: [],
	clients: [],
};
const cases = [
	{ name: "Access Lists", Page: Access, key: ["access-lists", { expand: ["owner", "items", "clients"] }] },
	{
		name: "Certificates",
		Page: Certificates,
		key: ["certificates", { expand: ["owner", "dead_hosts", "proxy_hosts", "redirection_hosts", "streams"] }],
	},
	{ name: "DDNS Providers", Page: DdnsProviders, key: ["ddns-providers"] },
	{ name: "Users", Page: Users, key: ["users", { expand: ["permissions"] }], admin: true },
];
let client: QueryClient;
beforeEach(() => {
	vi.clearAllMocks();
	mocks.admin = false;
	mocks.permission = "manage";
	client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
});
afterEach(() => {
	cleanup();
	client.clear();
});

describe.each(cases)("$name search recovery", ({ Page, key, admin }) => {
	it("retains the active search and create action when the final cached row is removed", async () => {
		mocks.admin = !!admin;
		client.setQueryData(key, [row]);
		render(
			<QueryClientProvider client={client}>
				<Page />
			</QueryClientProvider>,
		);
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "last" } });
		act(() => client.setQueryData(key, []));
		await screen.findByText("empty-search");
		expect(screen.getByRole("searchbox")).toHaveValue("last");
		expect(screen.getByRole("button", { name: "object.add" })).toBeEnabled();
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
		await screen.findByText("object.empty");
		expect(screen.queryByText("empty-search")).not.toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: "object.add" }).length).toBeGreaterThan(0);
		act(() => client.setQueryData(key, [{ ...row, name: "fresh", niceName: "fresh" }]));
		await waitFor(() => expect(screen.getByRole("searchbox")).toHaveValue(""));
		expect(screen.getAllByText("fresh").length).toBeGreaterThan(0);
	});
});
it.each(cases.filter((entry) => !entry.admin))(
	"$name keeps search recovery without granting create permission",
	async ({ Page, key }) => {
		mocks.permission = "view";
		client.setQueryData(key, [row]);
		render(
			<QueryClientProvider client={client}>
				<Page />
			</QueryClientProvider>,
		);
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "last" } });
		act(() => client.setQueryData(key, []));
		await screen.findByText("empty-search");
		expect(screen.getByRole("searchbox")).toHaveValue("last");
		expect(screen.queryByRole("button", { name: "object.add" })).not.toBeInTheDocument();
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
		await screen.findByText("object.empty");
		expect(screen.queryByRole("button", { name: "object.add" })).not.toBeInTheDocument();
	},
);
it("keeps user creation behind the existing administrator page permission", () => {
	render(
		<QueryClientProvider client={client}>
			<UsersPage />
		</QueryClientProvider>,
	);
	expect(screen.getByText("no-permission-error")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "object.add" })).not.toBeInTheDocument();
});
