import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiChatLauncher, AiChatLauncherTrigger } from "./AiChatLauncher";

afterEach(cleanup);

describe("AiChatLauncher", () => {
	it("loads one shared chat only after a navigation trigger is activated", async () => {
		render(
			<AiChatLauncher>
				<AiChatLauncherTrigger />
				<AiChatLauncherTrigger />
			</AiChatLauncher>,
		);

		const triggers = screen.getAllByRole("button", { name: "AI Agent" });
		expect(triggers).toHaveLength(2);
		expect(screen.queryByRole("dialog", { name: "AI Agent" })).not.toBeInTheDocument();

		fireEvent.click(triggers[0]);
		await screen.findByRole("dialog", { name: "AI Agent" });
		expect(screen.getAllByRole("dialog", { name: "AI Agent" })).toHaveLength(1);

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => expect(screen.queryByRole("dialog", { name: "AI Agent" })).not.toBeInTheDocument());

		fireEvent.click(triggers[1]);
		await screen.findByRole("dialog", { name: "AI Agent" });
		expect(screen.getAllByRole("dialog", { name: "AI Agent" })).toHaveLength(1);
	});

	it("keeps the chat and markdown dependency out of the static sidebar shell", () => {
		const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/Sidebar.tsx"), "utf8");
		const launcherSource = readFileSync(resolve(process.cwd(), "src/components/AiChat/AiChatLauncher.tsx"), "utf8");

		expect(sidebarSource).not.toContain('from "src/components/AiChat/AiChat"');
		expect(launcherSource).toContain('lazy(() => import("./AiChat")');
	});
});
