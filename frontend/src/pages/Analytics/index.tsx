import {
    IconActivity,
    IconChartBar,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { getAnalyticsSummary, getAnalyticsSeries, type AnalyticsSummary, type TimeSeriesPoint } from "src/api/backend";

const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const Analytics = () => {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [series, setSeries] = useState<(TimeSeriesPoint & { timeDisplay: string })[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Summary
                const summaryData = await getAnalyticsSummary();
                setSummary(summaryData);

                // Fetch Series
                const seriesData = await getAnalyticsSeries();
                // Format timestamp for chart
                const formattedSeries = seriesData.map((d) => ({
                    ...d,
                    timeDisplay: dayjs(d.timestamp).format("HH:mm"),
                }));
                setSeries(formattedSeries);
            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        // Refresh every minute
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !summary) {
        return <div className="p-8 text-center">Loading analytics...</div>;
    }

    const successRate = summary
        ? ((summary.status_2xx / (summary.count || 1)) * 100).toFixed(1)
        : "0";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
                <p className="text-muted-foreground">Traffic overview for the last 24 hours.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                        <IconActivity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary?.count?.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {/* <IconArrowUp className="h-3 w-3 inline mr-1 text-green-500" /> */}
                            +100% since service start
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                        <div className="h-4 w-4 rounded-full border border-green-500 bg-green-500/20" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{successRate}%</div>
                        <p className="text-xs text-muted-foreground">2xx Responses</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Bandwidth</CardTitle>
                        <IconChartBar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatBytes(summary?.bytes || 0)}</div>
                        <p className="text-xs text-muted-foreground">Total Data Transferred</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Requests over Time</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={series}>
                                    <defs>
                                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="timeDisplay"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}`}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
                                        labelStyle={{ color: "#f3f4f6" }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="#06b6d4"
                                        fillOpacity={1}
                                        fill="url(#colorCount)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Status Codes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={series}>
                                    <XAxis
                                        dataKey="timeDisplay"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={30}
                                    />
                                    <Tooltip
                                        cursor={{ fill: "transparent" }}
                                        contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
                                    />
                                    <Bar dataKey="s2xx" name="2xx" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
                                    <Bar dataKey="s3xx" name="3xx" stackId="a" fill="#3b82f6" />
                                    <Bar dataKey="s4xx" name="4xx" stackId="a" fill="#eab308" />
                                    <Bar dataKey="s5xx" name="5xx" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Analytics;
