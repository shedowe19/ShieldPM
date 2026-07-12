import { IconArrowsCross, IconBolt, IconBoltOff, IconDisc } from "@tabler/icons-react";
import { m } from "framer-motion";
import { useEffect, useState } from "react";
import { FormattedNumber } from "react-intl";
import { useNavigate } from "react-router-dom";
import { HasPermission } from "src/components/HasPermission";
import { Card, CardContent } from "src/components/ui/card";
import { useHostReport } from "src/hooks/useHostReport";
import { useUser } from "src/hooks/useUser";
import { T } from "src/locale";
import AuthStore from "src/modules/AuthStore";
import { DEAD_HOSTS, PROXY_HOSTS, REDIRECTION_HOSTS, STREAMS, VIEW } from "src/modules/Permissions";
import { CertificateExpiryWidget } from "./CertificateExpiryWidget";
import { DashboardNotesWidget } from "./DashboardNotesWidget";

const MotionCard = m(Card);
const container = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: {
			staggerChildren: 0.1,
		},
	},
};

const item = {
	hidden: { opacity: 0, y: 20 },
	show: { opacity: 1, y: 0 },
};

const Dashboard = () => {
	const { data: hostReport } = useHostReport();
	const navigate = useNavigate();
	const [userId, setUserId] = useState<number>(0);
	const { data: userData } = useUser(userId, { enabled: userId !== 0 });

	useEffect(() => {
		const storedId = AuthStore.userId;
		if (storedId) {
			setUserId(storedId);
		}
	}, []);

	const date = new Date();
	const hours = date.getHours();
	let greeting = "dashboard.greeting.evening";
	if (hours < 12) greeting = "dashboard.greeting.morning";
	else if (hours < 18) greeting = "dashboard.greeting.afternoon";

	return (
		<m.div variants={container} initial="hidden" animate="show" className="space-y-8">
			<div className="flex flex-col space-y-2">
				<h2 className="text-3xl font-bold tracking-tight">
					<T id={greeting} />, {userData?.nickname || userData?.name || "User"}
				</h2>
				<p className="text-muted-foreground">
					{date.toLocaleDateString(undefined, {
						weekday: "long",
						year: "numeric",
						month: "long",
						day: "numeric",
					})}
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
					<MotionCard
						variants={item}
						className="cursor-pointer hover:shadow-md transition-all border-none bg-gradient-to-br from-green-500/10 to-transparent dark:from-green-500/20"
						onClick={() => navigate("/nginx/proxy")}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<CardContent className="p-6">
							<div className="flex items-center justify-between space-x-4">
								<div className="space-y-1">
									<p className="text-sm font-medium text-muted-foreground">
										<T id="proxy_hosts.count_label" />
									</p>
									<div className="text-4xl font-bold text-green-500">
										<FormattedNumber value={hostReport?.proxy || 0} />
									</div>
								</div>
								<div className="p-3 bg-green-500/20 rounded-xl text-green-500">
									<IconBolt className="h-8 w-8" />
								</div>
							</div>
						</CardContent>
					</MotionCard>
				</HasPermission>
				<HasPermission section={REDIRECTION_HOSTS} permission={VIEW} hideError>
					<MotionCard
						variants={item}
						className="cursor-pointer hover:shadow-md transition-all border-none bg-gradient-to-br from-yellow-500/10 to-transparent dark:from-yellow-500/20"
						onClick={() => navigate("/nginx/redirection")}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<CardContent className="p-6">
							<div className="flex items-center justify-between space-x-4">
								<div className="space-y-1">
									<p className="text-sm font-medium text-muted-foreground">
										<T id="redirection_hosts.count_label" />
									</p>
									<div className="text-4xl font-bold text-yellow-500">
										<FormattedNumber value={hostReport?.redirection || 0} />
									</div>
								</div>
								<div className="p-3 bg-yellow-500/20 rounded-xl text-yellow-500">
									<IconArrowsCross className="h-8 w-8" />
								</div>
							</div>
						</CardContent>
					</MotionCard>
				</HasPermission>
				<HasPermission section={STREAMS} permission={VIEW} hideError>
					<MotionCard
						variants={item}
						className="cursor-pointer hover:shadow-md transition-all border-none bg-gradient-to-br from-blue-500/10 to-transparent dark:from-blue-500/20"
						onClick={() => navigate("/nginx/stream")}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<CardContent className="p-6">
							<div className="flex items-center justify-between space-x-4">
								<div className="space-y-1">
									<p className="text-sm font-medium text-muted-foreground">
										<T id="streams.count_label" />
									</p>
									<div className="text-4xl font-bold text-blue-500">
										<FormattedNumber value={hostReport?.stream || 0} />
									</div>
								</div>
								<div className="p-3 bg-blue-500/20 rounded-xl text-blue-500">
									<IconDisc className="h-8 w-8" />
								</div>
							</div>
						</CardContent>
					</MotionCard>
				</HasPermission>
				<HasPermission section={DEAD_HOSTS} permission={VIEW} hideError>
					<MotionCard
						variants={item}
						className="cursor-pointer hover:shadow-md transition-all border-none bg-gradient-to-br from-red-500/10 to-transparent dark:from-red-500/20"
						onClick={() => navigate("/nginx/404")}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<CardContent className="p-6">
							<div className="flex items-center justify-between space-x-4">
								<div className="space-y-1">
									<p className="text-sm font-medium text-muted-foreground">
										<T id="dead_hosts.count_label" />
									</p>
									<div className="text-4xl font-bold text-red-500">
										<FormattedNumber value={hostReport?.dead || 0} />
									</div>
								</div>
								<div className="p-3 bg-red-500/20 rounded-xl text-red-500">
									<IconBoltOff className="h-8 w-8" />
								</div>
							</div>
						</CardContent>
					</MotionCard>
				</HasPermission>
			</div>

			<div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
				<CertificateExpiryWidget />
				<DashboardNotesWidget />
			</div>
		</m.div>
	);
};

export default Dashboard;
