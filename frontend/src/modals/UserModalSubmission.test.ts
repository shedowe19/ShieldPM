import { AVATAR_TYPE, USER_ROLE } from "src/types/enums";
import { describe, expect, it } from "vitest";
import type { UserDetailsFormValues } from "./UserDetailsTab";
import { createUserPayload } from "./UserModalSubmission";

const createValues = (overrides: Partial<UserDetailsFormValues> = {}): UserDetailsFormValues => ({
	avatar_type: AVATAR_TYPE.UPLOAD,
	avatar_value: "https://avatars.example.test/operator.png",
	email: "operator@example.test",
	isAdmin: false,
	isDisabled: false,
	name: "Operator",
	nickname: "operator",
	...overrides,
});

describe("createUserPayload", () => {
	it("serializes editable fields for an administrator-managed user", () => {
		const payload = createUserPayload({
			id: 73,
			isCurrentUser: false,
			values: createValues({ isAdmin: true, isDisabled: true }),
		});

		expect(payload).toEqual({
			email: "operator@example.test",
			id: 73,
			is_disabled: true,
			name: "Operator",
			nickname: "operator",
			roles: [USER_ROLE.ADMIN],
		});
	});

	it("omits self-lockout and role fields when editing the current user", () => {
		const payload = createUserPayload({
			id: 73,
			isCurrentUser: true,
			values: createValues({ isAdmin: true, isDisabled: true }),
		});

		expect(payload).toEqual({
			email: "operator@example.test",
			id: 73,
			name: "Operator",
			nickname: "operator",
		});
		expect(payload).not.toHaveProperty("is_disabled");
		expect(payload).not.toHaveProperty("roles");
	});

	it("preserves the current-user route identifier", () => {
		const payload = createUserPayload({
			id: "me",
			isCurrentUser: true,
			values: createValues(),
		});

		expect(payload).toMatchObject({ id: "me" });
	});

	it("marks a new user with an undefined identifier", () => {
		const payload = createUserPayload({
			id: "new",
			isCurrentUser: false,
			values: createValues(),
		});

		expect(payload).toMatchObject({ id: undefined, roles: [] });
	});

	it.each([73, "me", "new"] as const)("includes custom avatar settings for user %s", (id) => {
		const payload = createUserPayload({
			id,
			isCurrentUser: id === "me",
			values: createValues({ avatar_type: AVATAR_TYPE.URL, avatar_value: "https://example.test/avatar.png" }),
		});

		expect(payload).toMatchObject({
			avatar_type: AVATAR_TYPE.URL,
			avatar_value: "https://example.test/avatar.png",
		});
	});

	it("clears obsolete URL metadata when switching back to Gravatar", () => {
		const payload = createUserPayload({
			id: 73,
			isCurrentUser: true,
			values: createValues({ avatar_type: AVATAR_TYPE.GRAVATAR }),
		});

		expect(payload).toMatchObject({ avatar_type: AVATAR_TYPE.GRAVATAR, avatar_value: "" });
	});

	it("leaves uploaded filenames to the upload endpoint, even after a URL avatar was entered", () => {
		const payload = createUserPayload({ id: 73, isCurrentUser: true, values: createValues() });

		expect(payload).not.toHaveProperty("avatar_type");
		expect(payload).not.toHaveProperty("avatar_value");
	});
});
