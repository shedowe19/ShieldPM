import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Formik, useFormikContext } from "formik";
import { Tabs } from "src/components/ui/tabs";
import { ACCESS_LIST_TAB } from "src/types/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccessListMtlsTab from "./AccessListMtlsTab";

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));

type Values = {
	mtlsContent: string;
	mtlsEnabled: boolean;
	mtlsUseInternal: boolean;
};

const FormState = () => {
	const { values } = useFormikContext<Values>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as Values;

const renderTab = (initialValues: Values) =>
	render(
		<Formik<Values> initialValues={initialValues} onSubmit={() => {}}>
			<Tabs defaultValue={ACCESS_LIST_TAB.MTLS}>
				<AccessListMtlsTab />
				<FormState />
			</Tabs>
		</Formik>,
	);

afterEach(() => {
	cleanup();
});

describe("AccessListMtlsTab", () => {
	it("reveals the external certificate field when mTLS is enabled", async () => {
		renderTab({ mtlsContent: "", mtlsEnabled: false, mtlsUseInternal: false });

		expect(screen.queryByLabelText("access-list.mtls.certificate")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("switch", { name: "access-list.mtls.enable" }));

		await waitFor(() => {
			expect(screen.getByLabelText("access-list.mtls.certificate")).toBeInTheDocument();
			expect(getFormState().mtlsEnabled).toBe(true);
		});
	});

	it("keeps the external mTLS certificate content bound to the access-list form", async () => {
		renderTab({ mtlsContent: "", mtlsEnabled: true, mtlsUseInternal: false });

		fireEvent.change(screen.getByLabelText("access-list.mtls.certificate"), {
			target: { value: "-----BEGIN CERTIFICATE-----" },
		});

		await waitFor(() => {
			expect(getFormState().mtlsContent).toBe("-----BEGIN CERTIFICATE-----");
		});
	});
});
