import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type PropsWithChildren, useState } from "react";
import { LocalePicker } from "src/components/LocalePicker";
import { LocaleProvider } from "src/context";
import { initializeLocale, T } from "src/locale";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleRefreshBoundary } from "./LocaleRefreshBoundary";

vi.mock("src/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DropdownMenuItem: ({ children, onClick }: PropsWithChildren<{ onClick?: () => void }>) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}));

afterEach(async () => {
	cleanup();
	window.localStorage.removeItem("locale");
	await initializeLocale();
});

describe("LocaleRefreshBoundary", () => {
	it("keeps unsaved form state mounted while changing the active locale", async () => {
		const Draft = () => {
			const [value, setValue] = useState("");
			return <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />;
		};
		render(
			<LocaleProvider>
				<LocaleRefreshBoundary>
					<LocalePicker />
					<p data-testid="draft-translation">
						<T id="action.add" />
					</p>
					<Draft />
				</LocaleRefreshBoundary>
			</LocaleProvider>,
		);
		fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), { target: { value: "retain this" } });
		fireEvent.click(screen.getByRole("button", { name: /Switch Language/ }));
		fireEvent.click(screen.getByText("Deutsch"));

		await waitFor(() => expect(screen.getByTestId("draft-translation")).toHaveTextContent("Hinzufügen"));
		expect(screen.getByRole("textbox", { name: "Draft" })).toHaveValue("retain this");
	});

	it("updates translations without discarding the React Query cache", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(["locale-cache"], { retained: true });

		render(
			<LocaleProvider>
				<LocaleRefreshBoundary>
					<QueryClientProvider client={queryClient}>
						<LocalePicker />
						<p data-testid="translated-content">
							<T id="action.add" />
						</p>
					</QueryClientProvider>
				</LocaleRefreshBoundary>
			</LocaleProvider>,
		);

		expect(screen.getByTestId("translated-content")).toHaveTextContent("Add");

		fireEvent.click(screen.getByRole("button", { name: /Switch Language/ }));
		fireEvent.click(screen.getByText("Deutsch"));

		await waitFor(() => {
			expect(screen.getByTestId("translated-content")).toHaveTextContent("Hinzufügen");
		});
		expect(queryClient.getQueryData(["locale-cache"])).toEqual({ retained: true });
	});
});
