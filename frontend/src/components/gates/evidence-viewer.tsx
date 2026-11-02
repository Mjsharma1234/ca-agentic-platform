import type { Gate } from "@/lib/types";
import { RuleCheckResults } from "./rule-check-results";
import { EmptyState } from "@/components/ui/async-state";

const label = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-400">—</span>;
  if (typeof value === "number") return <span className="font-mono">{value.toLocaleString("en-IN")}</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc pl-4">
        {value.map((v, i) => (
          <li key={i}>
            <Value value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="space-y-1 rounded border border-slate-200 bg-slate-50 p-2">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <dt className="w-40 shrink-0 font-semibold text-slate-600">{label(k)}</dt>
            <dd className="text-slate-900">
              <Value value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  // Text is rendered as a React text node (auto-escaped); evidence is server data, never HTML.
  return <span>{String(value)}</span>;
}

/** Generic renderer for a gate's evidence pack: whatever the server attached, shown verbatim. */
export function EvidenceViewer({ gate }: { gate: Gate }) {
  const { rule_check_results, ...fields } = gate.evidence_pack ?? {};
  const entries = Object.entries(fields);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Evidence Pack</h2>
        <p className="text-xs text-slate-500">
          {gate.gate_id} · {gate.entity_type} · <span className="font-mono">{gate.entity_id}</span>
        </p>
      </div>

      {entries.length === 0 && !rule_check_results ? (
        <EmptyState title="No evidence attached" hint="The preparing agent has not attached an evidence pack to this gate." />
      ) : (
        <dl className="divide-y rounded-md border bg-white">
          {entries.map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-4 p-3 text-sm">
              <dt className="font-semibold text-slate-600">{label(k)}</dt>
              <dd className="col-span-2 text-slate-900 break-words">
                <Value value={v} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {rule_check_results && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Deterministic rule checks</h3>
          <RuleCheckResults results={rule_check_results} />
        </div>
      )}
    </div>
  );
}
