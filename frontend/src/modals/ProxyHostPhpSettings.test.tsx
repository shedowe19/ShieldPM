import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { FORWARD_SCHEME, PHP_VERSION } from "src/types/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostPhpSettings from "./ProxyHostPhpSettings";

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
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

vi.mock("src/components/ui/switch", () => ({
	Switch: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<input checked={checked} id={id} onChange={(event) => onCheckedChange(event.target.checked)} type="checkbox" />
	),
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

const renderPhpSettings = (values: ProxyHostFormValues) =>
	render(
		<Formik initialValues={values} onSubmit={() => undefined}>
			<Form>
				<ProxyHostPhpSettings />
				<FormState />
			</Form>
		</Formik>,
	);

describe("ProxyHostPhpSettings", () => {
	afterEach(cleanup);

	it("hides PHP hosting settings for non-path proxy hosts", () => {
		renderPhpSettings({ forwardScheme: FORWARD_SCHEME.HTTP, phpEnabled: true });

		expect(screen.queryByLabelText("proxy-host.php-enabled")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("proxy-host.php-version")).not.toBeInTheDocument();
	});

	it("reveals PHP version and custom ini fields after enabling PHP for path hosts", () => {
		renderPhpSettings({
			forwardScheme: FORWARD_SCHEME.PATH,
			phpEnabled: false,
			phpVersion: PHP_VERSION.PHP83,
			php_override_ini: "memory_limit=256M",
		});

		const enabled = screen.getByLabelText("proxy-host.php-enabled");
		expect(screen.queryByLabelText("proxy-host.php-version")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("proxy-host.php.custom-ini")).not.toBeInTheDocument();

		fireEvent.click(enabled);

		expect(screen.getByLabelText("proxy-host.php-version")).toBeInTheDocument();
		expect(screen.getByLabelText("proxy-host.php.custom-ini")).toHaveValue("memory_limit=256M");
		const formState = JSON.parse(screen.getByTestId("form-state").textContent || "{}");
		expect(formState).toMatchObject({ phpEnabled: true });
	});
});
