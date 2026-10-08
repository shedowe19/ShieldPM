import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfiguredCodeEditor from "./ConfiguredCodeEditor";

describe("configured code editor", () => {
	afterEach(cleanup);

	it.each([
		["nginx", "server { listen 80; }"],
		["json", '{"enabled": true}'],
		["php", "<?php echo 'ShieldPM'; ?>"],
	])("highlights %s without changing the editable value", (language, value) => {
		const onChange = vi.fn();
		const { container } = render(
			<ConfiguredCodeEditor
				aria-label="Configuration"
				language={language}
				onChange={onChange}
				rehypePlugins={undefined}
				value={value}
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Configuration" });

		expect(input).toHaveValue(value);
		expect(container.querySelector(".token")).not.toBeNull();
		fireEvent.change(input, { target: { value: `${value}\n` } });
		expect(onChange).toHaveBeenCalledOnce();
		expect(input).toHaveValue(`${value}\n`);
	});

	it("preserves embedded HTML, CSS and JavaScript highlighting in the default site editor", () => {
		const { container } = render(
			<ConfiguredCodeEditor
				language="php"
				value="<style>body { color: red; }</style><script>const answer = 42;</script><?php echo $answer; ?>"
			/>,
		);

		expect(container.querySelector(".language-css .token.property")).not.toBeNull();
		expect(container.querySelector(".language-javascript .token.keyword")).not.toBeNull();
		expect(container.querySelector(".language-php .token.variable")).not.toBeNull();
	});

	it("keeps unsupported languages editable without a highlighting error", () => {
		render(<ConfiguredCodeEditor aria-label="Other configuration" language="unsupported" value="custom syntax" />);

		expect(screen.getByRole("textbox", { name: "Other configuration" })).toHaveValue("custom syntax");
	});
});
