// Assuming mantine or using shadcn primitives? 
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { T } from "src/locale";
import { useEffect, useState } from "react";
import { Loading } from "src/components";
import { AnalyticsChart } from "src/components/Analytics/AnalyticsChart";
import { getAnalyticsSummary, getAnalyticsSeries, type AnalyticsSummary } from "src/api/backend";
import dayjs from "dayjs";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleLinear } from "d3-scale";

// GeoJSON url
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface Props {
    hostId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const AnalyticsModal = ({ hostId, open, onOpenChange }: Props) => {
    const [range, setRange] = useState("24h");
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [series, setSeries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!open || !hostId) return;
            setLoading(true);
            try {
                const [sumData, serData] = await Promise.all([
                    getAnalyticsSummary(hostId, range),
                    getAnalyticsSeries(hostId, range)
                ]);
                setSummary(sumData);

                // Format series for chart
                setSeries(serData.map((d: any) => ({
                    ...d,
                    time_bucket: dayjs(d.timestamp).unix(),
                })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [open, hostId, range]);

    // Map scale
    const maxCountryCount = summary?.top_countries?.[0]?.count || 0;
    const colorScale = scaleLinear<string>().domain([0, maxCountryCount]).range(["#EAEAEC", "#06b6d4"]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle><T id="analytics.title" /></DialogTitle>
                </DialogHeader>

                <div className="flex gap-2 mb-4">
                    {["1h", "24h", "7d", "30d"].map((r) => (
                        <Button
                            key={r}
                            variant={range === r ? "default" : "outline"}
                            onClick={() => setRange(r)}
                            size="sm"
                        >
                            <T id={`analytics.range.${r}`} />
                        </Button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-20"><Loading /></div>
                ) : (
                    <div className="space-y-6">
                        {/* Charts */}
                        <AnalyticsChart data={series} />

                        {/* Map & Tables */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* World Map */}
                            <div className="border rounded-md p-4">
                                <h3 className="font-bold mb-2">Requests by Country</h3>
                                <div className="h-[300px] w-full">
                                    <ComposableMap projectionConfig={{ scale: 140 }}>
                                        <ZoomableGroup>
                                            <Geographies geography={GEO_URL}>
                                                {({ geographies }) =>
                                                    geographies.map((geo) => {
                                                        const cur = summary?.top_countries?.find((s) => s.country_code === geo.properties.ISO_A2);
                                                        return (
                                                            <Geography
                                                                key={geo.rsmKey}
                                                                geography={geo}
                                                                fill={cur ? colorScale(cur.count) : "#F5F4F6"}
                                                                stroke="#D6D6DA"
                                                            />
                                                        );
                                                    })
                                                }
                                            </Geographies>
                                        </ZoomableGroup>
                                    </ComposableMap>
                                </div>
                            </div>

                            {/* Top Countries List */}
                            <div className="border rounded-md p-4">
                                <h3 className="font-bold mb-2">Top Countries</h3>
                                <div className="space-y-2">
                                    {summary?.top_countries?.slice(0, 10).map((c) => (
                                        <div key={c.country_code} className="flex justify-between text-sm">
                                            <span>{c.country_code || "Unknown"}</span>
                                            <span>{c.count.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Top Lists Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="border rounded-md p-4">
                                <h3 className="font-bold mb-2">Top IPs</h3>
                                <div className="space-y-1">
                                    {summary?.top_ips?.map((i, idx) => (
                                        <div key={idx} className="flex justify-between text-xs">
                                            <span className="truncate max-w-[70%]">{i.ip}</span>
                                            <span>{i.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="border rounded-md p-4">
                                <h3 className="font-bold mb-2">Top Referrers</h3>
                                <div className="space-y-1">
                                    {summary?.top_referers?.map((r, idx) => (
                                        <div key={idx} className="flex justify-between text-xs">
                                            <span className="truncate max-w-[80%]">{r.referer}</span>
                                            <span>{r.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="border rounded-md p-4">
                                <h3 className="font-bold mb-2">Top Paths</h3>
                                <div className="space-y-1">
                                    {summary?.top_paths?.map((p, idx) => (
                                        <div key={idx} className="flex justify-between text-xs">
                                            <span className="truncate max-w-[80%]">{p.path}</span>
                                            <span>{p.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
