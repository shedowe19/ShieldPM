import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostSecurityTab from "./ProxyHostSecurityTab";

vi.mock("@tabler/icons-react", () => ({
	IconGhost: () => null,
	IconShieldLock: () => null,
}));

vi.mock("src/components/AnubisRulesField", () => ({
	default: () => <div data-testid="anubis-rules-editor" />,
}));

vi.mock("src/components/Form/FirewallPolicyField", () => ({
	FirewallPolicyField: () => null,
}));

vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
}));

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

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectItem: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
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
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as ProxyHostFormValues;

const renderSecurityTab = (initialValues: ProxyHostFormValues) =>
	render(
		<Formik initialValues={initialValues} onSubmit={vi.fn()}>
			<Form>
				<ProxyHostSecurityTab />
				<FormState />
			</Form>
		</Formik>,
	);

describe("ProxyHostSecurityTab", () => {
	afterEach(cleanup);

	it("seeds the recommended Anubis rules when enabling protection without existing rules", async () => {
		renderSecurityTab({ anubisEnabled: false, anubisRules: [] });

		fireEvent.click(screen.getByRole("switch", { name: "anubisEnabled" }));

		await waitFor(() =>
			expect(getFormState()).toMatchObject({
				anubisEnabled: true,
				anubisRules: [
					{ action: "DENY", name: "block-ai-crawlers" },
					{ action: "CHALLENGE", name: "challenge-browsers" },
				],
			}),
		);
		expect(screen.getByTestId("anubis-rules-editor")).toBeInTheDocument();
	});

	it("preserves custom Anubis rules when enabling protection", async () => {
		renderSecurityTab({
			anubisEnabled: false,
			anubisRules: [{ action: "ALLOW", name: "trusted-monitor", path: "/health", userAgent: "Monitor" }],
		});

		fireEvent.click(screen.getByRole("switch", { name: "anubisEnabled" }));

		await waitFor(() =>
			expect(getFormState()).toMatchObject({
				anubisEnabled: true,
				anubisRules: [{ action: "ALLOW", name: "trusted-monitor", path: "/health", userAgent: "Monitor" }],
			}),
		);
		expect(screen.getByTestId("anubis-rules-editor")).toBeInTheDocument();
	});
});
