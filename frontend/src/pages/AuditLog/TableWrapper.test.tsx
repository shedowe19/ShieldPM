import { cleanup, render, screen } from "@testing-library/react";
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
		vi.clearAllMocks();
	});

	it("shows a localized generic error when loading audit logs fails without a server message", () => {
		render(<TableWrapper />);

		expect(screen.getByText("Fehler")).toBeInTheDocument();
		expect(screen.getByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
	});
});
