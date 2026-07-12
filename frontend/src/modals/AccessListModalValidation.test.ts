import { describe, expect, it, vi } from "vitest";
import { type AccessListFormValues, createAccessListInitialValues } from "./AccessListModalFormValues";
import { validateAccessListForm } from "./AccessListModalValidation";

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));

const createValues = (overrides: Partial<AccessListFormValues> = {}): AccessListFormValues => ({
	...createAccessListInitialValues(),
	clients: [],
	items: [],
	mtlsEnabled: false,
	mtlsUseInternal: false,
	...overrides,
});

describe("validateAccessListForm", () => {
	it("keeps the existing access-list validation order and messages", () => {
		expect(validateAccessListForm(createValues())).toBe("error.access.at-least-one");
		expect(
			validateAccessListForm(
				createValues({
					authType: "oidc",
					oidcClientId: "",
					oidcClientSecret: "secret",
					oidcDiscoveryUrl: "url",
				}),
			),
		).toBe("Client ID is required");
		expect(
			validateAccessListForm(
				createValues({
					items: [
						{ password: "first", username: "operator" },
						{ password: "second", username: "operator" },
					],
				}),
			),
		).toBe("error.access.duplicate-usernames");
	});

	it("accepts valid authentication and mTLS configurations", () => {
		expect(
			validateAccessListForm(createValues({ items: [{ password: "secret", username: "operator" }] })),
		).toBeNull();
		expect(validateAccessListForm(createValues({ mtlsContent: "certificate", mtlsEnabled: true }))).toBeNull();
	});
});
