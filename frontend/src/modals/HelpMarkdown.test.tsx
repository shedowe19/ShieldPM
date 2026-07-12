import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpMarkdown } from "./HelpMarkdown";

describe("HelpMarkdown", () => {
	it("renders fetched help headings and explanatory text", () => {
		render(<HelpMarkdown markdown={"## Certificate help\n\nCreate and renew certificates here."} />);

		expect(screen.getByRole("heading", { level: 2, name: "Certificate help" })).toBeInTheDocument();
		expect(screen.getByText("Create and renew certificates here.")).toBeInTheDocument();
	});
});
