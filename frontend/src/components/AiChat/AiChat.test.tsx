import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiChat } from "./AiChat";

vi.mock("src/api/backend/ai", () => ({
	sendAiChat: vi.fn(),
}));

afterEach(cleanup);

describe("AiChat", () => {
	it("uses a native button as the chat trigger", () => {
		render(<AiChat />);

		expect(screen.getByRole("button", { name: "AI Agent" })).toHaveAttribute("type", "button");
	});

	it("provides localized labels for the chat dialog actions", async () => {
		render(<AiChat />);
		fireEvent.click(screen.getByText("AI Agent"));

		await screen.findByRole("dialog", {
			name: "AI Agent",
			description: "Chat with the AI administrator",
		});
		expect(screen.getByRole("button", { name: "Clear chat" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
	});
});
