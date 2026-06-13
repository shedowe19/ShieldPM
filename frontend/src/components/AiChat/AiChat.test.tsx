import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiChat } from "./AiChat";

vi.mock("src/api/backend/ai", () => ({
	sendAiChat: vi.fn(),
}));

describe("AiChat", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("uses a native button for the sidebar trigger", () => {
		render(<AiChat />);

		const trigger = screen.getByRole("button", { name: "AI Agent" });

		expect(trigger.tagName).toBe("BUTTON");
	});

	it("gives icon-only chat controls localized accessible names", async () => {
		render(<AiChat />);

		fireEvent.click(screen.getByRole("button", { name: "AI Agent" }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
		expect(screen.getByText("Ask ShieldPM AI for help with proxy hosts and server tasks.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Clear chat" })).toHaveAttribute("aria-label", "Clear chat");
		expect(screen.getByRole("button", { name: "Send message" })).toHaveAttribute("aria-label", "Send message");
	});
});
