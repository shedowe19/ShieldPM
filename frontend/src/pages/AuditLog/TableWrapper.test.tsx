import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableWrapper from "./TableWrapper";

const mocks = vi.hoisted(() => ({
	useAuditLogs: vi.fn(),
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

vi.mock("src/hooks", () => ({
	useAuditLogs: mocks.useAuditLogs,
}));

vi.mock("./lazy", () => ({ showEventDetailsModal: vi.fn() }));
vi.mock("./Table", () => ({ default: () => <div /> }));

describe("Audit log table loading", () => {
	beforeEach(async () => {
		mocks.useAuditLogs.mockReturnValue({
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
	});

	it("shows a localized generic error when loading audit logs fails without a server message", () => {
		render(<TableWrapper />);

		expect(screen.getByText("Fehler")).toBeInTheDocument();
		expect(screen.getByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
	});

	it("searches audit events by forwarding the entered query to the audit-log hook", () => {
		mocks.useAuditLogs.mockReturnValue({
			data: [{ id: 73 }],
			error: null,
			isError: false,
			isFetching: false,
			isLoading: false,
		});

		render(<TableWrapper />);

		fireEvent.change(screen.getByPlaceholderText("Suchen..."), { target: { value: "proxy-host" } });
		expect(mocks.useAuditLogs).toHaveBeenLastCalledWith(["user"], {}, { query: "proxy-host" });
	});

	it("keeps spaces in the search field so multi-word audit queries remain searchable", () => {
		mocks.useAuditLogs.mockReturnValue({
			data: [{ id: 73 }],
			error: null,
			isError: false,
			isFetching: false,
			isLoading: false,
		});

		render(<TableWrapper />);

		const search = screen.getByPlaceholderText("Suchen...");
		fireEvent.change(search, { target: { value: "proxy " } });
		expect(search).toHaveValue("proxy ");
		fireEvent.change(search, { target: { value: "proxy host" } });
		expect(mocks.useAuditLogs).toHaveBeenLastCalledWith(["user"], {}, { query: "proxy host" });
	});

	it("filters audit events by their selected creation window", () => {
		mocks.useAuditLogs.mockReturnValue({
			data: [{ id: 73 }],
			error: null,
			isError: false,
			isFetching: false,
			isLoading: false,
		});

		render(<TableWrapper />);

		fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-07-12T08:00" } });
		expect(mocks.useAuditLogs).toHaveBeenLastCalledWith(
			["user"],
			{},
			{
				created_after: new Date("2026-07-12T08:00").toISOString(),
			},
		);

		fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "2026-07-12T10:00" } });
		expect(mocks.useAuditLogs).toHaveBeenLastCalledWith(
			["user"],
			{},
			{
				created_after: new Date("2026-07-12T08:00").toISOString(),
				created_before: new Date("2026-07-12T10:00").toISOString(),
			},
		);
	});

	it("downloads the currently displayed audit events as a CSV", () => {
		const createObjectURL = vi.fn((_blob: Blob) => "blob:audit-log-export");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		mocks.useAuditLogs.mockReturnValue({
			data: [
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
			],
			error: null,
			isError: false,
			isFetching: false,
			isLoading: false,
		});

		render(<TableWrapper />);
		fireEvent.click(screen.getByRole("button", { name: "CSV exportieren" }));

		expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
		expect(createObjectURL.mock.calls[0][0].type).toBe("text/csv;charset=utf-8");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit-log-export");
	});
});
