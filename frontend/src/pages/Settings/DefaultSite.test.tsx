import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TextareaHTMLAttributes } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DefaultSite from "./DefaultSite";

const mutate = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
	data: { id: "default-site", value: "html", meta: { html: "" } } as
		| { id: string; value: string; meta: { html: string } }
		| undefined,
	error: null as Error | null,
}));
vi.mock("src/hooks", () => ({
	useSetting: () => ({ ...state, isLoading: false }),
	useSetSetting: () => ({ mutate }),
}));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));
vi.mock("src/components/LazyCodeEditor", () => ({
	LazyCodeEditor: ({ id, name, value, onChange, onBlur, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
		<textarea
			id={id}
			name={name}
			value={value}
			onChange={onChange}
			onBlur={onBlur}
			aria-invalid={props["aria-invalid"]}
			aria-describedby={props["aria-describedby"]}
		/>
	),
}));
afterEach(cleanup);
beforeEach(() => {
	state.data = { id: "default-site", value: "html", meta: { html: "" } };
	state.error = null;
	mutate.mockClear();
});

it("explains why an empty default HTML page cannot be saved and labels its editor", async () => {
	render(<DefaultSite />);
	const editor = screen.getByLabelText("settings.default-site.html", { selector: "textarea" });
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	expect(await screen.findByText("error.required")).toBeInTheDocument();
	expect(editor).toHaveAttribute("aria-invalid", "true");
	expect(editor).toHaveAccessibleDescription("error.required");
	expect(mutate).not.toHaveBeenCalled();
});

it("preserves unsaved HTML across a failed background refresh and recovery", async () => {
	const { rerender } = render(<DefaultSite />);
	const editor = screen.getByLabelText("settings.default-site.html", { selector: "textarea" });
	fireEvent.change(editor, { target: { value: "<h1>Unsaved maintenance page</h1>" } });
	state.error = new Error("Settings refresh failed");
	rerender(<DefaultSite />);
	expect(screen.getByText("Settings refresh failed")).toBeInTheDocument();
	expect(screen.getByLabelText("settings.default-site.html", { selector: "textarea" })).toBe(editor);
	expect(editor).toHaveValue("<h1>Unsaved maintenance page</h1>");
	state.error = null;
	state.data = { id: "default-site", value: "html", meta: { html: "<p>Server content</p>" } };
	rerender(<DefaultSite />);
	expect(editor).toHaveValue("<h1>Unsaved maintenance page</h1>");
});

it("blocks saving defaults when the first settings request fails", () => {
	state.data = undefined;
	state.error = new Error("Settings unavailable");
	render(<DefaultSite />);
	expect(screen.getByText("Settings unavailable")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
});
