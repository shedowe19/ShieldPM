import { cleanup, render, screen } from "@testing-library/react";
import { Form, Formik } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { ICON_TYPE } from "src/types/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostIconSettings from "./ProxyHostIconSettings";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

vi.mock("src/components", () => ({
	ServiceIcon: (props: Record<string, unknown>) => (
		<output data-testid="service-icon-preview">{JSON.stringify(props)}</output>
	),
}));

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

vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <>{id}</> }));

const renderIconSettings = (values: ProxyHostFormValues) =>
	render(
		<Formik initialValues={values} onSubmit={() => undefined}>
			<Form>
				<ProxyHostIconSettings />
			</Form>
		</Formik>,
	);

describe("ProxyHostIconSettings", () => {
	afterEach(cleanup);

	it("renders the custom icon source and previews it with the proxy upstream", () => {
		renderIconSettings({
			forwardHost: "app.internal.test",
			forwardPort: 8443,
			iconType: ICON_TYPE.CUSTOM,
			iconUrl: "https://cdn.example.test/app.svg",
		});

		expect(screen.getByLabelText("proxy-host.icon-url")).toHaveValue("https://cdn.example.test/app.svg");
		const preview = screen.getByTestId("service-icon-preview").textContent || "{}";
		expect(JSON.parse(preview)).toMatchObject({
			customIconUrl: "https://cdn.example.test/app.svg",
			hostname: "app.internal.test",
			iconType: ICON_TYPE.CUSTOM,
			port: 8443,
		});
	});

	it("hides the custom icon source when automatic icon detection is selected", () => {
		renderIconSettings({ iconType: ICON_TYPE.AUTO, iconUrl: "https://cdn.example.test/app.svg" });

		expect(screen.queryByLabelText("proxy-host.icon-url")).not.toBeInTheDocument();
	});
});
