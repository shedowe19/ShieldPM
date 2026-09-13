import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AiMessage } from "./AiMessage";

afterEach(cleanup);
it("keeps inline code inline and preserves fenced code language classes", () => {
	render(<AiMessage message={{ role: "assistant", content: "Run `nginx -t` first.\n\n```nginx\nserver {}\n```" }} />);
	const inline = screen.getByText("nginx -t");
	expect(inline.parentElement?.tagName).toBe("P");
	expect(inline).not.toHaveClass("block");
	const block = screen.getByText("server {}");
	expect(block.closest("pre")).toBeInTheDocument();
	expect(block).toHaveClass("language-nginx");
});
