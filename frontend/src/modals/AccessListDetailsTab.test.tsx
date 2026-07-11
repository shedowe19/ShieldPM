import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Formik, useFormikContext } from "formik";
import { Tabs } from "src/components/ui/tabs";
import { ACCESS_LIST_TAB } from "src/types/enums";
import { describe, expect, it, vi } from "vitest";
import AccessListDetailsTab from "./AccessListDetailsTab";

vi.mock("src/components/ui/switch", () => ({
	Switch: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked: boolean;
		id: string;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<button aria-label={id} aria-pressed={checked} onClick={() => onCheckedChange(!checked)} type="button">
			{id}
		</button>
	),
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/modules/Validations", () => ({ validateString: vi.fn() }));

type Values = {
	name: string;
	passAuth: boolean;
	satisfyAny: boolean;
};

const FormState = () => {
	const { values } = useFormikContext<Values>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as Values;

describe("AccessListDetailsTab", () => {
	it("keeps the name and access behavior options bound to the access-list form", async () => {
		render(
			<Formik<Values> initialValues={{ name: "", passAuth: false, satisfyAny: false }} onSubmit={() => {}}>
				<Tabs defaultValue={ACCESS_LIST_TAB.DETAILS}>
					<AccessListDetailsTab />
					<FormState />
				</Tabs>
			</Formik>,
		);

		fireEvent.change(screen.getByLabelText("column.name"), { target: { value: "Private services" } });
		fireEvent.click(screen.getByRole("button", { name: "satisfyAny" }));
		fireEvent.click(screen.getByRole("button", { name: "passAuth" }));

		await waitFor(() => {
			expect(getFormState()).toEqual({
				name: "Private services",
				passAuth: true,
				satisfyAny: true,
			});
		});
	});
});
