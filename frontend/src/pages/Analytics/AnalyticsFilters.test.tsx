import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
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

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	mocks.selectOnValueChange = undefined;
	await changeLocale("en-US");
});

describe("AnalyticsFilters", () => {
	it("keeps the selected host and time range controls available", () => {
		render(
			<AnalyticsFilters
				hosts={[
					{ domainNames: ["one.example"], id: 1 },
					{ domainNames: ["two.example"], id: 2 },
				]}
				onDownload={vi.fn()}
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
				onDownload={vi.fn()}
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

	it("offers a localized download control for the selected traffic series", async () => {
		const onDownload = vi.fn();
		await changeLocale("de-DE");
		render(
			<AnalyticsFilters
				hosts={[{ domainNames: ["one.example"], id: 1 }]}
				onDownload={onDownload}
				onRangeChange={vi.fn()}
				onSelectedHostIdChange={mocks.selectHost}
				range="24h"
				selectedHostId="1"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));

		expect(onDownload).toHaveBeenCalledOnce();
	});
});
