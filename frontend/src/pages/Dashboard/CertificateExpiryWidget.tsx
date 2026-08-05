import { IconAlertTriangle, IconCertificate, IconCheck } from "@tabler/icons-react";
import dayjs from "dayjs";
import { Link } from "react-router";
import { HasPermission } from "src/components/HasPermission";
import { Avatar, AvatarFallback } from "src/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { useCertificates } from "src/hooks/useCertificates";
import { cn } from "src/lib/utils";
import { T } from "src/locale";
import { CERTIFICATES, VIEW } from "src/modules/Permissions";

export const CertificateExpiryWidget = () => {
	const { data: certificates } = useCertificates();

	if (!certificates) {
		return null;
	}

	// Filter certificates expiring in the next 30 days or already expired
	const expiringCertificates = certificates
		.filter((cert) => {
			if (!cert.expiresOn) return false;
			const expires = dayjs(cert.expiresOn);
			const diff = expires.diff(dayjs(), "day");
			return diff <= 30;
		})
		.sort((a, b) => {
			return dayjs(a.expiresOn).diff(dayjs(b.expiresOn));
		})
		.slice(0, 5); // Show top 5

	return (
		<HasPermission section={CERTIFICATES} permission={VIEW} hideError>
			<Card className="h-full border-pink-500/50">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-xl font-bold flex items-center gap-2">
						<IconCertificate className="h-5 w-5 text-pink-500" />
						<T id="dashboard.certificates-expiring" />
					</CardTitle>
				</CardHeader>
				<CardContent className="pt-4">
					{expiringCertificates.length > 0 ? (
						<div className="space-y-4">
							{expiringCertificates.map((cert) => {
								const expires = dayjs(cert.expiresOn);
								const diff = expires.diff(dayjs(), "day");
								const isExpired = diff < 0;

								return (
									<div
										key={cert.id}
										className="flex items-center space-x-4 border-b pb-3 last:border-0 last:pb-0"
									>
										<Avatar
											className={cn(
												"h-9 w-9",
												isExpired
													? "bg-red-500/20 text-red-500"
													: "bg-yellow-500/20 text-yellow-500",
											)}
										>
											<AvatarFallback className="bg-transparent">
												{isExpired ? (
													<IconAlertTriangle className="h-5 w-5" />
												) : (
													<IconCertificate className="h-5 w-5" />
												)}
											</AvatarFallback>
										</Avatar>
										<div className="flex-1 space-y-1 min-w-0">
											<Link
												to={"/certificates"}
												className="text-sm font-medium leading-none hover:underline truncate block"
											>
												{cert.niceName || cert.domainNames.join(", ")}
											</Link>
											<p className="text-xs text-muted-foreground truncate">
												{cert.domainNames.join(", ")}
											</p>
										</div>
										<div
											className={cn(
												"text-sm font-medium shrink-0",
												isExpired ? "text-red-500" : "text-yellow-500",
											)}
										>
											{isExpired ? (
												<T id="dashboard.expired" />
											) : (
												<T id="dashboard.days-left" data={{ days: diff }} />
											)}
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
							<div className="p-3 bg-green-500/10 rounded-full text-green-500">
								<IconCheck className="h-8 w-8" />
							</div>
							<div className="space-y-1">
								<p className="text-lg font-medium">
									<T id="dashboard.no-expiring-certificates" />
								</p>
								<p className="text-sm text-muted-foreground">
									<T id="dashboard.status_ok" />
								</p>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</HasPermission>
	);
};
