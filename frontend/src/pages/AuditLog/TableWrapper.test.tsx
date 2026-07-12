import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableWrapper from "./TableWrapper";

const mocks = vi.hoisted(() => ({
	selectOnValueChange: new Map<string, (value: string) => void>(),
	tableProps: null as unknown,
	useAuditLogsPage: vi.fn(),
}));

vi.mock("src/components", () => ({
	LoadingPage: () => <div data-testid="loading" />,
}));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardTitle: ({ children }: PropsWithChildren) => <h1>{children}</h1>,
}));
vi.mock("src/components/ui/input", () => ({ Input: (props: React.ComponentProps<"input">) => <input {...props} /> }));
vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor, ...props }: React.ComponentProps<"label">) => (
		<label {...props} htmlFor={htmlFor}>
			{children}
		</label>
	),
}));
vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		name,
		onValueChange,
	}: PropsWithChildren<{ name?: string; onValueChange: (value: string) => void }>) => {
		const selectName = name ?? "audit-log-action";
		mocks.selectOnValueChange.set(selectName, onValueChange);
		return <div data-select-name={selectName}>{children}</div>;
	},
	SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectItem: ({ children, value }: PropsWithChildren<{ value: string }>) => (
		<button
			onClick={(event) => {
				const name = event.currentTarget.closest("[data-select-name]")?.getAttribute("data-select-name");
				if (name) {
					mocks.selectOnValueChange.get(name)?.(value);
				}
			}}
			type="button"
			value={value}
		>
			{children}
		</button>
	),
	SelectTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("src/hooks", () => ({
	useAuditLogsPage: mocks.useAuditLogsPage,
}));

vi.mock("./lazy", () => ({ showEventDetailsModal: vi.fn() }));
vi.mock("./Table", () => ({
	default: (props: unknown) => {
		mocks.tableProps = props;
		return <div />;
	},
}));

const mockAuditLogPage = (items: unknown[]) => {
	mocks.useAuditLogsPage.mockReturnValue({
		data: {
			items,
			pagination: { limit: 100, page: 1, totalItems: items.length, totalPages: 1 },
		},
		error: null,
		isError: false,
		isFetching: false,
		isLoading: false,
	});
};

const Location = () => {
	const location = useLocation();
	const navigate = useNavigate();
	return (
		<>
			<output data-testid="audit-log-location">{location.search}</output>
			<button onClick={() => navigate(-1)} type="button">
				Back
			</button>
		</>
	);
};

const renderAuditTable = (initialEntry: string | string[] = "/audit-log") => {
	const initialEntries = Array.isArray(initialEntry) ? initialEntry : [initialEntry];
	return render(
		<MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
			<TableWrapper />
			<Location />
		</MemoryRouter>,
	);
};

describe("Audit log table loading", () => {
	beforeEach(async () => {
		mocks.tableProps = null;
		mocks.useAuditLogsPage.mockReturnValue({
			data: undefined,
			error: { message: "" },
			isError: true,
			isFetching: false,
			isLoading: false,
		});
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		mocks.selectOnValueChange.clear();
	});

	it("shows a localized generic error when loading audit logs fails without a server message", () => {
		renderAuditTable();

		expect(screen.getByText("Fehler")).toBeInTheDocument();
		expect(screen.getByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
	});

	it("searches audit events by forwarding the entered query with the first result page", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();

		fireEvent.change(screen.getByPlaceholderText("Suchen..."), { target: { value: "proxy-host" } });
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			limit: 100,
			page: 1,
			query: "proxy-host",
		});
	});

	it("keeps spaces in the search field so multi-word audit queries remain searchable", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();

		const search = screen.getByPlaceholderText("Suchen...");
		fireEvent.change(search, { target: { value: "proxy " } });
		expect(search).toHaveValue("proxy ");
		fireEvent.change(search, { target: { value: "proxy host" } });
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			limit: 100,
			page: 1,
			query: "proxy host",
		});
	});

	it("filters audit events by their selected creation window from the first page", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();

		fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-07-12T08:00" } });
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			created_after: new Date("2026-07-12T08:00").toISOString(),
			limit: 100,
			page: 1,
		});

		fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "2026-07-12T10:00" } });
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			created_after: new Date("2026-07-12T08:00").toISOString(),
			created_before: new Date("2026-07-12T10:00").toISOString(),
			limit: 100,
			page: 1,
		});
	});

	it("filters audit events by the selected action from the first page", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();

		fireEvent.click(screen.getByRole("button", { name: "gelöscht" }));
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			action: "deleted",
			limit: 100,
			page: 1,
		});
	});

	it("removes the action filter while preserving the first result page", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();

		fireEvent.click(screen.getByRole("button", { name: "gelöscht" }));
		fireEvent.click(screen.getByRole("button", { name: "Alle Aktionen" }));
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], { limit: 100, page: 1 });
	});

	it("filters audit events by the selected object type from the first page", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();

		fireEvent.click(screen.getByRole("button", { name: "Proxy Host" }));
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			limit: 100,
			object_type: "proxy-host",
			page: 1,
		});
	});

	it("filters audit events by the entered user and object identifiers from the first page", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();

		fireEvent.change(screen.getByLabelText("Benutzer-ID"), { target: { value: "7" } });
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], { limit: 100, page: 1, user_id: 7 });

		fireEvent.change(screen.getByLabelText("Objekt-ID"), { target: { value: "42" } });
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			limit: 100,
			object_id: 42,
			page: 1,
			user_id: 7,
		});
	});

	it("renders one audit-log page at a time and lets administrators request the next page", () => {
		mocks.useAuditLogsPage.mockReturnValue({
			data: {
				items: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })),
				pagination: { limit: 100, page: 1, totalItems: 101, totalPages: 2 },
			},
			error: null,
			isError: false,
			isFetching: false,
			isLoading: false,
		});

		renderAuditTable();

		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], { limit: 100, page: 1 });
		expect((mocks.tableProps as { data: { id: number }[] }).data).toHaveLength(100);
		fireEvent.click(screen.getByRole("button", { name: "Nächste Seite" }));
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], { limit: 100, page: 2 });
	});

	it("downloads the currently displayed audit events as a CSV", () => {
		const createObjectURL = vi.fn((_blob: Blob) => "blob:audit-log-export");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		mockAuditLogPage([
			{
				action: "updated",
				createdOn: "2026-07-12T08:00:00.000Z",
				id: 73,
				meta: {},
				modifiedOn: "2026-07-12T08:00:00.000Z",
				objectId: 42,
				objectType: "proxy_host",
				userId: 5,
			},
		]);

		renderAuditTable();
		fireEvent.click(screen.getByRole("button", { name: "CSV exportieren" }));

		expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
		expect(createObjectURL.mock.calls[0][0].type).toBe("text/csv;charset=utf-8");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit-log-export");
	});

	it("restores a shareable audit investigation URL including filters and pagination", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable(
			"/audit-log?query=proxy-host&action=deleted&object_type=proxy-host&user_id=7&object_id=42&created_after=2026-07-12T08:00:00.000Z&created_before=2026-07-12T10:00:00.000Z&page=2",
		);

		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], {
			action: "deleted",
			created_after: "2026-07-12T08:00:00.000Z",
			created_before: "2026-07-12T10:00:00.000Z",
			limit: 100,
			object_id: 42,
			object_type: "proxy-host",
			page: 2,
			query: "proxy-host",
			user_id: 7,
		});
	});

	it("clears every audit investigation filter and returns to the first page", async () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable(
			"/audit-log?query=proxy-host&action=deleted&object_type=proxy-host&user_id=7&object_id=42&created_after=2026-07-12T08:00:00.000Z&created_before=2026-07-12T10:00:00.000Z&page=2",
		);
		fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));

		await waitFor(() => {
			expect(screen.getByTestId("audit-log-location")).toHaveTextContent("");
		});
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], { limit: 100, page: 1 });
	});

	it("updates the shareable audit investigation URL when filters change", async () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable();
		fireEvent.click(screen.getByRole("button", { name: "gelöscht" }));

		await waitFor(() => {
			expect(screen.getByTestId("audit-log-location")).toHaveTextContent("?action=deleted");
		});
	});

	it("restores the audit investigation state when browser history changes", () => {
		mockAuditLogPage([{ id: 73 }]);

		renderAuditTable(["/audit-log?query=first", "/audit-log?query=second"]);
		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], { limit: 100, page: 1, query: "second" });

		fireEvent.click(screen.getByRole("button", { name: "Back" }));

		expect(mocks.useAuditLogsPage).toHaveBeenLastCalledWith(["user"], { limit: 100, page: 1, query: "first" });
	});
});
