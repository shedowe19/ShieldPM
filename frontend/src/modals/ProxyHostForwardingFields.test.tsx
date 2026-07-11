import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { FORWARD_SCHEME } from "src/types/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostForwardingFields from "./ProxyHostForwardingFields";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

vi.mock("src/components/ui/input", () => ({
	Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectItem: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectTrigger: ({ children, id }: PropsWithChildren<{ id?: string }>) => (
		<button id={id} type="button">
			{children}
		</button>
	),
	SelectValue: () => null,
}));

vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => <>{id}</>,
}));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const createValues = (overrides: Partial<ProxyHostFormValues> = {}): ProxyHostFormValues =>
	({
		forwardHost: "proxy.example.com",
		forwardPort: 8080,
		forwardScheme: FORWARD_SCHEME.HTTP,
		indexFile: "",
		...overrides,
	}) as ProxyHostFormValues;

const renderForwardingFields = (values: ProxyHostFormValues) =>
	render(
		<Formik initialValues={values} onSubmit={() => undefined}>
			<Form>
				<ProxyHostForwardingFields />
				<FormState />
			</Form>
		</Formik>,
	);

describe("ProxyHostForwardingFields", () => {
	afterEach(cleanup);

	it("preserves forwarding fields and exposes the index file for path forwarding", () => {
		renderForwardingFields(
			createValues({
				forwardHost: "static.example.com",
				forwardPort: 8081,
				forwardScheme: FORWARD_SCHEME.PATH,
				indexFile: "index.php",
			}),
		);

		expect(screen.getByLabelText("proxy-host.forward-host")).toHaveValue("static.example.com");
		expect(screen.getByLabelText("host.forward-port")).toHaveValue(8081);
		expect(screen.getByLabelText("proxy-host.index-file")).toHaveValue("index.php");

		fireEvent.change(screen.getByLabelText("proxy-host.forward-host"), { target: { value: "files.example.com" } });

		expect(JSON.parse(screen.getByTestId("form-state").textContent || "{}")).toMatchObject({
			forwardHost: "files.example.com",
		});
	});

	it("hides the path-only index file for network forwarding", () => {
		renderForwardingFields(createValues());

		expect(screen.queryByLabelText("proxy-host.index-file")).not.toBeInTheDocument();
	});
});
