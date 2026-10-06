"use client";

import { useEffect, useState } from "react";

export function VendorRiskGauge({ score }: { score: number }) {
  const [rotation, setRotation] = useState(0);
  
  useEffect(() => {
    // 0 score = -90deg, 100 score = 90deg
    setRotation((score / 100) * 180 - 90);
  }, [score]);

  // Determine color based on score
  let color = "text-emerald-500";
  if (score < 40) color = "text-red-500";
  else if (score < 75) color = "text-amber-500";

  return (
    <div className="relative w-48 h-24 flex flex-col items-center overflow-hidden">
      {/* Gauge Background */}
      <div className="absolute top-0 w-48 h-48 rounded-full border-[20px] border-slate-100 border-b-transparent border-l-transparent transform -rotate-45"></div>
      
      {/* Colored Gauge overlay (using conic gradient via mask or simpler SVG approach) */}
      <svg className="absolute top-0 w-48 h-48" viewBox="0 0 100 100">
        <path 
          d="M 10 50 A 40 40 0 0 1 90 50" 
          fill="none" 
          stroke="url(#gradient)" 
          strokeWidth="10" 
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Needle */}
      <div 
        className="absolute top-[48px] left-[94px] w-2 h-20 bg-slate-800 rounded-full origin-bottom transition-transform duration-1000 ease-out z-10"
        style={{ transform: `rotate(${rotation}deg) translateY(-40px)` }}
      >
        <div className="absolute bottom-[-4px] left-[-4px] w-4 h-4 bg-slate-800 rounded-full z-20"></div>
      </div>
      
      {/* Score Text */}
      <div className="absolute bottom-0 text-center z-30 bg-white px-4 rounded-t-full pt-2">
        <span className={`text-3xl font-bold ${color}`}>{score}</span>
        <span className="text-xs text-slate-500 block">/ 100</span>
      </div>
    </div>
  );
}
