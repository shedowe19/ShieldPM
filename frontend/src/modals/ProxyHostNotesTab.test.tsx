import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostNotesTab from "./ProxyHostNotesTab";

vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/textarea", () => ({
	Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as ProxyHostFormValues;

describe("ProxyHostNotesTab", () => {
	afterEach(cleanup);

	it("keeps the host note bound to the shared Proxy Host form", () => {
		render(
			<Formik initialValues={{ note: "Initial deployment note" }} onSubmit={vi.fn()}>
				<Form>
					<ProxyHostNotesTab />
					<FormState />
				</Form>
			</Formik>,
		);

		const note = screen.getByLabelText("host.note");
		expect(note).toHaveValue("Initial deployment note");
		expect(note).toHaveAttribute("placeholder", "host.note.placeholder");

		fireEvent.change(note, { target: { value: "Rotate upstream certificate" } });

		expect(getFormState()).toMatchObject({ note: "Rotate upstream certificate" });
	});
});
