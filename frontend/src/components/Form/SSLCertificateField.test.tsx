import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SSLCertificateField } from "./SSLCertificateField";

vi.mock("src/hooks", () => ({
	useCertificates: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("src/locale", () => ({
	formatDateTime: (value: string) => value,
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("src/components/ui/select", () => ({
	Select: ({ onValueChange }: { onValueChange: (value: string) => void }) => (
		<>
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
