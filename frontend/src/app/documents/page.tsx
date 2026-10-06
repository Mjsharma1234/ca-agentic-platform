import { Button } from "@/components/ui/button";
import { FileText, UploadCloud } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function DocumentsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Document Triage
          </h1>
          <p className="text-slate-500 text-sm mt-1">Upload and review source documents</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-dashed border-2 bg-slate-50/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
            <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
            <h3 className="font-semibold text-slate-900 mb-2">Upload Documents</h3>
            <p className="text-sm text-slate-500 mb-6">Drag and drop PDFs, images, or ZIP files here, or click to browse.</p>
            <Button variant="secondary">Select Files</Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold text-slate-900">Recent Extractions</h3>
          </div>
          <CardContent className="p-0">
            <div className="flex items-center justify-center h-[260px] text-slate-500">
              No recent documents. Upload documents to initiate OCR extraction.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
