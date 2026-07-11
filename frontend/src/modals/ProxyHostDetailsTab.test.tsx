import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostDetailsTab from "./ProxyHostDetailsTab";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

vi.mock("src/components", () => ({
	AccessField: () => <div data-testid="access-field" />,
	DomainNamesField: () => <div data-testid="domain-names-field" />,
}));

vi.mock("src/components/ui/input", () => ({
	Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

vi.mock("./ProxyHostForwardingFields", () => ({ default: () => <div data-testid="forwarding-fields" /> }));
vi.mock("./ProxyHostIconSettings", () => ({ default: () => <div data-testid="icon-settings" /> }));
vi.mock("./ProxyHostOptions", () => ({ default: () => <div data-testid="proxy-options" /> }));
vi.mock("./ProxyHostPhpSettings", () => ({ default: () => <div data-testid="php-settings" /> }));
vi.mock("./ProxyHostTerminalFields", () => ({ default: () => <div data-testid="terminal-fields" /> }));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as ProxyHostFormValues;

describe("ProxyHostDetailsTab", () => {
	afterEach(cleanup);

	it("keeps detail fields and nested form sections bound to the shared Proxy Host form", () => {
		render(
			<Formik initialValues={{ bandwidthLimit: "25m", forwardQuery: "api_key=123" }} onSubmit={vi.fn()}>
				<Form>
					<ProxyHostDetailsTab />
					<FormState />
				</Form>
			</Formik>,
		);

		expect(screen.getByTestId("domain-names-field")).toBeInTheDocument();
		expect(screen.getByTestId("forwarding-fields")).toBeInTheDocument();
		expect(screen.getByTestId("terminal-fields")).toBeInTheDocument();
		expect(screen.getByTestId("icon-settings")).toBeInTheDocument();
		expect(screen.getByTestId("php-settings")).toBeInTheDocument();
		expect(screen.getByTestId("access-field")).toBeInTheDocument();
		expect(screen.getByTestId("proxy-options")).toBeInTheDocument();
		expect(screen.getByLabelText("proxy-host.bandwidth-limit")).toHaveValue("25m");
		expect(screen.getByLabelText("proxy-host.forward-query")).toHaveValue("api_key=123");

		fireEvent.change(screen.getByLabelText("proxy-host.bandwidth-limit"), { target: { value: "50m" } });
		fireEvent.change(screen.getByLabelText("proxy-host.forward-query"), { target: { value: "cache=1" } });

		expect(getFormState()).toMatchObject({ bandwidthLimit: "50m", forwardQuery: "cache=1" });
	});
});
