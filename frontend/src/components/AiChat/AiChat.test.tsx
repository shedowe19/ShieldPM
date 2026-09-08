import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiChat } from "./AiChat";

const mocks = vi.hoisted(() => ({
	sendAiChat: vi.fn(),
}));

vi.mock("src/api/backend/ai", () => ({
	sendAiChat: mocks.sendAiChat,
}));

function ControlledAiChat() {
	const [open, setOpen] = useState(true);

	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Reopen chat
			</button>
			<AiChat open={open} onOpenChange={setOpen} />
		</>
	);
}

describe("AiChat", () => {
	beforeEach(() => {
		mocks.sendAiChat.mockResolvedValue({ content: "The configured AI provider is available." });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("focuses the input and preserves sent history until the user clears it", async () => {
		render(<ControlledAiChat />);

		const input = await screen.findByPlaceholderText("Ask AI to list hosts, check logs...");
		expect(input).toHaveFocus();

		fireEvent.change(input, { target: { value: "Summarize the configured providers." } });
		fireEvent.click(screen.getByRole("button", { name: "Send message" }));

		await screen.findByText("The configured AI provider is available.");
		expect(mocks.sendAiChat).toHaveBeenCalledWith("Summarize the configured providers.", []);

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.click(screen.getByRole("button", { name: "Reopen chat" }));

		await screen.findByRole("dialog", {
			name: "AI Agent",
			description: "Chat with the AI administrator",
		});
		expect(screen.getByText("Summarize the configured providers.")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Ask AI to list hosts, check logs...")).toHaveFocus();

		expect(screen.getByRole("button", { name: "Clear chat" })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Clear chat" }));

		expect(screen.queryByText("Summarize the configured providers.")).not.toBeInTheDocument();
		expect(screen.queryByText("The configured AI provider is available.")).not.toBeInTheDocument();
		expect(screen.getByText("How can I help you manage your proxy hosts today?")).toBeInTheDocument();
	});
});

it("does not bring back an in-flight response after the conversation is cleared", async () => {
	let finish: (data: { content: string }) => void = () => {};
	mocks.sendAiChat.mockReturnValueOnce(
		new Promise((resolve) => {
			finish = resolve;
		}),
	);
	render(<ControlledAiChat />);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Old conversation" } });
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	fireEvent.click(screen.getByRole("button", { name: "Clear chat" }));
	await act(async () => {
		finish({ content: "Old response" });
	});
	expect(screen.queryByText("Old response")).not.toBeInTheDocument();
	expect(screen.getByRole("textbox")).toBeEnabled();
	cleanup();
});
