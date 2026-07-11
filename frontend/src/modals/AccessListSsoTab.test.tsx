import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Formik, useFormikContext } from "formik";
import { Tabs } from "src/components/ui/tabs";
import { ACCESS_LIST_AUTH_TYPE, ACCESS_LIST_TAB } from "src/types/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccessListSsoTab from "./AccessListSsoTab";

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: React.ReactNode;
		onValueChange: (value: string) => void;
		value: string;
	}) => (
		<select onChange={(event) => onValueChange(event.target.value)} value={value}>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	SelectValue: () => null,
}));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
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

type Values = {
	authType: string;
	authentikHost: string;
	oauth2ClientId?: string;
	oauth2InsecureOidcAllowUnverifiedEmail?: boolean;
	oauth2OidcIssuerUrl?: string;
	oauth2Provider?: string;
	oauth2Scope?: string;
	oidcClientId?: string;
	oidcClientSecret?: string;
	oidcDiscoveryUrl?: string;
};

const FormState = () => {
	const { values } = useFormikContext<Values>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const getFormState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as Values;

afterEach(() => {
	cleanup();
});

describe("AccessListSsoTab", () => {
	it("keeps the selected SSO provider and Authentik host bound to the access-list form", async () => {
		render(
			<Formik<Values>
				initialValues={{ authType: ACCESS_LIST_AUTH_TYPE.NONE, authentikHost: "" }}
				onSubmit={() => {}}
			>
				<Tabs defaultValue={ACCESS_LIST_TAB.SSO}>
					<AccessListSsoTab />
					<FormState />
				</Tabs>
			</Formik>,
		);

		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY },
		});
		fireEvent.change(screen.getByLabelText("Authentik Host URL"), {
			target: { value: "https://auth.example.test" },
		});

		await waitFor(() => {
			expect(getFormState()).toEqual({
				authType: ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY,
				authentikHost: "https://auth.example.test",
			});
		});
	});

	it("keeps OAuth2 provider-specific fields and the unverified-email option bound to the access-list form", async () => {
		render(
			<Formik<Values>
				initialValues={{
					authType: ACCESS_LIST_AUTH_TYPE.NONE,
					authentikHost: "",
					oauth2ClientId: "",
					oauth2InsecureOidcAllowUnverifiedEmail: false,
					oauth2OidcIssuerUrl: "",
					oauth2Provider: "google",
					oauth2Scope: "",
				}}
				onSubmit={() => {}}
			>
				<Tabs defaultValue={ACCESS_LIST_TAB.SSO}>
					<AccessListSsoTab />
					<FormState />
				</Tabs>
			</Formik>,
		);

		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY },
		});
		fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "oidc" } });
		fireEvent.change(screen.getByLabelText("OIDC Issuer URL"), {
			target: { value: "https://issuer.example.test" },
		});
		fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "oauth-client" } });
		fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "openid email" } });
		fireEvent.click(screen.getByRole("button", { name: "oauth2InsecureOidcAllowUnverifiedEmail" }));

		await waitFor(() => {
			expect(getFormState()).toMatchObject({
				authType: ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY,
				oauth2ClientId: "oauth-client",
				oauth2InsecureOidcAllowUnverifiedEmail: true,
				oauth2OidcIssuerUrl: "https://issuer.example.test",
				oauth2Provider: "oidc",
				oauth2Scope: "openid email",
			});
		});
	});

	it("keeps native OIDC credentials bound to the access-list form", async () => {
		render(
			<Formik<Values>
				initialValues={{
					authType: ACCESS_LIST_AUTH_TYPE.NONE,
					authentikHost: "",
					oidcClientId: "",
					oidcClientSecret: "",
					oidcDiscoveryUrl: "",
				}}
				onSubmit={() => {}}
			>
				<Tabs defaultValue={ACCESS_LIST_TAB.SSO}>
					<AccessListSsoTab />
					<FormState />
				</Tabs>
			</Formik>,
		);

		fireEvent.change(screen.getByRole("combobox"), { target: { value: ACCESS_LIST_AUTH_TYPE.OIDC } });
		fireEvent.change(screen.getByLabelText("Discovery URL"), {
			target: { value: "https://auth.example.test/.well-known/openid-configuration" },
		});
		fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "oidc-client" } });
		fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "oidc-secret" } });

		await waitFor(() => {
			expect(getFormState()).toMatchObject({
				authType: ACCESS_LIST_AUTH_TYPE.OIDC,
				oidcClientId: "oidc-client",
				oidcClientSecret: "oidc-secret",
				oidcDiscoveryUrl: "https://auth.example.test/.well-known/openid-configuration",
			});
		});
	});
});
