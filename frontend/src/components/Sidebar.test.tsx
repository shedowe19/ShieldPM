import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

vi.mock("src/components/HasPermission", () => ({ HasPermission: ({ children }: PropsWithChildren) => children }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/components/AiChat/AiChatLauncher", () => ({
	AiChatLauncher: ({ children }: PropsWithChildren) => children,
	AiChatLauncherTrigger: ({ onClick }: { onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			AI chat
		</button>
	),
}));
afterEach(cleanup);
it.each(["navigation", "AI chat"])("closes the mobile sidebar when selecting %s", async (action) => {
	render(
		<MemoryRouter>
			<Sidebar />
		</MemoryRouter>,
	);
	fireEvent.click(screen.getByRole("button", { name: "sr.toggle-navigation" }));
	const sheet = screen.getByRole("dialog");
	fireEvent.click(
		action === "navigation"
			? within(sheet).getByRole("link", { name: "dashboard" })
			: within(sheet).getByRole("button", { name: "AI chat" }),
	);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
