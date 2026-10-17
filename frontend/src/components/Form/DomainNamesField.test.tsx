import { cleanup, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => (id === "domain-names" ? "Domainnamen" : id),
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));

import { DomainNamesField } from "./DomainNamesField";

afterEach(cleanup);
describe("domain selector accessible association", () => {
	it.each(["domainNames", "custom-domain-input"])("labels the actual React Select input for %s", (id) => {
		render(
			<Formik initialValues={{ domainNames: ["example.test"] }} onSubmit={() => {}}>
				<DomainNamesField id={id} />
			</Formik>,
		);
		const input = screen.getByRole("combobox", { name: "Domainnamen" });
		expect(screen.getByLabelText("Domainnamen")).toBe(input);
		expect(input.tagName).toBe("INPUT");
		const label = screen.getByText("Domainnamen") as HTMLLabelElement;
		expect(label.control).toBe(input);
		input.focus();
		expect(input).toHaveFocus();
	});
});
