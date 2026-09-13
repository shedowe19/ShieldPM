import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Component, type PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./AiChat", () => {
	throw new Error("AI chat chunk unavailable");
});

import { AiChatLauncher, AiChatLauncherTrigger } from "./AiChatLauncher";

class ApplicationBoundary extends Component<PropsWithChildren, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? <div>Application failed</div> : this.props.children;
	}
}

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await changeLocale("en");
});

it("keeps navigation and the active page available when the chat chunk fails", async () => {
	await changeLocale("de");
	vi.spyOn(console, "error").mockImplementation(() => {});
	const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
	render(
		<ApplicationBoundary>
			<AiChatLauncher>
				<nav>Application navigation</nav>
				<AiChatLauncherTrigger />
			</AiChatLauncher>
			<main>Active page</main>
		</ApplicationBoundary>,
	);
	fireEvent.click(screen.getByRole("button"));

	expect(await screen.findByRole("alert")).toHaveTextContent("Diese Seite konnte nicht geladen werden.");
	expect(screen.getByRole("navigation")).toHaveTextContent("Application navigation");
	expect(screen.getByRole("main")).toHaveTextContent("Active page");
	fireEvent.click(screen.getByRole("button", { name: "Seite neu laden" }));
	expect(reload).toHaveBeenCalledOnce();
});
