import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsFilters } from "./AnalyticsFilters";

const mocks = vi.hoisted(() => ({
	selectHost: vi.fn(),
	selectOnValueChange: undefined as ((value: string) => void) | undefined,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children, onValueChange }: PropsWithChildren<{ onValueChange: (value: string) => void }>) => {
		mocks.selectOnValueChange = onValueChange;
		return <div>{children}</div>;
	},
	SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectItem: ({ children, value }: PropsWithChildren<{ value: string }>) => (
		<button type="button" onClick={() => mocks.selectOnValueChange?.(value)}>
			{children}
		</button>
	),
	SelectTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.selectOnValueChange = undefined;
});

describe("AnalyticsFilters", () => {
	it("keeps the selected host and time range controls available", () => {
		render(
			<AnalyticsFilters
				hosts={[
					{ domainNames: ["one.example"], id: 1 },
					{ domainNames: ["two.example"], id: 2 },
				]}
				onRangeChange={vi.fn()}
				onSelectedHostIdChange={mocks.selectHost}
				range="24h"
				selectedHostId="1"
			/>,
		);

		expect(screen.getByText("one.example")).toBeInTheDocument();
		expect(screen.getByText("two.example")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "24h" })).toBeInTheDocument();
	});

	it("forwards host and range changes to the analytics state", () => {
		const onRangeChange = vi.fn();
		render(
			<AnalyticsFilters
				hosts={[
					{ domainNames: ["one.example"], id: 1 },
					{ domainNames: ["two.example"], id: 2 },
				]}
				onRangeChange={onRangeChange}
				onSelectedHostIdChange={mocks.selectHost}
				range="24h"
				selectedHostId="1"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "two.example" }));
		fireEvent.click(screen.getByRole("button", { name: "7d" }));

		expect(mocks.selectHost).toHaveBeenCalledWith("2");
		expect(onRangeChange).toHaveBeenCalledWith("7d");
	});
});
