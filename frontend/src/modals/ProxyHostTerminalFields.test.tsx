import { cleanup, render, screen } from "@testing-library/react";
import { Form, Formik } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { FORWARD_SCHEME, TERMINAL_AUTH_TYPE } from "src/types/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostTerminalFields from "./ProxyHostTerminalFields";

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => <input {...props} /> }));

vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectItem: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectValue: () => null,
}));

vi.mock("src/components/ui/textarea", () => ({
	Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <>{id}</> }));

const renderTerminalFields = (values: ProxyHostFormValues) =>
	render(
		<Formik initialValues={values} onSubmit={() => undefined}>
			<Form>
				<ProxyHostTerminalFields />
			</Form>
		</Formik>,
	);

const terminalValues = (overrides: Partial<ProxyHostFormValues> = {}): ProxyHostFormValues => ({
	forwardScheme: FORWARD_SCHEME.TERMINAL,
	terminalAuthType: TERMINAL_AUTH_TYPE.PASSWORD,
	terminalHost: "terminal.example.test",
	terminalPassword: "secret",
	terminalPort: 22,
	terminalPrivateKey: "private-key",
	terminalUsername: "deploy",
	...overrides,
});

describe("ProxyHostTerminalFields", () => {
	afterEach(cleanup);

	it("hides terminal connection fields for non-terminal proxy hosts", () => {
		renderTerminalFields(terminalValues({ forwardScheme: FORWARD_SCHEME.HTTP }));

		expect(screen.queryByLabelText("terminal.host")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("terminal.password")).not.toBeInTheDocument();
	});

	it("renders password credentials for terminal hosts using password authentication", () => {
		renderTerminalFields(terminalValues());

		expect(screen.getByLabelText("terminal.host")).toHaveValue("terminal.example.test");
		expect(screen.getByLabelText("terminal.password")).toHaveValue("secret");
		expect(screen.queryByLabelText("terminal.private-key")).not.toBeInTheDocument();
	});

	it("renders private-key credentials for terminal hosts using key authentication", () => {
		renderTerminalFields(terminalValues({ terminalAuthType: TERMINAL_AUTH_TYPE.KEY }));

		expect(screen.queryByLabelText("terminal.password")).not.toBeInTheDocument();
		expect(screen.getByLabelText("terminal.private-key")).toHaveValue("private-key");
	});
});
