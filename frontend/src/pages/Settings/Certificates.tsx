import { IconShield } from "@tabler/icons-react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { CertificateProfile } from "src/api/backend/models";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useAcmeProfile, useSetAcmeProfile } from "src/hooks/useAcmeProfile";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

export default function Certificates() {
	const { data, isPending, error } = useAcmeProfile();
	const saveProfile = useSetAcmeProfile();
	const [draft, setDraft] = useState<CertificateProfile>();
	const profile = draft ?? data?.profile;
	const canSave = data && profile && (profile !== data.profile || data.source === "environment");

	const save = async () => {
		if (!canSave || saveProfile.isPending) return;
		try {
			await saveProfile.mutateAsync({ profile });
			setDraft(undefined);
			showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.SETTING, "saved");
		} catch {
			// The mutation exposes the server error below and retains the selected draft.
		}
	};

	return (
		<Card className="border-t-4 border-lime-500/50">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<IconShield className="h-6 w-6" />
					<T id="settings.certificates.title" />
				</CardTitle>
				<CardDescription>
					<T id="settings.certificates.description" />
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isPending && <Loading noLogo />}
				{(error || saveProfile.error) && (
					<Alert variant="destructive">
						<AlertTitle>
							<T id="error.title" />
						</AlertTitle>
						<AlertDescription>{(saveProfile.error || error)?.message}</AlertDescription>
					</Alert>
				)}
				{data && profile && (
					<>
						<div className="space-y-2">
							<Label htmlFor="defaultCertificateProfile">
								<T id="settings.certificates.profile" />
							</Label>
							<Select
								value={profile}
								onValueChange={(value) => {
									saveProfile.reset();
									setDraft(value as CertificateProfile);
								}}
								disabled={saveProfile.isPending}
							>
								<SelectTrigger id="defaultCertificateProfile">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="standard">
										<T id="certificates.profile.standard" />
									</SelectItem>
									<SelectItem value="shortlived">
										<T id="certificates.profile.shortlived" />
									</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-sm text-muted-foreground">
								{profile === "shortlived" ? (
									<T id="certificates.profile.shortlived-description" />
								) : (
									<T id="certificates.profile.standard-description" />
								)}
							</p>
						</div>
						<p className="text-sm text-muted-foreground">
							{data.source === "environment" ? (
								<T id="settings.certificates.source-environment" />
							) : (
								<T id="settings.certificates.source-settings" />
							)}
							{data.source === "environment" && data.environmentProfile && (
								<code className="ml-1 text-xs">({data.environmentProfile})</code>
							)}
						</p>
						<p className="text-sm text-muted-foreground">
							<T id="settings.certificates.applies" />
						</p>
						<div className="flex justify-end">
							<Button type="button" onClick={save} disabled={!canSave || saveProfile.isPending}>
								{saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								<T id="save" />
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
