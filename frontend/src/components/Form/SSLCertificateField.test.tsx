import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SSLCertificateField } from "./SSLCertificateField";
import { SSLOptionsFields } from "./SSLOptionsFields";

vi.mock("src/hooks", () => ({
	useCertificates: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("src/hooks/useAcmeProfile", () => ({
	useAcmeProfile: () => ({ data: { profile: "standard" }, isPending: false, isFetching: false, error: null }),
}));
vi.mock("src/components", () => ({ DNSProviderFields: () => null, DomainNamesField: () => null }));
vi.mock("src/locale", () => ({
	formatDateTime: (value: string) => value,
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("src/components/ui/select", () => ({
	Select: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) =>
		["standard", "shortlived", ""].includes(value) ? (
			<select
				aria-label="Certificate profile"
				value={value}
				onChange={(event) => onValueChange(event.target.value)}
			>
				<option value="">Global default</option>
				<option value="standard">Standard</option>
				<option value="shortlived">Short-lived</option>
			</select>
		) : (
			<>
				<button type="button" onClick={() => onValueChange("new")}>
					New certificate
				</button>
				<button type="button" onClick={() => onValueChange("42")}>
					Existing certificate
				</button>
				<button type="button" onClick={() => onValueChange("0")}>
					No certificate
				</button>
			</>
		),
	SelectContent: ({ children }: PropsWithChildren) => <>{children}</>,
	SelectItem: ({ children }: PropsWithChildren) => <>{children}</>,
	SelectTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
	SelectValue: () => null,
}));

const FormState = () => {
	const { values } = useFormikContext();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

afterEach(cleanup);

describe("SSLCertificateField", () => {
	it.each([42, 0])(
		"starts a new request from %s with the current global profile instead of stale host metadata",
		async (certificateId) => {
			render(
				<Formik
					initialValues={{ certificateId, meta: { letsencryptProfile: "shortlived", nginxOnline: true } }}
					onSubmit={() => undefined}
				>
					<Form>
						<SSLCertificateField allowNew />
						<SSLOptionsFields />
						<FormState />
					</Form>
				</Formik>,
			);
			fireEvent.click(screen.getByRole("button", { name: "New certificate" }));
			await waitFor(() => {
				expect(screen.getByRole("combobox", { name: "Certificate profile" })).toHaveValue("standard");
				expect(JSON.parse(screen.getByTestId("form-state").textContent || "{}").meta).toEqual({
					letsencryptProfile: "standard",
					nginxOnline: true,
				});
			});
			fireEvent.change(screen.getByRole("combobox", { name: "Certificate profile" }), {
				target: { value: "shortlived" },
			});
			fireEvent.click(screen.getByRole("button", { name: "New certificate" }));
			await waitFor(() =>
				expect(screen.getByRole("combobox", { name: "Certificate profile" })).toHaveValue("shortlived"),
			);
		},
	);
	it.each(["Existing certificate", "No certificate"])(
		"removes abandoned DNS credentials when choosing %s, preserving unrelated metadata",
		async (choice) => {
			render(
				<Formik
					initialValues={{
						certificateId: "new",
						meta: {
							dnsChallenge: true,
							dnsProvider: "cloudflare",
							dnsProviderCredentials: "synthetic-test-token",
							propagationSeconds: 0,
							letsencryptProfile: "shortlived",
							nginxOnline: true,
						},
					}}
					onSubmit={() => undefined}
				>
					<Form>
						<SSLCertificateField allowNew />
						<FormState />
					</Form>
				</Formik>,
			);

			fireEvent.click(screen.getByRole("button", { name: choice }));

			await waitFor(() => {
				const values = JSON.parse(screen.getByTestId("form-state").textContent || "{}");
				expect(values.certificateId).toBe(choice === "Existing certificate" ? 42 : 0);
				expect(values.meta).toEqual({ nginxOnline: true });
			});
		},
	);
});
