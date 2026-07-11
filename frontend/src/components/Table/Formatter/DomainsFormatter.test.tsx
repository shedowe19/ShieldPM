import { cleanup, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it } from "vitest";
import { DomainsFormatter } from "./DomainsFormatter";
import "@testing-library/jest-dom/vitest";
import { changeLocale } from "src/locale";
import deMessages from "src/locale/lang/de.json";
import enMessages from "src/locale/lang/en.json";

// Mock IntlProvider with actual messages
const Wrapper = ({
	children,
	locale = "en",
	messages = enMessages,
}: {
	children: React.ReactNode;
	locale?: string;
	messages?: Record<string, string>;
}) => (
	<IntlProvider locale={locale} messages={messages}>
		{children}
	</IntlProvider>
);

describe("DomainsFormatter", () => {
	afterEach(async () => {
		cleanup();
		await changeLocale("en-US");
	});

	it("renders domains as links", () => {
		render(
			<Wrapper>
				<DomainsFormatter domains={["example.com"]} />
			</Wrapper>,
		);
		const link = screen.getByRole("link", { name: "example.com" });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "http://example.com");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("renders multiple domains", () => {
		render(
			<Wrapper>
				<DomainsFormatter domains={["example.com", "test.com"]} />
			</Wrapper>,
		);
		expect(screen.getByText("example.com")).toBeInTheDocument();
		expect(screen.getByText("test.com")).toBeInTheDocument();
	});

	it("localizes the empty domain fallback", async () => {
		await changeLocale("de-DE");

		render(
			<Wrapper locale="de-DE" messages={deMessages}>
				<DomainsFormatter domains={[]} />
			</Wrapper>,
		);

		expect(screen.getByText("Unbekannt")).toBeInTheDocument();
		expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
	});
});
