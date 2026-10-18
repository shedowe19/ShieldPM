import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

const state = vi.hoisted(() => ({ roles: ["admin"] }));
vi.mock("src/hooks/useUser", () => ({
	useUser: () => ({ data: { roles: state.roles, permissions: {} }, isLoading: false }),
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/components/AiChat/AiChatLauncher", () => ({
	AiChatLauncher: ({ children }: PropsWithChildren) => children,
	AiChatLauncherTrigger: () => null,
}));
afterEach(cleanup);

it.each([true, false])("shows the WASI applications navigation only to administrators (admin=%s)", (admin) => {
	state.roles = admin ? ["admin"] : [];
	render(
		<MemoryRouter>
			<Sidebar />
		</MemoryRouter>,
	);
	if (admin) {
		expect(screen.getByRole("link", { name: "wasi.title" })).toHaveAttribute("href", "/settings/wasi");
	} else {
		expect(screen.queryByRole("link", { name: "wasi.title" })).not.toBeInTheDocument();
	}
});
