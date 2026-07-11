import { fireEvent, render, screen } from "@testing-library/react";
import { Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UserAvatarTab from "./UserAvatarTab";

vi.mock("src/components", () => ({
	UserAvatar: ({ name, url }: { name: string; url?: string }) => (
		<span data-name={name} data-testid="avatar-preview" data-url={url} />
	),
}));

vi.mock("src/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => <input {...props} /> }));

vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/toggle-group", () => ({
	ToggleGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
	ToggleGroupItem: ({ children, ...props }: PropsWithChildren<ComponentProps<"button">>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

type UserAvatarValues = {
	avatar_type: string;
	avatar_value: string;
	email: string;
	name: string;
};

const FormState = () => {
	const { values } = useFormikContext<UserAvatarValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as UserAvatarValues;

describe("UserAvatarTab", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("previews a selected upload and forwards a replacement file without changing the shared form values", () => {
		const selectedFile = new File(["avatar"], "avatar.png", { type: "image/png" });
		const replacementFile = new File(["replacement"], "replacement.png", { type: "image/png" });
		const onSelectedFileChange = vi.fn();

		render(
			<Formik
				initialValues={{
					avatar_type: "upload",
					avatar_value: "",
					email: "avatar@example.test",
					name: "Avatar User",
				}}
				onSubmit={vi.fn()}
			>
				<div>
					<UserAvatarTab
						avatar="/avatars/persisted.png"
						onSelectedFileChange={onSelectedFileChange}
						selectedFile={selectedFile}
						selectedFileUrl="blob:avatar-preview"
					/>
					<FormState />
				</div>
			</Formik>,
		);

		expect(screen.getByTestId("avatar-preview")).toHaveAttribute("data-url", "blob:avatar-preview");

		fireEvent.change(screen.getByLabelText("user.avatar.upload-image"), {
			target: { files: [replacementFile] },
		});

		expect(onSelectedFileChange).toHaveBeenCalledWith(replacementFile);
		expect(getFormState()).toEqual({
			avatar_type: "upload",
			avatar_value: "",
			email: "avatar@example.test",
			name: "Avatar User",
		});
	});
});
