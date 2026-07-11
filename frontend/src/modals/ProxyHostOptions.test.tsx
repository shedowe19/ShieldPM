import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostOptions from "./ProxyHostOptions";

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
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

vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => <>{id}</>,
}));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as ProxyHostFormValues;

describe("ProxyHostOptions", () => {
	afterEach(cleanup);

	it("keeps every proxy host option connected to its Formik field", () => {
		render(
			<Formik
				initialValues={{
					allowWebsocketUpgrade: false,
					blockExploits: true,
					cachingEnabled: true,
					disableBuffering: false,
					maintenanceOnFailure: true,
				}}
				onSubmit={vi.fn()}
			>
				<Form>
					<ProxyHostOptions />
					<FormState />
				</Form>
			</Formik>,
		);

		expect(screen.getByRole("switch", { name: "cachingEnabled" })).toHaveAttribute("aria-checked", "true");
		expect(screen.getByRole("switch", { name: "disableBuffering" })).toHaveAttribute("aria-checked", "false");
		expect(screen.getByRole("switch", { name: "blockExploits" })).toHaveAttribute("aria-checked", "true");
		expect(screen.getByRole("switch", { name: "allowWebsocketUpgrade" })).toHaveAttribute("aria-checked", "false");
		expect(screen.getByRole("switch", { name: "maintenanceOnFailure" })).toHaveAttribute("aria-checked", "true");

		fireEvent.click(screen.getByRole("switch", { name: "disableBuffering" }));
		fireEvent.click(screen.getByRole("switch", { name: "allowWebsocketUpgrade" }));

		expect(getFormState()).toMatchObject({
			allowWebsocketUpgrade: true,
			blockExploits: true,
			cachingEnabled: true,
			disableBuffering: true,
			maintenanceOnFailure: true,
		});
	});
});
