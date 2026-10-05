import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Field, Form, Formik } from "formik";
import { previewProxyHost } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostConfigPreview from "./ProxyHostConfigPreview";
import { createProxyHostFirewallPolicy } from "./ProxyHostModalFormValues";

vi.mock("src/api/backend", () => ({ previewProxyHost: vi.fn() }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <>{id}</> }));

const renderForm = (id: number | "new", asnDenylist: { asn: number; reason: string }[] = []) => {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Formik
				initialValues={{
					domainNames: ["app.test"],
					forwardScheme: "http",
					forwardHost: "old.test",
					forwardPort: 8080,
					meta: { ipFirewall: createProxyHostFirewallPolicy({ asnDenylist }) },
				}}
				onSubmit={vi.fn()}
			>
				<Form>
					<Field name="forwardHost" aria-label="Forward host" />
					<ProxyHostConfigPreview id={id} />
				</Form>
			</Formik>
		</QueryClientProvider>,
	);
};

describe("ProxyHostConfigPreview", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("previews the current unsaved form and hides stale output after an edit", async () => {
		vi.mocked(previewProxyHost).mockResolvedValue({
			config: "server_name app.test;",
			diff: "+server_name app.test;",
			hasCurrent: false,
			nginxValidated: false,
			limitations: ["render-only", "id-pending"],
		});
		renderForm("new");
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.config-preview.action" }));
		await waitFor(() =>
			expect(screen.getByTestId("host-config-preview")).toHaveTextContent("server_name app.test"),
		);
		expect(vi.mocked(previewProxyHost).mock.calls[0][0]).toMatchObject({ forwardHost: "old.test" });
		expect(screen.getByText("proxy-host.config-preview.render-only")).toBeInTheDocument();
		fireEvent.change(screen.getByRole("textbox", { name: "Forward host" }), { target: { value: "new.test" } });
		expect(screen.queryByTestId("host-config-preview")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.config-preview.action" }));
		await waitFor(() =>
			expect(vi.mocked(previewProxyHost).mock.calls[1][0]).toMatchObject({ forwardHost: "new.test" }),
		);
	});

	it("uses an existing host ID and switches from diff to the rendered config", async () => {
		vi.mocked(previewProxyHost).mockResolvedValue({
			config: "listen 8080;",
			diff: "-listen 80;\n+listen 8080;",
			hasCurrent: true,
			nginxValidated: false,
			limitations: ["render-only"],
		});
		renderForm(7);
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.config-preview.action" }));
		await waitFor(() => expect(screen.getByTestId("host-config-preview")).toHaveTextContent("-listen 80;"));
		expect(vi.mocked(previewProxyHost).mock.calls[0][0]).toMatchObject({ id: 7 });
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.config-preview.config" }));
		expect(screen.getByTestId("host-config-preview")).toHaveTextContent("listen 8080;");
		expect(screen.getByTestId("host-config-preview")).not.toHaveTextContent("-listen 80;");
	});
	it("explains summarized firewall rules when the server bounds the preview", async () => {
		vi.mocked(previewProxyHost).mockResolvedValue({
			config: "# firewall rules: entries=200000 sha256=example",
			diff: "+# firewall rules: entries=200000 sha256=example",
			hasCurrent: true,
			nginxValidated: false,
			limitations: ["render-only", "firewall-rule-summaries"],
		});
		renderForm(7);
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.config-preview.action" }));
		await waitFor(() =>
			expect(screen.getByText("proxy-host.config-preview.firewall-rule-summaries")).toBeInTheDocument(),
		);
		expect(screen.getByTestId("host-config-preview")).toHaveTextContent("entries=200000");
	});

	it("blocks config requests for invalid ASN drafts and explains how to fix them", () => {
		renderForm(7, [{ asn: 0, reason: "Incomplete rule" }]);
		const action = screen.getByRole("button", { name: "proxy-host.config-preview.action" });
		expect(action).toBeDisabled();
		expect(screen.getByRole("alert")).toHaveTextContent("firewall.host.asn.fixErrors");
		fireEvent.click(action);
		expect(previewProxyHost).not.toHaveBeenCalled();
	});

	it("previews valid ASN rules as numeric policy values with their public reason", async () => {
		vi.mocked(previewProxyHost).mockResolvedValue({
			config: "# ASN rules",
			diff: "+# ASN rules",
			hasCurrent: true,
			nginxValidated: false,
			limitations: ["render-only"],
		});
		renderForm(7, [{ asn: 13335, reason: "Network policy" }]);
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.config-preview.action" }));
		await waitFor(() =>
			expect(previewProxyHost).toHaveBeenCalledWith(
				expect.objectContaining({
					meta: expect.objectContaining({
						ipFirewall: expect.objectContaining({
							asnDenylist: [{ asn: 13335, reason: "Network policy" }],
						}),
					}),
				}),
			),
		);
	});
});
