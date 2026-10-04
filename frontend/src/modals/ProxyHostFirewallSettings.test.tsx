import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProxyHostFirewallSettings from "./ProxyHostFirewallSettings";
import {
	createProxyHostFirewallPolicy,
	createProxyHostInitialValues,
	type ProxyHostFormValues,
} from "./ProxyHostModalFormValues";

const mocks = vi.hoisted(() => ({
	useFirewallLists: vi.fn(),
	useFirewallGeoip: vi.fn(),
	refetchGeoip: vi.fn(),
}));

vi.mock("src/hooks/useFirewallLists", () => ({ useFirewallLists: mocks.useFirewallLists }));
vi.mock("src/hooks/useFirewallGeoip", () => ({ useFirewallGeoip: mocks.useFirewallGeoip }));
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

const MountableSettings = () => {
	const [mounted, setMounted] = useState(true);
	return (
		<>
			<button type="button" onClick={() => setMounted(!mounted)}>
				Switch settings tab
			</button>
			{mounted && <ProxyHostFirewallSettings />}
		</>
	);
};

describe("ProxyHostFirewallSettings", () => {
	beforeEach(() => {
		mocks.refetchGeoip.mockClear();
		mocks.useFirewallGeoip.mockReturnValue({
			data: {
				available: true,
				moduleEnabled: true,
				databasePresent: true,
				reason: null,
				asn: { available: true, moduleEnabled: true, databasePresent: true, reason: null },
			},
			isLoading: false,
			isError: false,
			refetch: mocks.refetchGeoip,
		});
		mocks.useFirewallLists.mockReturnValue({
			data: [
				{ id: 4, name: "VPN networks", entryCount: 1234, enabled: true },
				{ id: 8, name: "Paused list", entryCount: 2, enabled: false },
			],
			isLoading: false,
			isError: false,
		});
	});
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

	it("lets a host owner explicitly remove a saved list when list access fails", async () => {
		mocks.useFirewallLists.mockReturnValue({ data: undefined, isLoading: false, isError: true });
		const meta = {
			ipFirewall: createProxyHostFirewallPolicy({
				enabled: true,
				listIds: [4],
				denylist: [{ address: "203.0.113.0/24", reason: "Keep this manual rule" }],
			}),
		};
		renderSettings({ meta });
		const assignment = screen.getByLabelText("firewall.host.listUnavailable");
		expect(assignment).toBeChecked();
		fireEvent.click(assignment);
		await waitFor(() =>
			expect(state().meta?.ipFirewall).toMatchObject({
				enabled: true,
				listIds: [],
				denylist: [{ address: "203.0.113.0/24", reason: "Keep this manual rule" }],
			}),
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

	it("selects countries per host, edits the public country reason and enables unknown countries explicitly", async () => {
		renderSettings({ accessListId: 7, meta: enabledMeta() });
		expect(screen.getByRole("switch", { name: "firewall.host.countries.blockUnknown" })).not.toBeChecked();
		const input = screen.getByLabelText("firewall.host.countries.selection");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Germany" } });
		fireEvent.click(await screen.findByText("Germany · DE"));
		fireEvent.change(screen.getByLabelText("firewall.host.countries.reason"), {
			target: { value: "This country is restricted for this host." },
		});
		fireEvent.click(screen.getByRole("switch", { name: "firewall.host.countries.blockUnknown" }));
		await waitFor(() =>
			expect(state()).toMatchObject({
				accessListId: 7,
				meta: {
					ipFirewall: {
						countryDenylist: ["DE"],
						countryReason: "This country is restricted for this host.",
						blockUnknownCountry: true,
					},
				},
			}),
		);
	});

	it("prevents new country filters while GeoIP is loading and leaves IP protection editable", async () => {
		mocks.useFirewallGeoip.mockReturnValue({
			data: undefined,
			isLoading: true,
			isError: false,
			refetch: mocks.refetchGeoip,
		});
		renderSettings({ meta: enabledMeta() });
		expect(screen.getByText("firewall.host.geoip.loading")).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "firewall.host.countries.blockUnknown" })).toBeDisabled();
		const input = screen.getByLabelText("firewall.host.countries.selection");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Germany" } });
		fireEvent.click(await screen.findByText("Germany · DE"));
		expect(state().meta?.ipFirewall?.countryDenylist).toEqual([]);
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.addEntry" }));
		expect(await screen.findByLabelText("firewall.host.address")).toBeInTheDocument();
	});

	it("retains saved country rules on a disabled firewall while permitting explicit removal without GeoIP", async () => {
		mocks.useFirewallGeoip.mockReturnValue({
			data: { available: false, moduleEnabled: true, databasePresent: false, reason: "database_missing" },
			isLoading: false,
			isError: false,
			refetch: mocks.refetchGeoip,
		});
		const meta = {
			ipFirewall: createProxyHostFirewallPolicy({
				enabled: false,
				countryDenylist: ["DE"],
				countryReason: "Saved reason",
				blockUnknownCountry: true,
			}),
		};
		renderSettings({ meta });
		expect(screen.getByRole("switch", { name: "firewall.host.title" })).toBeDisabled();
		expect(screen.getByText("firewall.host.geoip.databaseMissing")).toBeInTheDocument();
		expect(state().meta?.ipFirewall?.countryDenylist).toEqual(["DE"]);
		fireEvent.click(screen.getByRole("button", { name: "Remove Germany · DE" }));
		fireEvent.click(screen.getByRole("switch", { name: "firewall.host.countries.blockUnknown" }));
		await waitFor(() =>
			expect(state().meta?.ipFirewall).toMatchObject({
				countryDenylist: [],
				countryReason: "Saved reason",
				blockUnknownCountry: false,
			}),
		);
		expect(screen.getByRole("switch", { name: "firewall.host.title" })).not.toBeDisabled();
		fireEvent.click(screen.getByRole("switch", { name: "firewall.host.title" }));
		await waitFor(() => expect(state().meta?.ipFirewall?.enabled).toBe(true));
	});

	it("displays readiness failures and lets administrators retry without assuming GeoIP is available", () => {
		mocks.useFirewallGeoip.mockReturnValue({
			data: { available: true, moduleEnabled: true, databasePresent: true, reason: null },
			isLoading: false,
			isError: true,
			refetch: mocks.refetchGeoip,
		});
		renderSettings({ meta: enabledMeta() });
		expect(screen.getByText("firewall.host.geoip.error")).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "firewall.host.countries.blockUnknown" })).toBeDisabled();
		fireEvent.click(screen.getAllByRole("button", { name: "firewall.host.geoip.retry" })[0]);
		expect(mocks.refetchGeoip).toHaveBeenCalledOnce();
	});

	it("accepts AS-prefixed and numeric ASN input with public reasons without changing other rules", async () => {
		renderSettings({ accessListId: 7, meta: enabledMeta() });
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.asn.add" }));
		fireEvent.change(screen.getByLabelText("firewall.host.asn.number"), { target: { value: "AS13335" } });
		fireEvent.change(screen.getByLabelText("firewall.host.asn.reason"), { target: { value: "Network policy" } });
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.asn.add" }));
		fireEvent.change(screen.getAllByLabelText("firewall.host.asn.number")[1], { target: { value: "4294967295" } });
		await waitFor(() =>
			expect(state()).toMatchObject({
				accessListId: 7,
				meta: {
					ipFirewall: {
						asnDenylist: [
							{ asn: 13335, reason: "Network policy" },
							{ asn: 4294967295, reason: "" },
						],
						countryDenylist: [],
						denylist: [],
					},
				},
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.preview" }));
		expect(screen.getByTitle("firewall.host.previewTitle").getAttribute("srcdoc")).toContain("AS13335");
		fireEvent.click(screen.getAllByRole("button", { name: "firewall.host.asn.remove" })[0]);
		await waitFor(() => expect(state().meta?.ipFirewall?.asnDenylist).toEqual([{ asn: 4294967295, reason: "" }]));
		expect(screen.getByLabelText("firewall.host.asn.number")).toHaveValue("4294967295");
	});

	it("retains invalid and duplicate ASN rows visibly instead of dropping them from the draft", async () => {
		renderSettings({
			meta: {
				ipFirewall: createProxyHostFirewallPolicy({ enabled: true, asnDenylist: [{ asn: 13335, reason: "" }] }),
			},
		});
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.asn.add" }));
		const input = screen.getAllByLabelText("firewall.host.asn.number")[1];
		fireEvent.change(input, { target: { value: "AS4294967296" } });
		await waitFor(() =>
			expect(state().meta?.ipFirewall?.asnDenylist).toEqual([
				{ asn: 13335, reason: "" },
				{ asn: 0, reason: "" },
			]),
		);
		expect(input).toHaveValue("AS4294967296");
		expect(input).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByText("firewall.host.asn.invalid")).toBeInTheDocument();
		fireEvent.change(input, { target: { value: "as13335" } });
		await waitFor(() => expect(screen.getAllByText("firewall.host.asn.duplicate")).toHaveLength(2));
	});

	it("keeps the full invalid ASN input across tab unmounts without putting raw text in the payload", async () => {
		render(
			<Formik initialValues={createProxyHostInitialValues({ meta: enabledMeta() })} onSubmit={vi.fn()}>
				<Form>
					<MountableSettings />
					<FormState />
				</Form>
			</Formik>,
		);
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.asn.add" }));
		fireEvent.change(screen.getByLabelText("firewall.host.asn.number"), { target: { value: "AS-invalid-draft" } });
		fireEvent.click(screen.getByRole("button", { name: "Switch settings tab" }));
		expect(screen.queryByLabelText("firewall.host.asn.number")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Switch settings tab" }));
		expect(screen.getByLabelText("firewall.host.asn.number")).toHaveValue("AS-invalid-draft");
		expect(screen.getByLabelText("firewall.host.asn.number")).toHaveAttribute("aria-invalid", "true");
		await waitFor(() => expect(state().meta?.ipFirewall?.asnDenylist).toEqual([{ asn: 0, reason: "" }]));
		expect(JSON.stringify(state())).not.toContain("AS-invalid-draft");
	});

	it("keeps saved ASN rules removable while missing ASN data blocks additions and reactivation", async () => {
		mocks.useFirewallGeoip.mockReturnValue({
			data: {
				available: true,
				moduleEnabled: true,
				databasePresent: true,
				reason: null,
				asn: { available: false, moduleEnabled: true, databasePresent: false, reason: "database_missing" },
			},
			isLoading: false,
			isError: false,
			refetch: mocks.refetchGeoip,
		});
		renderSettings({
			meta: {
				ipFirewall: createProxyHostFirewallPolicy({
					enabled: false,
					asnDenylist: [{ asn: 13335, reason: "Saved reason" }],
				}),
			},
		});
		expect(screen.getByRole("switch", { name: "firewall.host.title" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "firewall.host.asn.add" })).toBeDisabled();
		expect(screen.getByLabelText("firewall.host.asn.number")).toBeDisabled();
		expect(screen.getByText("firewall.host.asn.databaseMissing")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.asn.remove" }));
		await waitFor(() => expect(state().meta?.ipFirewall?.asnDenylist).toEqual([]));
		expect(screen.getByRole("switch", { name: "firewall.host.title" })).not.toBeDisabled();
		fireEvent.click(screen.getByRole("switch", { name: "firewall.host.title" }));
		await waitFor(() => expect(state().meta?.ipFirewall?.enabled).toBe(true));
		expect(screen.getByRole("switch", { name: "firewall.host.countries.blockUnknown" })).not.toBeDisabled();
	});

	it("allows ASN rules independently when country lookup is unavailable", async () => {
		mocks.useFirewallGeoip.mockReturnValue({
			data: {
				available: false,
				moduleEnabled: true,
				databasePresent: false,
				reason: "database_missing",
				asn: { available: true, moduleEnabled: true, databasePresent: true, reason: null },
			},
			isLoading: false,
			isError: false,
			refetch: mocks.refetchGeoip,
		});
		renderSettings({ meta: enabledMeta() });
		expect(screen.getByRole("button", { name: "firewall.host.asn.add" })).not.toBeDisabled();
		expect(screen.getByRole("switch", { name: "firewall.host.countries.blockUnknown" })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "firewall.host.asn.add" }));
		fireEvent.change(screen.getByLabelText("firewall.host.asn.number"), { target: { value: "AS13335" } });
		await waitFor(() => expect(state().meta?.ipFirewall?.asnDenylist).toEqual([{ asn: 13335, reason: "" }]));
	});

	it.each([
		{ isLoading: true, isError: false },
		{ isLoading: false, isError: true },
	])("never assumes cached ASN availability after a loading or failed capability request: %s", (requestState) => {
		mocks.useFirewallGeoip.mockReturnValue({
			data: {
				available: true,
				moduleEnabled: true,
				databasePresent: true,
				reason: null,
				asn: { available: true, moduleEnabled: true, databasePresent: true, reason: null },
			},
			...requestState,
			refetch: mocks.refetchGeoip,
		});
		renderSettings({ meta: enabledMeta() });
		expect(screen.getByRole("button", { name: "firewall.host.asn.add" })).toBeDisabled();
		expect(
			screen.getByText(requestState.isLoading ? "firewall.host.asn.loading" : "firewall.host.asn.error"),
		).toBeInTheDocument();
	});
});
