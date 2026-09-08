import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import { useState } from "react";
import { FORWARD_SCHEME } from "src/types/enums";
import { afterEach, expect, it, vi } from "vitest";
import { AccessClientFields } from "./AccessClientFields";
import { BasicAuthFields } from "./BasicAuthFields";
import { LocationsFields } from "./LocationsFields";

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
const items = [{ username: "old-user", password: "" }];
const clients = [{ address: "192.0.2.1", directive: "allow" as const }];
const locations = [
	{
		path: "/old",
		forwardHost: "localhost",
		forwardScheme: FORWARD_SCHEME.HTTP,
		forwardPort: 80,
		advancedConfig: "",
		forwardQuery: "",
	},
];
function FormTabs({ kind }: { kind: "items" | "clients" | "locations" }) {
	const [visible, setVisible] = useState(true);
	return (
		<Formik initialValues={{ items, clients, locations }} onSubmit={vi.fn()}>
			<div>
				<button type="button" onClick={() => setVisible(!visible)}>
					Switch tab
				</button>
				{visible &&
					(kind === "items" ? (
						<BasicAuthFields initialValues={items} />
					) : kind === "clients" ? (
						<AccessClientFields initialValues={clients} />
					) : (
						<LocationsFields initialValues={locations} />
					))}
			</div>
		</Formik>
	);
}
afterEach(cleanup);
it.each([
	["items", "old-user", "new-user"],
	["clients", "192.0.2.1", "198.51.100.2"],
	["locations", "/old", "/new"],
] as const)("keeps unsaved %s edits when their tab remounts", (kind, oldValue, newValue) => {
	render(<FormTabs kind={kind} />);
	fireEvent.change(screen.getByDisplayValue(oldValue), { target: { value: newValue } });
	fireEvent.click(screen.getByRole("button", { name: "Switch tab" }));
	fireEvent.click(screen.getByRole("button", { name: "Switch tab" }));
	expect(screen.getByDisplayValue(newValue)).toBeInTheDocument();
});
