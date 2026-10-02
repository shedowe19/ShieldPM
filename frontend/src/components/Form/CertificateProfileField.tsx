import { useFormikContext } from "formik";
import { useEffect } from "react";
import type { CertificateProfile } from "src/api/backend";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useAcmeProfile } from "src/hooks/useAcmeProfile";
import { T } from "src/locale";

interface ProfileFormValues {
	meta?: Record<string, unknown> & { letsencryptProfile?: CertificateProfile };
}

export function CertificateProfileField() {
	const { values, setFieldValue, isSubmitting } = useFormikContext<ProfileFormValues>();
	const profile = values.meta?.letsencryptProfile;
	const { data, isPending, isFetching, error } = useAcmeProfile({ enabled: profile === undefined });
	const descriptionId = "letsencryptProfile-description";

	useEffect(() => {
		if (profile === undefined && data && !isFetching && !isSubmitting && !error) {
			setFieldValue("meta.letsencryptProfile", data.profile, false);
		}
	}, [profile, data, isFetching, isSubmitting, error, setFieldValue]);

	return (
		<div className="space-y-2">
			<Label htmlFor="letsencryptProfile">
				<T id="certificates.profile.label" />
			</Label>
			<Select
				value={profile || ""}
				onValueChange={(value) => setFieldValue("meta.letsencryptProfile", value)}
				disabled={isSubmitting}
			>
				<SelectTrigger id="letsencryptProfile" aria-describedby={descriptionId}>
					<SelectValue placeholder={<T id="certificates.profile.server-default" />} />
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
				{profile === undefined ? (
					isPending ? (
						<T id="certificates.profile.default-loading" />
					) : (
						<T id="certificates.profile.server-default" />
					)
				) : profile === "shortlived" ? (
					<T id="certificates.profile.shortlived-description" />
				) : (
					<T id="certificates.profile.standard-description" />
				)}
			</p>
			{error && profile === undefined && (
				<p role="alert" className="text-sm text-destructive">
					<T id="certificates.profile.default-error" />
				</p>
			)}
		</div>
	);
}
