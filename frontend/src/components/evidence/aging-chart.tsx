export function AgingChart() {
  const buckets = [
    { label: "< 30 days", count: 145, value: 4500000, color: "bg-emerald-500", percentage: 40 },
    { label: "31 - 90 days", count: 82, value: 2800000, color: "bg-emerald-400", percentage: 25 },
    { label: "91 - 150 days", count: 45, value: 1500000, color: "bg-amber-400", percentage: 15 },
    { label: "151 - 179 days", count: 12, value: 850000, color: "bg-orange-500", percentage: 12 },
    { label: "> 180 days", count: 8, value: 345200, color: "bg-red-600", percentage: 8 },
  ];

  return (
    <div className="bg-white border rounded-md p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-slate-600">Total Pending Payments: ₹99,95,200</span>
        <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded">Reversal Risk: ₹3,45,200</span>
      </div>
      
      {/* Bar Chart Visualization */}
      <div className="flex h-12 w-full rounded-md overflow-hidden mb-6 border">
        {buckets.map((bucket, i) => (
          <div 
            key={i} 
            className={`${bucket.color} h-full transition-all hover:opacity-90 cursor-pointer relative group`}
            style={{ width: `${bucket.percentage}%` }}
          >
            {/* Tooltip */}
            <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 transition-opacity pointer-events-none">
              {bucket.label}: ₹{(bucket.value / 100000).toFixed(2)}L
            </div>
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {buckets.map((bucket, i) => (
          <div key={i} className="flex flex-col text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`w-3 h-3 rounded-full ${bucket.color}`}></div>
              <span className="text-slate-500">{bucket.label}</span>
            </div>
            <span className="font-semibold text-slate-900 ml-4.5">
              ₹{(bucket.value / 100000).toFixed(2)}L
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
