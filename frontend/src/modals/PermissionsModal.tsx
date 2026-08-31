import {
	IconArrowsRightLeft,
	IconBolt,
	IconBoltOff,
	IconChartBar,
	IconCloud,
	IconDisc,
	IconEye,
	IconFileText,
	IconLock,
	IconMessageCircle,
	IconNetwork,
	IconServer,
	IconShield,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers, type FormikProps } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { setPermissions } from "src/api/backend";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Label } from "src/components/ui/label";
import { ScrollArea } from "src/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "src/components/ui/toggle-group";
import { useHealth, useUser } from "src/hooks";
import { T } from "src/locale";
import { AUDIT_LOG_OBJECT_TYPE, PERMISSION_LEVEL, PERMISSION_SCOPE } from "src/types/enums";

const showPermissionsModal = (id: number) => {
	EasyModal.show(PermissionsModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}

interface PermissionsValues {
	visibility: string;
	accessLists: string;
	certificates: string;
	deadHosts: string;
	proxyHosts: string;
	redirectionHosts: string;
	streams: string;
	cloudflaredTunnels: string;
	analytics: string;
	ddnsProviders: string;
	torOnions: string;
	dashboardNotes: string;
	chat: string;
}

const PermissionsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const { data, isLoading, error } = useUser(id);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: PermissionsValues, { setSubmitting }: FormikHelpers<PermissionsValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			await setPermissions(id, values);
			remove();
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.USER] });
		} catch (err) {
			if (err instanceof Error) setErrorMsg(<T id={err.message} />);
		}
		setSubmitting(false);
		setIsSubmitting(false);
	};

	// given the field and clicked permission, intelligently set the value, and
	// other values that depends on it.
	const handleChange = (form: FormikProps<PermissionsValues>, field: FieldProps["field"], perm: string) => {
		if (!perm) return; // Toggle group can return undefined if unchecked

		if (
			field.name === "proxyHosts" &&
			perm !== PERMISSION_LEVEL.HIDDEN &&
			form.values.accessLists === PERMISSION_LEVEL.HIDDEN
		) {
			form.setFieldValue("accessLists", PERMISSION_LEVEL.VIEW);
		}
		// certs are required for proxy and redirection hosts, and streams
		if (
			["proxyHosts", "redirectionHosts", "deadHosts", "streams", "cloudflaredTunnels", "torOnions"].includes(
				field.name,
			) &&
			perm !== PERMISSION_LEVEL.HIDDEN &&
			form.values.certificates === PERMISSION_LEVEL.HIDDEN
		) {
			form.setFieldValue("certificates", PERMISSION_LEVEL.VIEW);
		}

		form.setFieldValue(field.name, perm);
	};

	const getPermissionButtons = (field: FieldProps["field"], form: FormikProps<PermissionsValues>) => {
		let hiddenDisabled = false;
		if (field.name === "accessLists") {
			hiddenDisabled = form.values.proxyHosts !== PERMISSION_LEVEL.HIDDEN;
		}
		if (field.name === "certificates") {
			hiddenDisabled =
				form.values.proxyHosts !== PERMISSION_LEVEL.HIDDEN ||
				form.values.redirectionHosts !== PERMISSION_LEVEL.HIDDEN ||
				form.values.deadHosts !== PERMISSION_LEVEL.HIDDEN ||
				form.values.streams !== PERMISSION_LEVEL.HIDDEN ||
				form.values.cloudflaredTunnels !== PERMISSION_LEVEL.HIDDEN ||
				form.values.torOnions !== PERMISSION_LEVEL.HIDDEN;
		}

		return (
			<ToggleGroup
				type="single"
				value={field.value}
				onValueChange={(val) => handleChange(form, field, val)}
				className="justify-start w-full border rounded-md p-1"
			>
				<ToggleGroupItem value={PERMISSION_LEVEL.MANAGE} className="flex-1">
					<T id="permissions.manage" />
				</ToggleGroupItem>
				<ToggleGroupItem value={PERMISSION_LEVEL.VIEW} className="flex-1">
					<T id="permissions.view" />
				</ToggleGroupItem>
				<ToggleGroupItem value={PERMISSION_LEVEL.HIDDEN} disabled={hiddenDisabled} className="flex-1">
					<T id="permissions.hidden" />
				</ToggleGroupItem>
			</ToggleGroup>
		);
	};

	const isAdmin = data?.roles.indexOf("admin") !== -1;
	const health = useHealth();

	if (health.data?.demo) {
		return (
			<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
				<DialogContent className="max-w-lg border-red-500 border-2">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-red-500">
							<IconShield className="h-5 w-5" />
							Access Denied
						</DialogTitle>
					</DialogHeader>
					<div className="p-8 text-center text-muted-foreground">
						<p className="text-lg font-semibold">Changing permissions is disabled in Demo Mode.</p>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={remove}>
							<T id="action.close" />
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

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
						initialValues={{
							visibility: data.permissions?.visibility || PERMISSION_SCOPE.ALL,
							accessLists: data.permissions?.accessLists || PERMISSION_SCOPE.ALL,
							certificates: data.permissions?.certificates || PERMISSION_SCOPE.ALL,
							deadHosts: data.permissions?.deadHosts || PERMISSION_SCOPE.ALL,
							proxyHosts: data.permissions?.proxyHosts || PERMISSION_SCOPE.ALL,
							redirectionHosts: data.permissions?.redirectionHosts || PERMISSION_SCOPE.ALL,
							streams: data.permissions?.streams || PERMISSION_SCOPE.ALL,
							cloudflaredTunnels: data.permissions?.cloudflaredTunnels || PERMISSION_SCOPE.ALL,
							analytics: data.permissions?.analytics || PERMISSION_SCOPE.ALL,
							ddnsProviders: data.permissions?.ddnsProviders || PERMISSION_SCOPE.ALL,
							torOnions: data.permissions?.torOnions || PERMISSION_SCOPE.ALL,
							dashboardNotes: data.permissions?.dashboardNotes || PERMISSION_SCOPE.ALL,
							chat: data.permissions?.chat || PERMISSION_SCOPE.ALL,
						}}
						onSubmit={onSubmit}
					>
						{() => (
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
										{({ field, form }: FieldProps) => (
											<ToggleGroup
												type="single"
												value={field.value || ""}
												onValueChange={(val) => {
													if (val) form.setFieldValue(field.name, val);
												}}
												className="justify-start w-full border rounded-md p-1"
											>
												<ToggleGroupItem value={PERMISSION_SCOPE.USER} className="flex-1">
													<T id="permissions.visibility.user" />
												</ToggleGroupItem>
												<ToggleGroupItem value={PERMISSION_SCOPE.ALL} className="flex-1">
													<T id="permissions.visibility.all" />
												</ToggleGroupItem>
											</ToggleGroup>
										)}
									</Field>
								</div>

								{!isAdmin && (
									<Card className="border-dashed">
										<ScrollArea className="h-[400px]">
											<CardContent className="p-4 grid grid-cols-1 gap-4">
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconBolt className="h-4 w-4 text-muted-foreground" />
														<T id="proxy-hosts" />
													</Label>
													<Field name="proxyHosts">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconArrowsRightLeft className="h-4 w-4 text-muted-foreground" />
														<T id="redirection-hosts" />
													</Label>
													<Field name="redirectionHosts">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconBoltOff className="h-4 w-4 text-muted-foreground" />
														<T id="dead-hosts" />
													</Label>
													<Field name="deadHosts">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconDisc className="h-4 w-4 text-muted-foreground" />
														<T id="streams" />
													</Label>
													<Field name="streams">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconCloud className="h-4 w-4 text-muted-foreground" />
														Cloudflared Tunnels
													</Label>
													<Field name="cloudflaredTunnels">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconNetwork className="h-4 w-4 text-muted-foreground" />
														Tor Onion Services
													</Label>
													<Field name="torOnions">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconServer className="h-4 w-4 text-muted-foreground" />
														DDNS Providers
													</Label>
													<Field name="ddnsProviders">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconChartBar className="h-4 w-4 text-muted-foreground" />
														Analytics
													</Label>
													<Field name="analytics">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconFileText className="h-4 w-4 text-muted-foreground" />
														Dashboard Notes
													</Label>
													<Field name="dashboardNotes">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconMessageCircle className="h-4 w-4 text-muted-foreground" />
														Chat Integrations
													</Label>
													<Field name="chat">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconLock className="h-4 w-4 text-muted-foreground" />
														<T id="access-lists" />
													</Label>
													<Field name="accessLists">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
												<div className="space-y-2">
													<Label className="flex items-center gap-2">
														<IconShield className="h-4 w-4 text-muted-foreground" />
														<T id="certificates" />
													</Label>
													<Field name="certificates">
														{({ field, form }: FieldProps<string, PermissionsValues>) =>
															getPermissionButtons(field, form)
														}
													</Field>
												</div>
											</CardContent>
										</ScrollArea>
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
