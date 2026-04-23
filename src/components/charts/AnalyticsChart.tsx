"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ComposedChart, Line } from "recharts";

interface AnalyticsChartProps {
  district: any;
  activeTag: string;
}

// Simple Linear Regression function
function calculateLinearRegression(data: any[], yKey: string) {
  const n = data.length;
  if (n < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  data.forEach((point, index) => {
    // using index as x to simplify
    const x = index;
    const y = point[yKey] || 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export default function AnalyticsChart({ district, activeTag }: AnalyticsChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!district?.id) return;
    setLoading(true);

    fetch(`/api/statistics?district_id=${district.id}`)
      .then(res => res.json())
      .then(stats => {
        // Add forecasted years (2025-2027) based on historical data
        const forecastData = [...stats];
        
        // Define keys to forecast
        const keysToForecast = ['population', 'density', 'traffy_issues', 'accessibility_index'];
        
        const models: any = {};
        keysToForecast.forEach(key => {
          models[key] = calculateLinearRegression(stats, key);
        });

        // Generate 3 years into the future
        const lastYear = stats[stats.length - 1].year;
        for (let i = 1; i <= 3; i++) {
          const futureYear = lastYear + i;
          const futureIndex = stats.length - 1 + i;
          const projectedPoint: any = { year: futureYear, isForecast: true };
          
          keysToForecast.forEach(key => {
            if (models[key]) {
              // y = mx + c
              let val = (models[key].slope * futureIndex) + models[key].intercept;
              // Prevent negative values for things like population
              if (val < 0) val = 0;
              // Rounding based on key
              projectedPoint[key] = (key === 'population' || key === 'density' || key === 'traffy_issues') 
                ? Math.round(val) 
                : parseFloat(val.toFixed(2));
            }
          });
          forecastData.push(projectedPoint);
        }

        setData(forecastData);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [district]);

  if (!district) return <div className="text-sm text-slate-500">กรุณาเลือกพื้นที่เพื่อดูการวิเคราะห์</div>;
  if (loading) return <div className="h-48 w-full animate-pulse bg-slate-100 rounded-xl" />;

  // Map active tag to data key
  let dataKey = "density";
  let color = "#6366f1";

  if (activeTag === "ประชากร") { dataKey = "population"; color = "#3b82f6"; }
  if (activeTag === "พื้นที่สีเขียว") { dataKey = "ndvi"; color = "#10b981"; }
  if (activeTag === "การเข้าถึง") { dataKey = "accessibility_index"; color = "#8b5cf6"; }
  if (activeTag === "การร้องเรียน") { dataKey = "traffy_issues"; color = "#f59e0b"; }

  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">แนวโน้มย้อนหลังและการคาดการณ์ (Forecast)</h3>
        <div className="flex gap-3 text-[10px] font-medium">
           <div className="flex items-center gap-1.5 text-slate-500"><div className="w-2 h-2 rounded-full" style={{backgroundColor: color}}></div>ข้อมูลจริง</div>
           <div className="flex items-center gap-1.5 text-slate-500"><div className="w-2 h-0.5 border-t-2 border-dashed" style={{borderColor: color}}></div>พยากรณ์</div>
        </div>
      </div>
      <div className="h-48 w-full -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="year" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#64748b' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#64748b' }} 
              dx={-10}
              tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
              labelStyle={{ fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}
              formatter={(value: any, _name: any, props: any) => [
                <span key="val">
                  {value.toLocaleString()} 
                  {props.payload.isForecast && <span className="ml-2 text-[10px] text-amber-500 font-bold bg-amber-50 px-1.5 py-0.5 rounded">FORECAST</span>}
                </span>, 
                ""
              ]}
              labelFormatter={(label) => `ปี ${label}`}
            />
            
            {/* Divider Line between Actual and Forecast */}
            <ReferenceLine x={2024} stroke="#cbd5e1" strokeDasharray="3 3" />

            {/* Historical Area */}
            <Area 
              type="monotone" 
              dataKey={dataKey} 
              stroke="none" 
              fillOpacity={1} 
              fill="url(#colorGradient)" 
              isAnimationActive={false}
            />

            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={3} 
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
              activeDot={{ r: 6, strokeWidth: 0 }} 
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
