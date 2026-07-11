import { render, screen } from "@testing-library/react";
import { Formik } from "formik";
import type { AccessListClient, AccessListItem } from "src/api/backend";
import { ACCESS_LIST_AUTH_TYPE } from "src/types/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccessListFormTabs from "./AccessListFormTabs";
import { type AccessListFormValues, createAccessListInitialValues } from "./AccessListModalFormValues";

const mocks = vi.hoisted(() => ({
	authorizationTabs: vi.fn(),
}));

vi.mock("./AccessListAuthorizationTabs", () => ({
	default: (props: unknown) => {
		mocks.authorizationTabs(props);
		return <div data-testid="authorization-tabs" />;
	},
}));
vi.mock("./AccessListDetailsTab", () => ({ default: () => <div data-testid="details-tab" /> }));
vi.mock("./AccessListMtlsTab", () => ({ default: () => <div data-testid="mtls-tab" /> }));
vi.mock("./AccessListSsoTab", () => ({ default: () => <div data-testid="sso-tab" /> }));
vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));

const clients = [{ address: "10.0.0.0/8", directive: "allow" }] as AccessListClient[];
const items = [{ password: "hashed-password", username: "operator" }] as AccessListItem[];

const renderTabs = (authType: string) =>
	render(
		<Formik<AccessListFormValues>
			initialValues={{ ...createAccessListInitialValues(), authType }}
			onSubmit={() => undefined}
		>
			<AccessListFormTabs clients={clients} items={items} />
		</Formik>,
	);

describe("AccessListFormTabs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps the authorization tabs enabled for a basic-auth access list", () => {
		renderTabs(ACCESS_LIST_AUTH_TYPE.NONE);

		expect(screen.getByText("column.details")).toBeInTheDocument();
		expect(screen.getByTestId("details-tab")).toBeInTheDocument();
		expect(screen.getByTestId("authorization-tabs")).toBeInTheDocument();
		expect(screen.getByTestId("sso-tab")).toBeInTheDocument();
		expect(screen.getByTestId("mtls-tab")).toBeInTheDocument();
		expect(mocks.authorizationTabs.mock.calls[0]?.[0]).toMatchObject({ clients, isSsoEnabled: false, items });
	});

	it("keeps the authorization tabs disabled when SSO owns authentication", () => {
		renderTabs(ACCESS_LIST_AUTH_TYPE.OIDC);

		expect(mocks.authorizationTabs.mock.calls[0]?.[0]).toMatchObject({ clients, isSsoEnabled: true, items });
	});
});
