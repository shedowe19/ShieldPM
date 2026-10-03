import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProxyHostFirewallSettings from "./ProxyHostFirewallSettings";
import {
	createProxyHostFirewallPolicy,
	createProxyHostInitialValues,
	type ProxyHostFormValues,
} from "./ProxyHostModalFormValues";

const mocks = vi.hoisted(() => ({
	useFirewallLists: vi.fn(),
}));

vi.mock("src/hooks/useFirewallLists", () => ({ useFirewallLists: mocks.useFirewallLists }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="firewall-form-state">{JSON.stringify(values)}</output>;
};

const state = () => JSON.parse(screen.getByTestId("firewall-form-state").textContent || "{}") as ProxyHostFormValues;
const renderSettings = (overrides: Partial<ProxyHostFormValues> = {}) =>
	render(
		<Formik initialValues={{ ...createProxyHostInitialValues(), ...overrides }} onSubmit={vi.fn()}>
			<Form>
				<ProxyHostFirewallSettings />
				<FormState />
			</Form>
		</Formik>,
	);

const enabledMeta = (): NonNullable<ProxyHostFormValues["meta"]> => ({
	ipFirewall: createProxyHostFirewallPolicy({ enabled: true }),
});

describe("ProxyHostFirewallSettings", () => {
	beforeEach(() =>
		mocks.useFirewallLists.mockReturnValue({
			data: [
				{ id: 4, name: "VPN networks", entryCount: 1234, enabled: true },
				{ id: 8, name: "Paused list", entryCount: 2, enabled: false },
			],
			isLoading: false,
			isError: false,
		}),
	);
	afterEach(cleanup);

	it("starts disabled and retains configured rules when toggling protection", async () => {
		const meta = enabledMeta();
		if (meta.ipFirewall) {
			meta.ipFirewall.enabled = false;
			meta.ipFirewall.listIds = [4];
			meta.ipFirewall.denylist = [{ address: "203.0.113.0/24", reason: "Repeated abuse" }];
		}
		renderSettings({ accessListId: 7, meta });
		expect(screen.queryByLabelText("firewall.host.publicMessage")).not.toBeInTheDocument();
		expect(mocks.useFirewallLists).toHaveBeenLastCalledWith({ enabled: false });
		fireEvent.click(screen.getByRole("switch", { name: "firewall.host.title" }));
		await waitFor(() => expect(state().meta?.ipFirewall?.enabled).toBe(true));
		expect(screen.getByLabelText("VPN networks")).toBeChecked();
		fireEvent.click(screen.getByRole("switch", { name: "firewall.host.title" }));
		await waitFor(() =>
			expect(state()).toMatchObject({
				accessListId: 7,
				meta: {
					ipFirewall: {
						enabled: false,
						listIds: [4],
						denylist: [{ address: "203.0.113.0/24", reason: "Repeated abuse" }],
					},
				},
			}),
		);
	});

	it("selects lists per host, explains paused lists and preserves unavailable assignments", async () => {
		const meta = enabledMeta();
		if (meta.ipFirewall) meta.ipFirewall.listIds = [99];
		renderSettings({ meta });
		expect(screen.getByLabelText("firewall.host.listUnavailable")).toBeChecked();
		expect(screen.getByText("firewall.host.listDisabled")).toBeInTheDocument();
		fireEvent.click(screen.getByLabelText("VPN networks"));
		await waitFor(() => expect(state().meta?.ipFirewall?.listIds).toEqual([99, 4]));
		fireEvent.click(screen.getByLabelText("firewall.host.listUnavailable"));
		await waitFor(() => expect(state().meta?.ipFirewall?.listIds).toEqual([4]));
	});

	it("keeps the text editor usable for multiple exception lines and skips full-line comments", async () => {
		renderSettings({ meta: enabledMeta() });
		const input = screen.getByLabelText("firewall.host.allowlist");
		const text = "198.51.100.42\n# Trusted office\n2001:db8::/32\n";
		fireEvent.change(input, { target: { value: text } });
		await waitFor(() => expect(state().meta?.ipFirewall?.allowlist).toEqual(["198.51.100.42", "2001:db8::/32"]));
		expect(input).toHaveValue(text);
	});

	it("adds a manual IP with a public reason and keeps internal notes separate", async () => {
		renderSettings({ accessListId: 7, meta: { ...enabledMeta(), unrelatedSetting: "preserved" } });
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.addEntry" }));
		fireEvent.change(await screen.findByLabelText("firewall.host.address"), {
			target: { value: "203.0.113.0/24" },
		});
		fireEvent.change(screen.getByLabelText("firewall.host.reason"), { target: { value: "Repeated abuse" } });
		fireEvent.change(screen.getByLabelText("firewall.host.publicMessage"), {
			target: { value: "Please contact support." },
		});
		fireEvent.change(screen.getByLabelText("firewall.host.internalNote"), {
			target: { value: "Internal case reference" },
		});
		await waitFor(() =>
			expect(state()).toMatchObject({
				accessListId: 7,
				meta: {
					unrelatedSetting: "preserved",
					ipFirewall: {
						denylist: [{ address: "203.0.113.0/24", reason: "Repeated abuse" }],
						publicMessage: "Please contact support.",
						internalNote: "Internal case reference",
					},
				},
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.removeEntry" }));
		await waitFor(() => expect(state().meta?.ipFirewall?.denylist).toEqual([]));
	});

	it("allows manual host settings when list access fails without clearing saved list selections", async () => {
		mocks.useFirewallLists.mockReturnValue({ data: undefined, isLoading: false, isError: true });
		const meta = enabledMeta();
		if (meta.ipFirewall) meta.ipFirewall.listIds = [4];
		renderSettings({ meta });
		expect(screen.getByText("firewall.host.listsError")).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("firewall.host.publicMessage"), {
			target: { value: "Updated message" },
		});
		await waitFor(() =>
			expect(state().meta?.ipFirewall).toMatchObject({ listIds: [4], publicMessage: "Updated message" }),
		);
	});

	it("previews the actual block page in a sandbox and updates its public message while keeping notes private", async () => {
		const meta = enabledMeta();
		if (meta.ipFirewall) {
			meta.ipFirewall.internalNote = "PRIVATE REFERENCE";
			meta.ipFirewall.listIds = [4];
		}
		renderSettings({ domainNames: ["app.example.test"], meta });
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.preview" }));
		const preview = screen.getByTitle("firewall.host.previewTitle");
		expect(preview).toHaveAttribute("sandbox", "");
		expect(preview.getAttribute("srcdoc")).toContain("app.example.test");
		expect(preview.getAttribute("srcdoc")).toContain("VPN networks");
		expect(preview.getAttribute("srcdoc")).not.toContain("PRIVATE REFERENCE");
		fireEvent.change(screen.getByLabelText("firewall.host.publicMessage"), {
			target: { value: "Changed public message" },
		});
		await waitFor(() => expect(preview.getAttribute("srcdoc")).toContain("Changed public message"));
	});
});
