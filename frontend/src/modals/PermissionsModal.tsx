import { IconArrowsRightLeft, IconBolt, IconBoltOff, IconDisc, IconEye, IconLock, IconShield } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { setPermissions } from "src/api/backend";
import { Loading } from "src/components";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { Label } from "src/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "src/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { AlertCircle, Loader2 } from "lucide-react";

const showPermissionsModal = (id: number) => {
	EasyModal.show(PermissionsModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}
const PermissionsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const { data, isLoading, error } = useUser(id);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			await setPermissions(id, values);
			remove();
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: ["user"] });
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setSubmitting(false);
		setIsSubmitting(false);
	};

	// given the field and clicked permission, intelligently set the value, and
	// other values that depends on it.
	const handleChange = (form: any, field: any, perm: string) => {
		if (!perm) return; // Toggle group can return undefined if unchecked

		if (field.name === "proxyHosts" && perm !== "hidden" && form.values.accessLists === "hidden") {
			form.setFieldValue("accessLists", "view");
		}
		// certs are required for proxy and redirection hosts, and streams
		if (
			["proxyHosts", "redirectionHosts", "deadHosts", "streams"].includes(field.name) &&
			perm !== "hidden" &&
			form.values.certificates === "hidden"
		) {
			form.setFieldValue("certificates", "view");
		}

		form.setFieldValue(field.name, perm);
	};

	const getPermissionButtons = (field: any, form: any) => {
		let hiddenDisabled = false;
		if (field.name === "accessLists") {
			hiddenDisabled = form.values.proxyHosts !== "hidden";
		}
		if (field.name === "certificates") {
			hiddenDisabled =
				form.values.proxyHosts !== "hidden" ||
				form.values.redirectionHosts !== "hidden" ||
				form.values.deadHosts !== "hidden" ||
				form.values.streams !== "hidden";
		}

		return (
			<ToggleGroup
				type="single"
				value={field.value}
				onValueChange={(val) => handleChange(form, field, val)}
				className="justify-start w-full border rounded-md p-1"
			>
				<ToggleGroupItem value="manage" className="flex-1">
					<T id="permissions.manage" />
				</ToggleGroupItem>
				<ToggleGroupItem value="view" className="flex-1">
					<T id="permissions.view" />
				</ToggleGroupItem>
				<ToggleGroupItem value="hidden" disabled={hiddenDisabled} className="flex-1">
					<T id="permissions.hidden" />
				</ToggleGroupItem>
			</ToggleGroup>
		);
	};

	const isAdmin = data?.roles.indexOf("admin") !== -1;

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconShield className="h-5 w-5" />
						<T id="user.set-permissions" data={{ name: data?.name }} />
					</DialogTitle>
				</DialogHeader>

				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}

				{isLoading && (
					<div className="flex justify-center p-8">
						<Loading noLogo />
					</div>
				)}

				{!isLoading && data && (
					<Formik
						initialValues={
							{
								visibility: data.permissions?.visibility,
								accessLists: data.permissions?.accessLists,
								certificates: data.permissions?.certificates,
								deadHosts: data.permissions?.deadHosts,
								proxyHosts: data.permissions?.proxyHosts,
								redirectionHosts: data.permissions?.redirectionHosts,
								streams: data.permissions?.streams,
							} as any
						}
						onSubmit={onSubmit}
					>
						{({ values, setFieldValue, ...formikProps }) => (
							<Form className="space-y-4">
								{errorMsg && (
									<Alert variant="destructive" className="mb-4">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="space-y-2">
									<Label className="flex items-center gap-2">
										<IconEye className="h-4 w-4 text-muted-foreground" />
										<T id="permissions.visibility.title" />
									</Label>
									<Field name="visibility">
										{({ field }: any) => (
											<ToggleGroup
												type="single"
												value={field.value}
												onValueChange={(val) => val && setFieldValue(field.name, val)}
												className="justify-start w-full border rounded-md p-1"
											>
												<ToggleGroupItem value="user" className="flex-1">
													<T id="permissions.visibility.user" />
												</ToggleGroupItem>
												<ToggleGroupItem value="all" className="flex-1">
													<T id="permissions.visibility.all" />
												</ToggleGroupItem>
											</ToggleGroup>
										)}
									</Field>
								</div>

								{!isAdmin && (
									<Card className="border-dashed">
										<CardContent className="p-4 grid grid-cols-1 gap-4">
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<IconBolt className="h-4 w-4 text-muted-foreground" />
													<T id="proxy-hosts" />
												</Label>
												<Field name="proxyHosts">
													{({ field }: any) => getPermissionButtons(field, { values, setFieldValue, ...formikProps })}
												</Field>
											</div>
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<IconArrowsRightLeft className="h-4 w-4 text-muted-foreground" />
													<T id="redirection-hosts" />
												</Label>
												<Field name="redirectionHosts">
													{({ field }: any) => getPermissionButtons(field, { values, setFieldValue, ...formikProps })}
												</Field>
											</div>
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<IconBoltOff className="h-4 w-4 text-muted-foreground" />
													<T id="dead-hosts" />
												</Label>
												<Field name="deadHosts">
													{({ field }: any) => getPermissionButtons(field, { values, setFieldValue, ...formikProps })}
												</Field>
											</div>
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<IconDisc className="h-4 w-4 text-muted-foreground" />
													<T id="streams" />
												</Label>
												<Field name="streams">
													{({ field }: any) => getPermissionButtons(field, { values, setFieldValue, ...formikProps })}
												</Field>
											</div>
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<IconLock className="h-4 w-4 text-muted-foreground" />
													<T id="access-lists" />
												</Label>
												<Field name="accessLists">
													{({ field }: any) => getPermissionButtons(field, { values, setFieldValue, ...formikProps })}
												</Field>
											</div>
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<IconShield className="h-4 w-4 text-muted-foreground" />
													<T id="certificates" />
												</Label>
												<Field name="certificates">
													{({ field }: any) => getPermissionButtons(field, { values, setFieldValue, ...formikProps })}
												</Field>
											</div>
										</CardContent>
									</Card>
								)}

								<DialogFooter className="mt-6">
									<Button variant="outline" onClick={remove} disabled={isSubmitting} type="button">
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										variant="default"
										disabled={isSubmitting}
										className="bg-orange-600/90 hover:bg-orange-600 text-white shadow-sm"
									>
										{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										<T id="save" />
									</Button>
								</DialogFooter>
							</Form>
						)}
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showPermissionsModal };
