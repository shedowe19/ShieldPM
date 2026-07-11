import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostAdvancedTab from "./ProxyHostAdvancedTab";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

vi.mock("@tabler/icons-react", () => ({ IconBolt: () => null }));

vi.mock("src/components/Form/NginxConfigField", () => ({
	NginxConfigField: () => <div data-testid="nginx-config-field" />,
}));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("src/components/ui/switch", () => ({
	Switch: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<button
			aria-checked={checked}
			aria-label={id}
			onClick={() => onCheckedChange?.(!checked)}
			role="switch"
			type="button"
		/>
	),
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => <>{id}</>,
}));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as ProxyHostFormValues;

describe("ProxyHostAdvancedTab", () => {
	afterEach(cleanup);

	it("keeps the acceleration setting bound to the Proxy Host form with localized guidance", () => {
		render(
			<Formik initialValues={{ turboLoader: false }} onSubmit={vi.fn()}>
				<Form>
					<ProxyHostAdvancedTab />
					<FormState />
				</Form>
			</Formik>,
		);

		expect(screen.getByText("proxy-host.turbo-loader.title")).toBeInTheDocument();
		expect(screen.getByText("proxy-host.turbo-loader.description")).toBeInTheDocument();
		expect(screen.getByText("proxy-host.turbo-loader.multi-part")).toBeInTheDocument();
		expect(screen.getByText("proxy-host.turbo-loader.multi-part.description")).toBeInTheDocument();
		expect(screen.getByTestId("nginx-config-field")).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "turboLoader" })).toHaveAttribute("aria-checked", "false");

		fireEvent.click(screen.getByRole("switch", { name: "turboLoader" }));

		expect(getFormState()).toMatchObject({ turboLoader: true });
	});
});
