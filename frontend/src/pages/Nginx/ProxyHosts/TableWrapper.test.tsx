import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableWrapper from "./TableWrapper";

const mocks = vi.hoisted(() => ({
	deleteProxyHost: vi.fn(),
	invalidateQueries: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showObjectSuccess: vi.fn(),
	tableProps: null as unknown,
	useProxyHosts: vi.fn(),
	useProxyHostsPage: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("src/api/backend", () => ({ deleteProxyHost: mocks.deleteProxyHost, toggleProxyHost: vi.fn() }));
vi.mock("src/components", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	LoadingPage: () => <div>loading</div>,
}));
vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	AlertTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("src/components/ui/button", () => ({
	Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
}));
vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
	CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("src/components/ui/input", () => ({ Input: (props: React.ComponentProps<"input">) => <input {...props} /> }));
vi.mock("src/hooks", () => ({ useProxyHosts: mocks.useProxyHosts, useProxyHostsPage: mocks.useProxyHostsPage }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id, data }: { id: string; data?: Record<string, number> }) => <>{`${id}:${JSON.stringify(data || {})}`}</>,
}));
vi.mock("src/modules/Permissions", () => ({ MANAGE: "manage", PROXY_HOSTS: "proxy_hosts" }));
vi.mock("src/notifications", () => ({ showObjectSuccess: mocks.showObjectSuccess }));
vi.mock("./lazy", () => ({
	showAccessListModal: vi.fn(),
	showDeleteConfirmModal: mocks.showDeleteConfirmModal,
	showHelpModal: vi.fn(),
	showProxyHostModal: vi.fn(),
}));
vi.mock("./Table", () => ({
	proxyHostColumns: [
		{ id: "icon", labelId: "proxy-host.column-icon" },
		{ id: "owner", labelId: "proxy-host.column-owner" },
		{ id: "domainNames", labelId: "column.source" },
		{ id: "forwardHost", labelId: "column.destination" },
		{ id: "certificate", labelId: "column.ssl" },
		{ id: "accessList", labelId: "column.access" },
		{ id: "enabled", labelId: "column.status" },
		{ id: "monitor", labelId: "proxy-host.monitor.column" },
		{ id: "latency", labelId: "proxy-host.monitor.latency-column" },
	],
	default: (props: unknown) => {
		mocks.tableProps = props;
		const tableProps = props as { data: { id: number }[] };
		return <output data-testid="table-row-count">{tableProps.data.length}</output>;
	},
}));

const createHosts = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		domainNames: [`host-${index + 1}.example.test`],
		id: index + 1,
	}));

const createPage = (items: { domainNames: string[]; id: number }[], page: number, totalItems: number) => ({
	items,
	pagination: { limit: 100, page, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 100)) },
});

describe("Proxy host table pagination", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
		mocks.deleteProxyHost.mockResolvedValue(true);
		mocks.useProxyHosts.mockReturnValue({
			data: createHosts(1000),
			isError: false,
			isFetching: false,
			isLoading: false,
		});
		mocks.useProxyHostsPage.mockReturnValue({
			data: createPage(createHosts(100), 1, 1000),
			isError: false,
			isFetching: false,
			isLoading: false,
		});
	});

	afterEach(cleanup);

	it("lets a viewer toggle each data column and restores the choice on remount", () => {
		const view = render(<TableWrapper />);
		const openColumns = () =>
			fireEvent.pointerDown(screen.getByRole("button", { name: /proxy-host\.columns/ }), {
				button: 0,
				ctrlKey: false,
			});

		openColumns();
		expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(9);
		const ssl = screen.getByRole("menuitemcheckbox", { name: /column\.ssl/ });
		expect(ssl).toHaveAttribute("aria-checked", "true");
		fireEvent.click(ssl);
		expect(ssl).toHaveAttribute("aria-checked", "false");
		const latency = screen.getByRole("menuitemcheckbox", { name: /latency-column/ });
		fireEvent.click(latency);
		expect(latency).toHaveAttribute("aria-checked", "false");
		expect((mocks.tableProps as { columnVisibility: Record<string, boolean> }).columnVisibility.certificate).toBe(
			false,
		);
		expect((mocks.tableProps as { columnVisibility: Record<string, boolean> }).columnVisibility.latency).toBe(
			false,
		);
		expect(JSON.parse(window.localStorage.getItem("shieldpm.proxy-host-columns") ?? "{}")).toMatchObject({
			certificate: false,
			latency: false,
		});

		view.unmount();
		render(<TableWrapper />);
		openColumns();
		expect(screen.getByRole("menuitemcheckbox", { name: /column\.ssl/ })).toHaveAttribute("aria-checked", "false");
		expect(screen.getByRole("menuitemcheckbox", { name: /latency-column/ })).toHaveAttribute(
			"aria-checked",
			"false",
		);
		expect((mocks.tableProps as { columnVisibility: Record<string, boolean> }).columnVisibility.certificate).toBe(
			false,
		);
		fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /column\.ssl/ }));
		expect((mocks.tableProps as { columnVisibility: Record<string, boolean> }).columnVisibility.certificate).toBe(
			true,
		);
	});

	it("renders only the first 100 of 1,000 hosts and exposes next-page navigation", () => {
		render(<TableWrapper />);

		expect(mocks.useProxyHostsPage).toHaveBeenCalledWith(["owner", "access_list", "certificate"], {
			limit: 100,
			page: 1,
			query: "",
		});
		expect(screen.getByTestId("table-row-count")).toHaveTextContent("100");
		expect(screen.getByRole("button", { name: "pagination.next" })).toBeEnabled();
		expect(screen.getByText('pagination.page-info:{"current":1,"total":10}')).toBeInTheDocument();
	});

	it("moves back from an empty page after a deletion refresh", async () => {
		let visitedEmptyPage = false;
		mocks.useProxyHostsPage.mockImplementation((_expand, params: { page: number }) => {
			if (params.page === 2) {
				visitedEmptyPage = true;
				return {
					data: createPage([], 2, 0),
					isError: false,
					isFetching: false,
					isLoading: false,
				};
			}

			return {
				data: createPage(visitedEmptyPage ? [] : createHosts(100), 1, visitedEmptyPage ? 0 : 200),
				isError: false,
				isFetching: false,
				isLoading: false,
			};
		});

		render(<TableWrapper />);
		fireEvent.click(screen.getByRole("button", { name: "pagination.next" }));

		await waitFor(() =>
			expect(mocks.useProxyHostsPage).toHaveBeenCalledWith(["owner", "access_list", "certificate"], {
				limit: 100,
				page: 2,
				query: "",
			}),
		);
		await waitFor(() => {
			const calls = mocks.useProxyHostsPage.mock.calls;
			expect(calls[calls.length - 1]?.[1]).toMatchObject({ page: 1 });
		});
	});

	it("invalidates every paginated proxy-host query after deleting a listed host", async () => {
		render(<TableWrapper />);
		const tableProps = mocks.tableProps as { onDelete: (id: number) => void };

		tableProps.onDelete(101);
		const modalOptions = mocks.showDeleteConfirmModal.mock.calls[0]?.[0] as {
			invalidations: unknown[];
			onConfirm: () => Promise<void>;
		};
		await modalOptions.onConfirm();

		expect(mocks.deleteProxyHost).toHaveBeenCalledWith(101);
		expect(modalOptions.invalidations).toContainEqual(["proxy-hosts"]);
		expect(mocks.showObjectSuccess).toHaveBeenCalledWith("proxy-host", "deleted");
	});
	it("keeps the search input focused across loading and failed filter requests", () => {
		const { rerender } = render(<TableWrapper />);
		const input = screen.getByRole("searchbox");
		input.focus();
		fireEvent.change(input, { target: { value: "My Host " } });
		expect(input).toHaveValue("My Host ");
		expect(mocks.useProxyHostsPage).toHaveBeenLastCalledWith(["owner", "access_list", "certificate"], {
			limit: 100,
			page: 1,
			query: "my host",
		});
		mocks.useProxyHostsPage.mockReturnValue({ data: undefined, isFetching: true, isLoading: true, isError: false });
		rerender(<TableWrapper />);
		expect(screen.getByRole("searchbox")).toBe(input);
		expect(input).toHaveFocus();
		expect(screen.queryByTestId("table-row-count")).not.toBeInTheDocument();
		mocks.useProxyHostsPage.mockReturnValue({
			data: undefined,
			isFetching: false,
			isLoading: false,
			isError: true,
			error: new Error("Search failed"),
		});
		rerender(<TableWrapper />);
		expect(screen.getByText("Search failed")).toBeInTheDocument();
		expect(screen.getByRole("searchbox")).toBe(input);
		fireEvent.change(input, { target: { value: "corrected" } });
		expect(mocks.useProxyHostsPage).toHaveBeenLastCalledWith(["owner", "access_list", "certificate"], {
			limit: 100,
			page: 1,
			query: "corrected",
		});
	});
});
