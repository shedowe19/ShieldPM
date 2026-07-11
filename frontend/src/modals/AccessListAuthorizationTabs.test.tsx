import { cleanup, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import { Tabs } from "src/components/ui/tabs";
import { ACCESS_LIST_TAB } from "src/types/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccessListAuthorizationTabs from "./AccessListAuthorizationTabs";

vi.mock("src/components", () => ({
	AccessClientFields: () => <input aria-label="access rules" />,
	BasicAuthFields: () => <input aria-label="basic authentication" />,
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));

afterEach(cleanup);

type Values = {
	clients: [];
	items: [];
};

const renderTabs = (activeTab: string, isSsoEnabled = true) =>
	render(
		<Formik<Values> initialValues={{ clients: [], items: [] }} onSubmit={() => {}}>
			<Tabs defaultValue={activeTab}>
				<AccessListAuthorizationTabs clients={[]} isSsoEnabled={isSsoEnabled} items={[]} />
			</Tabs>
		</Formik>,
	);

describe("AccessListAuthorizationTabs", () => {
	it("disables basic authentication fields while SSO is enabled", () => {
		renderTabs(ACCESS_LIST_TAB.AUTH);

		expect(screen.getByText("access-list.sso.authentication-handled")).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "basic authentication" })).toBeDisabled();
	});

	it("disables access rule fields while SSO is enabled", () => {
		renderTabs(ACCESS_LIST_TAB.RULES);

		expect(screen.getByText("access-list.sso.rules-handled")).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "access rules" })).toBeDisabled();
	});

	it("keeps basic authentication fields enabled while SSO is disabled", () => {
		renderTabs(ACCESS_LIST_TAB.AUTH, false);

		expect(screen.queryByText("access-list.sso.authentication-handled")).not.toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "basic authentication" })).toBeEnabled();
	});
});
