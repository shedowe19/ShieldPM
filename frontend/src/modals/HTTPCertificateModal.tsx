import { IconAlertTriangle, IconWorld, IconCheck } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createCertificate, testHttpCertificate } from "src/api/backend";
import { DomainNamesField } from "src/components";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "src/components/ui/alert";
import { Card, CardContent, CardFooter } from "src/components/ui/card";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showHTTPCertificateModal = () => {
	EasyModal.show(HTTPCertificateModal);
};

const HTTPCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [domains, setDomains] = useState([] as string[]);
	const [isTesting, setIsTesting] = useState(false);
	const [testResults, setTestResults] = useState(null as Record<string, string> | null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			await createCertificate(values);
			showObjectSuccess("certificate", "saved");
			remove();
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		queryClient.invalidateQueries({ queryKey: ["certificates"] });
		setIsSubmitting(false);
		setSubmitting(false);
	};

	const handleTest = async () => {
		setIsTesting(true);
		setErrorMsg(null);
		setTestResults(null);
		try {
			const result = await testHttpCertificate(domains);
			setTestResults(result);
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsTesting(false);
	};

	const parseTestResults = () => {
		const elms = [];
		for (const domain in testResults) {
			const status = testResults[domain];
			let message = <T id="certificates.http.reachability-ok" />;
			let color = "text-green-500";

			if (status !== "ok") {
				color = "text-red-500";
				if (status === "no-host") {
					message = <T id="certificates.http.reachability-not-resolved" />;
				} else if (status === "failed") {
					message = <T id="certificates.http.reachability-failed-to-check" />;
				} else if (status === "404") {
					message = <T id="certificates.http.reachability-404" />;
				} else if (status === "wrong-data") {
					message = <T id="certificates.http.reachability-wrong-data" />;
				} else if (status.startsWith("other:")) {
					const code = status.substring(6);
					message = <T id="certificates.http.reachability-other" data={{ code }} />;
				} else {
					message = <>?</>;
				}
			}

			elms.push(
				<p key={domain} className={color}>
					<strong>{domain}:</strong> {message}
				</p>,
			);
		}

		return <div className="space-y-1">{elms}</div>;
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-lg">
				<Formik
					initialValues={
						{
							domainNames: [],
							provider: "letsencrypt",
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ handleSubmit }) => (
						<Form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									<IconWorld className="h-5 w-5" />
									<T id="object.add" tData={{ object: "lets-encrypt-via-http" }} />
								</DialogTitle>
							</DialogHeader>

							<div className="py-4 space-y-4">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<Card className="border-dashed">
									<CardContent className="p-4 space-y-4">
										<Alert variant="default" className="bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400">
											<IconAlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
											<AlertDescription className="ml-2">
												<T id="certificates.http.warning" />
											</AlertDescription>
										</Alert>

										<DomainNamesField
											onChange={(doms) => {
												setDomains(doms);
												setTestResults(null);
											}}
										/>
									</CardContent>
									{testResults && (
										<CardFooter className="flex-col items-start bg-muted/50 p-4 border-t">
											<h5 className="font-semibold mb-2 flex items-center gap-2">
												<IconCheck className="h-4 w-4" />
												<T id="certificates.http.test-results" />
											</h5>
											{parseTestResults()}
										</CardFooter>
									)}
								</Card>
							</div>

							<DialogFooter>
								<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting || isTesting}>
									<T id="cancel" />
								</Button>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="secondary"
										disabled={isSubmitting || domains.length === 0 || isTesting}
										onClick={handleTest}
									>
										{isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										<T id="test" />
									</Button>
									<Button
										type="submit"
										disabled={isSubmitting || isTesting}
										className="bg-pink-600/90 hover:bg-pink-600 text-white shadow-sm"
									>
										{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										<T id="save" />
									</Button>
								</div>
							</DialogFooter>
						</Form>
					)}
				</Formik>
			</DialogContent>
		</Dialog>
	);
});

export { showHTTPCertificateModal };
