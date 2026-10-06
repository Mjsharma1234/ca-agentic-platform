import { formatIndianCurrency } from "@/lib/utils";

export function DeltaTable() {
  const data = [
    { section: "B2B Invoices", books: 1250000, gstr2b: 1180000, delta: -70000, status: "warning" },
    { section: "Debit Notes", books: 45000, gstr2b: 45000, delta: 0, status: "success" },
    { section: "Credit Notes", books: -12000, gstr2b: -15000, delta: -3000, status: "warning" },
    { section: "ISD Credit", books: 0, gstr2b: 25000, delta: 25000, status: "info" },
    { section: "Import of Goods", books: 450000, gstr2b: 450000, delta: 0, status: "success" },
  ];

  const totalDelta = data.reduce((acc, row) => acc + row.delta, 0);

  return (
    <div className="border rounded-md overflow-hidden bg-white">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="px-4 py-3 font-medium text-slate-700">Category</th>
            <th className="px-4 py-3 font-medium text-slate-700 text-right">Books (ITC)</th>
            <th className="px-4 py-3 font-medium text-slate-700 text-right">GSTR-2B (ITC)</th>
            <th className="px-4 py-3 font-medium text-slate-700 text-right">Variance</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, i) => (
            <tr key={i} className={
              row.status === 'warning' && row.delta < 0 ? 'bg-red-50/30' : 
              row.status === 'info' ? 'bg-blue-50/30' : ''
            }>
              <td className="px-4 py-3 font-medium text-slate-900">{row.section}</td>
              <td className="px-4 py-3 text-right">{formatIndianCurrency(row.books)}</td>
              <td className="px-4 py-3 text-right">{formatIndianCurrency(row.gstr2b)}</td>
              <td className={`px-4 py-3 text-right font-semibold ${
                row.delta < 0 ? 'text-red-600' : row.delta > 0 ? 'text-emerald-600' : 'text-slate-500'
              }`}>
                {row.delta > 0 ? '+' : ''}{formatIndianCurrency(row.delta)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 border-t font-bold">
          <tr>
            <td className="px-4 py-3 text-slate-900">Total Eligible ITC</td>
            <td className="px-4 py-3 text-right text-slate-900">{formatIndianCurrency(1733000)}</td>
            <td className="px-4 py-3 text-right text-slate-900">{formatIndianCurrency(1685000)}</td>
            <td className="px-4 py-3 text-right text-red-600">{formatIndianCurrency(totalDelta)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
