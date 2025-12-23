import { IconArrowsCross, IconBolt, IconBoltOff, IconDashboard, IconDisc } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { HasPermission } from "src/components";
import { useHostReport } from "src/hooks";
import { T } from "src/locale";
import { DEAD_HOSTS, PROXY_HOSTS, REDIRECTION_HOSTS, STREAMS, VIEW } from "src/modules/Permissions";
import { Card, CardContent } from "src/components/ui/card";
import { CertificateExpiryWidget } from "./CertificateExpiryWidget";

const MotionCard = motion(Card);

const Dashboard = () => {
	const { data: hostReport } = useHostReport();
	const navigate = useNavigate();

	return (
		<div className="space-y-6">
			<div className="flex items-center space-x-2">
				<IconDashboard className="h-8 w-8 text-primary" />
				<h2 className="text-3xl font-bold tracking-tight">
					<T id="dashboard" />
				</h2>
			</div>
			<div className="flex flex-col gap-6">
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
						<MotionCard
							className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-green-500"
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
										<div className="text-3xl font-bold">
											<T id="proxy-hosts.count" data={{ count: hostReport?.proxy }} />
										</div>
									</div>
									<div className="p-3 bg-green-500/10 rounded-full text-green-500">
										<IconBolt className="h-8 w-8" />
									</div>
								</div>
							</CardContent>
						</MotionCard>
					</HasPermission>
					<HasPermission section={REDIRECTION_HOSTS} permission={VIEW} hideError>
						<MotionCard
							className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-yellow-500"
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
										<div className="text-3xl font-bold">
											<T id="redirection-hosts.count" data={{ count: hostReport?.redirection }} />
										</div>
									</div>
									<div className="p-3 bg-yellow-500/10 rounded-full text-yellow-500">
										<IconArrowsCross className="h-8 w-8" />
									</div>
								</div>
							</CardContent>
						</MotionCard>
					</HasPermission>
					<HasPermission section={STREAMS} permission={VIEW} hideError>
						<MotionCard
							className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-blue-500"
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
										<div className="text-3xl font-bold">
											<T id="streams.count" data={{ count: hostReport?.stream }} />
										</div>
									</div>
									<div className="p-3 bg-blue-500/10 rounded-full text-blue-500">
										<IconDisc className="h-8 w-8" />
									</div>
								</div>
							</CardContent>
						</MotionCard>
					</HasPermission>
					<HasPermission section={DEAD_HOSTS} permission={VIEW} hideError>
						<MotionCard
							className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-red-500"
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
										<div className="text-3xl font-bold">
											<T id="dead-hosts.count" data={{ count: hostReport?.dead }} />
										</div>
									</div>
									<div className="p-3 bg-red-500/10 rounded-full text-red-500">
										<IconBoltOff className="h-8 w-8" />
									</div>
								</div>
							</CardContent>
						</MotionCard>
					</HasPermission>
				</div>

				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<CertificateExpiryWidget />
				</div>
			</div>
		</div>
	);
};

export default Dashboard;
