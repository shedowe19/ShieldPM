import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UserDetailsTab from "./UserDetailsTab";

type UserDetailsValues = {
	avatar_type: string;
	avatar_value: string;
	email: string;
	isAdmin: boolean;
	isDisabled: boolean;
	name: string;
	nickname: string;
};

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

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

vi.mock("src/modules/Validations", () => ({
	validateEmail: () => undefined,
	validateString: () => undefined,
}));

const FormState = () => {
	const { values } = useFormikContext<UserDetailsValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as UserDetailsValues;

const initialValues: UserDetailsValues = {
	avatar_type: "gravatar",
	avatar_value: "",
	email: "owner@example.test",
	isAdmin: false,
	isDisabled: false,
	name: "Original User",
	nickname: "original-user",
};

describe("UserDetailsTab", () => {
	afterEach(cleanup);

	it("keeps profile fields and administrator controls bound to the shared user form", async () => {
		render(
			<Formik initialValues={initialValues} onSubmit={vi.fn()}>
				<div>
					<UserDetailsTab canManageUser />
					<FormState />
				</div>
			</Formik>,
		);

		expect(screen.getByLabelText("user.full-name")).toHaveValue("Original User");
		expect(screen.getByLabelText("user.nickname")).toHaveValue("original-user");
		expect(screen.getByLabelText("email-address")).toHaveValue("owner@example.test");

		fireEvent.change(screen.getByLabelText("user.full-name"), { target: { value: "Updated User" } });
		fireEvent.change(screen.getByLabelText("user.nickname"), { target: { value: "updated-user" } });
		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "updated@example.test" } });
		fireEvent.click(screen.getByRole("button", { name: "isAdmin" }));
		fireEvent.click(screen.getByRole("button", { name: "isDisabled" }));

		await waitFor(() => {
			expect(getFormState()).toMatchObject({
				email: "updated@example.test",
				isAdmin: true,
				isDisabled: true,
				name: "Updated User",
				nickname: "updated-user",
			});
		});
	});

	it("hides administrator controls when editing the current user", () => {
		render(
			<Formik initialValues={initialValues} onSubmit={vi.fn()}>
				<UserDetailsTab canManageUser={false} />
			</Formik>,
		);

		expect(screen.queryByRole("button", { name: "isAdmin" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "isDisabled" })).not.toBeInTheDocument();
	});
});
