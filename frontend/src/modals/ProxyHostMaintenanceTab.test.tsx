import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostMaintenanceTab from "./ProxyHostMaintenanceTab";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

vi.mock("@tabler/icons-react", () => ({ IconTool: () => null }));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => <input {...props} /> }));

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

const renderMaintenanceTab = (initialValues: ProxyHostFormValues) =>
	render(
		<Formik initialValues={initialValues} onSubmit={vi.fn()}>
			<Form>
				<ProxyHostMaintenanceTab />
				<FormState />
			</Form>
		</Formik>,
	);

describe("ProxyHostMaintenanceTab", () => {
	afterEach(cleanup);

	it("keeps maintenance activation, schedule, and reason bound to the ProxyHost form", () => {
		renderMaintenanceTab({
			maintenanceActive: false,
			maintenanceEnd: "2026-07-12T10:00:00",
			maintenanceReason: "Upgrade",
			maintenanceStart: "2026-07-12T09:00:00",
		});

		expect(screen.getByRole("switch", { name: "maintenanceActive" })).toHaveAttribute("aria-checked", "false");
		expect(screen.getByLabelText("proxy-host.maintenance.start")).toHaveValue("2026-07-12T09:00");
		expect(screen.getByLabelText("proxy-host.maintenance.end")).toHaveValue("2026-07-12T10:00");
		expect(screen.getByLabelText("proxy-host.maintenance.reason")).toHaveValue("Upgrade");

		fireEvent.click(screen.getByRole("switch", { name: "maintenanceActive" }));
		fireEvent.change(screen.getByLabelText("proxy-host.maintenance.start"), {
			target: { value: "2026-07-13T09:00:00" },
		});
		fireEvent.change(screen.getByLabelText("proxy-host.maintenance.reason"), {
			target: { value: "Database migration" },
		});

		expect(getFormState()).toMatchObject({
			maintenanceActive: true,
			maintenanceEnd: "2026-07-12T10:00:00",
			maintenanceReason: "Database migration",
			maintenanceStart: "2026-07-13T09:00",
		});
	});
});
