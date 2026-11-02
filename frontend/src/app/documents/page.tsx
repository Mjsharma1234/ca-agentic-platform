"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatIndianCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Client, DocumentItem } from "@/lib/types";
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cpu,
} from "lucide-react";
import Link from "next/link";

const ALLOWED_EXT = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"];
const MAX_BYTES = 25 * 1024 * 1024;

function precheck(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!ALLOWED_EXT.includes(ext)) return `unsupported type '${ext || "none"}' (allowed: ${ALLOWED_EXT.join(", ")})`;
  if (file.size > MAX_BYTES) return `exceeds the 25 MB limit (${(file.size / 1048576).toFixed(1)} MB)`;
  if (file.size === 0) return "file is empty";
  return null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; message: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [cl, dc] = await Promise.all([api.listClients(), api.listDocuments()]);
    if (cl.error || !cl.data) {
      setLoadError(cl.error || "Could not load clients.");
    } else {
      setClients(cl.data);
      setSelectedClientId((cur) => cur || cl.data![0]?.id || "");
    }
    if (dc.error || !dc.data) setLoadError((e) => e || dc.error || "Could not load documents.");
    else setDocs(dc.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!selectedClientId) {
      setActionError("Select a client before uploading.");
      return;
    }
    setActionError(null);
    setIsExtracting(true);
    setResults([]);

    const outcome: { name: string; ok: boolean; message: string }[] = [];
    for (const file of Array.from(files)) {
      const problem = precheck(file);
      if (problem) {
        outcome.push({ name: file.name, ok: false, message: problem });
        continue;
      }
      const res = await api.uploadDocument(selectedClientId, file);
      if (res.error || !res.data) {
        outcome.push({ name: file.name, ok: false, message: res.error || "Upload failed." });
      } else {
        const conf = res.data.extraction_confidence;
        outcome.push({
          name: file.name,
          ok: true,
          message: `Extracted invoice ${res.data.invoice_number}${conf != null ? ` at ${Math.round(conf * 100)}% confidence` : ""}${
            res.data.status === "NEEDS_REVIEW" ? " — held at Gate G2 for review" : ""
          }.`,
        });
      }
    }
    setResults(outcome);
    setIsExtracting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const refreshed = await api.listDocuments();
    if (refreshed.data) setDocs(refreshed.data);
  };

  const handleVerify = async (docId: string) => {
    setVerifyingId(docId);
    setActionError(null);
    const res = await api.verifyDocument(docId);
    setVerifyingId(null);
    if (res.error || !res.data) {
      setActionError(res.error || "Could not verify document.");
      return;
    }
    setDocs((prev) => prev.map((d) => (d.id === docId ? res.data!.document : d)));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Document Intake & Neural OCR Layer (Agent IN-1)
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            RapidOCR engine: ingests tax invoices and statements into the tenant's statutory pipeline
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="target-client" className="text-xs font-semibold text-slate-700 uppercase">Target Client:</label>
          <select
            id="target-client"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            disabled={clients.length === 0}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none"
          >
            {clients.length === 0 && <option value="">No clients</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-300 text-red-900 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-600" /> {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs underline font-semibold">Dismiss</button>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg divide-y text-sm">
          {results.map((r, i) => (
            <div key={i} className={`px-4 py-2.5 flex items-start gap-2 ${r.ok ? "text-emerald-900" : "text-red-900"}`}>
              {r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}
              <span><strong>{r.name}:</strong> {r.message}</span>
            </div>
          ))}
          <div className="px-4 py-2 text-right">
            <button onClick={() => setResults([])} className="text-xs text-slate-600 underline font-semibold">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            processFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`lg:col-span-1 border-dashed border-2 cursor-pointer transition-all ${
            isDragging
              ? "border-blue-600 bg-blue-50/70 scale-[1.01]"
              : "border-slate-300 bg-slate-50/60 hover:border-blue-500 hover:bg-blue-50/30"
          }`}
        >
          <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_EXT.join(",")}
              className="hidden"
              onChange={(e) => processFiles(e.target.files)}
            />

            {isExtracting ? (
              <div className="flex flex-col items-center space-y-3">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                <h3 className="font-bold text-slate-900">Neural OCR Parsing...</h3>
                <p className="text-xs text-slate-600">Extracting GSTIN, PAN, dates and values</p>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Upload Tax Invoices</h3>
                <p className="text-xs text-slate-600 mb-5 max-w-xs">
                  PDF, PNG, JPG, TIFF or BMP up to 25 MB each. Documents are stored against the selected client.
                </p>
                <Button
                  type="button"
                  disabled={!selectedClientId}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <UploadCloud className="w-4 h-4 mr-2" /> Browse & Run OCR
                </Button>
                <div className="mt-4 pt-4 border-t border-slate-200 w-full flex items-center justify-center gap-2 text-[11px] text-slate-500">
                  <Cpu className="w-4 h-4 text-emerald-600" />
                  <span>RapidOCR ONNX engine</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 bg-white">
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold text-slate-900">OCR Extracted Documents ({docs.length})</h3>
            <p className="text-xs text-slate-500">
              Confidence &lt; 0.95 halts at Human Gate G2 until a person verifies the extraction
            </p>
          </div>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase border-b">
                <tr>
                  <th className="p-3">Document</th>
                  <th className="p-3">Supplier & GSTIN</th>
                  <th className="p-3 text-right">Recognized Value</th>
                  <th className="p-3 text-center">OCR Conf.</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Verify</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading documents...</td></tr>
                )}
                {!loading && loadError && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-red-700">
                      {loadError}
                      <button onClick={fetchAll} className="underline font-semibold ml-2">Retry</button>
                    </td>
                  </tr>
                )}
                {!loading && !loadError && docs.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">No documents uploaded yet.</td></tr>
                )}
                {docs.map((doc) => {
                  const conf = doc.extraction_confidence;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 truncate max-w-[180px]" title={doc.file_name}>{doc.file_name}</div>
                        <div className="text-slate-500">
                          {doc.client} • <span className="text-slate-400">{relativeTime(doc.uploaded_at)}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{doc.supplier_name || "—"}</div>
                        <div className="font-mono text-slate-500">{doc.supplier_gstin || "GSTIN not detected"}</div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="font-bold text-slate-900">{formatIndianCurrency(doc.total_value)}</div>
                        <div className="text-[10px] text-slate-500">Taxable: {formatIndianCurrency(doc.taxable_value)}</div>
                      </td>
                      <td className="p-3 text-center">
                        {conf == null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold ${
                              conf >= 0.95 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800 border border-amber-300"
                            }`}
                          >
                            {Math.round(conf * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {doc.status === "NEEDS_REVIEW" ? (
                          <Link href="/gates">
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 cursor-pointer">
                              <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" /> Gate G2
                            </Badge>
                          </Link>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" /> {doc.status}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {doc.status === "NEEDS_REVIEW" || doc.status === "EXTRACTED" ? (
                          <button
                            type="button"
                            disabled={verifyingId === doc.id}
                            onClick={() => handleVerify(doc.id)}
                            title="Confirm the extraction (Gate G2)"
                            className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-300 transition-colors font-semibold disabled:opacity-50"
                          >
                            {verifyingId === doc.id ? "Verifying..." : "Verify"}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
