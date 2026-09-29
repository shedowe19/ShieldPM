import { useFormikContext } from "formik";
import { useEffect } from "react";
import type { CertificateProfile } from "src/api/backend";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { T } from "src/locale";

interface ProfileFormValues {
	meta?: Record<string, unknown> & { letsencryptProfile?: CertificateProfile };
}

export function CertificateProfileField() {
	const { values, setFieldValue, isSubmitting } = useFormikContext<ProfileFormValues>();
	const profile = values.meta?.letsencryptProfile;
	const descriptionId = "letsencryptProfile-description";

	useEffect(() => {
		if (profile === undefined) {
			setFieldValue("meta.letsencryptProfile", "standard", false);
		}
	}, [profile, setFieldValue]);

	return (
		<div className="space-y-2">
			<Label htmlFor="letsencryptProfile">
				<T id="certificates.profile.label" />
			</Label>
			<Select
				value={profile || "standard"}
				onValueChange={(value) => setFieldValue("meta.letsencryptProfile", value)}
				disabled={isSubmitting}
			>
				<SelectTrigger id="letsencryptProfile" aria-describedby={descriptionId}>
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
			<p id={descriptionId} className="text-sm text-muted-foreground">
				{profile === "shortlived" ? (
					<T id="certificates.profile.shortlived-description" />
				) : (
					<T id="certificates.profile.standard-description" />
				)}
			</p>
		</div>
	);
}
