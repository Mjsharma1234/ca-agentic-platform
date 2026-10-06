import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIndianCurrency(amount: number): string {
  if (isNaN(amount)) return "₹0";
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatGSTIN(gstin: string): string {
  if (!gstin || gstin.length !== 15) return gstin;
  return `${gstin.substring(0, 2)} ${gstin.substring(2, 12)} ${gstin.substring(12)}`;
}

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  } catch (e) {
    return dateString;
  }
}

export function daysRemaining(dateString: string): number {
  const targetDate = new Date(dateString);
  const today = new Date();
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays;
}

export function getGateColor(gateId: string): string {
  if (gateId.startsWith('G1') || gateId.startsWith('G2') || gateId.startsWith('G3')) return 'bg-blue-100 text-blue-800';
  if (gateId.startsWith('G4') || gateId.startsWith('G5')) return 'bg-purple-100 text-purple-800';
  if (gateId.startsWith('G6') || gateId.startsWith('G7') || gateId.startsWith('G8')) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-800';
}

export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'approved': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
    case 'escalated': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'blocking': return 'bg-red-100 text-red-800 border-red-200';
    case 'warning': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}
