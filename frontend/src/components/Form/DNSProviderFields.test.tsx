import { cleanup, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import { afterEach, expect, it, vi } from "vitest";
import { DNSProviderFields } from "./DNSProviderFields";

vi.mock("src/hooks", () => ({
	useDnsProviders: () => ({
		data: [{ id: "cloudflare", name: "Cloudflare", credentials: "template" }],
		isLoading: false,
	}),
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
afterEach(cleanup);
it("restores the selected DNS provider and entered credentials after remounting the SSL tab", () => {
	render(
		<Formik
			initialValues={{
				meta: { dnsProvider: "cloudflare", dnsProviderCredentials: "dns_cloudflare_api_token = kept-secret" },
			}}
			onSubmit={vi.fn()}
		>
			<DNSProviderFields />
		</Formik>,
	);
	expect(screen.getByText("Cloudflare")).toBeInTheDocument();
	expect(screen.getByLabelText("certificates.dns.credentials")).toHaveValue("dns_cloudflare_api_token = kept-secret");
});
