import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiChat } from "./AiChat";

const mocks = vi.hoisted(() => ({
	sendAiChat: vi.fn(),
	confirmAiAction: vi.fn(),
}));

vi.mock("src/api/backend/ai", () => ({
	sendAiChat: mocks.sendAiChat,
	confirmAiAction: mocks.confirmAiAction,
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
		mocks.confirmAiAction.mockResolvedValue({ content: "Deleted and VERIFIED: Proxy Host ID: 7." });
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

	it("requires an explicit UI confirmation without sending the token back to the provider", async () => {
		mocks.sendAiChat.mockResolvedValueOnce({
			content: "Confirmation required for delete_proxy_host. Review and approve this exact action.",
			confirmation: { token: "signed-confirmation", tool: "delete_proxy_host", details: '{"id":7}' },
		});
		render(<ControlledAiChat />);

		fireEvent.change(await screen.findByPlaceholderText("Ask AI to list hosts, check logs..."), {
			target: { value: "Delete proxy host 7." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send message" }));
		await screen.findByText(/Confirmation required for delete_proxy_host/);
		expect(screen.getByText('{"id":7}')).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
		await screen.findByText("Deleted and VERIFIED: Proxy Host ID: 7.");
		expect(mocks.confirmAiAction).toHaveBeenCalledWith("signed-confirmation");
		expect(mocks.sendAiChat).toHaveBeenCalledTimes(1);
	});
});
