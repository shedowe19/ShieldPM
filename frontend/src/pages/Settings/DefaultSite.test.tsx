import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TextareaHTMLAttributes } from "react";
import { afterEach, expect, it, vi } from "vitest";
import DefaultSite from "./DefaultSite";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("src/hooks", () => ({
	useSetting: () => ({ data: { id: "default-site", value: "html", meta: { html: "" } }, isLoading: false }),
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

it("explains why an empty default HTML page cannot be saved and labels its editor", async () => {
	render(<DefaultSite />);
	const editor = screen.getByLabelText("settings.default-site.html", { selector: "textarea" });
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	expect(await screen.findByText("error.required")).toBeInTheDocument();
	expect(editor).toHaveAttribute("aria-invalid", "true");
	expect(editor).toHaveAccessibleDescription("error.required");
	expect(mutate).not.toHaveBeenCalled();
});
