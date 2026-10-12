import { useRef, useState } from "react";
import { Upload, FileDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { exportProductTemplate, readProductExcel } from "@/lib/exporter";

export default function ProductImport({ channels, onDone }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const rows = await readProductExcel(f);
      if (!rows.length) { toast.error("File kosong atau format tidak sesuai template"); return; }
      const { data } = await api.post("/products/bulk", { rows });
      toast.success(`${data.created} produk baru, ${data.updated} produk diperbarui`);
      if (data.errors?.length) toast.error(`${data.errors.length} baris gagal: ${data.errors.slice(0, 3).join("; ")}`);
      onDone();
    } catch { toast.error("Gagal mengimpor file Excel"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const btn = "flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary";
  return (
    <>
      <button onClick={() => exportProductTemplate(channels.map((c) => c.name))} data-testid="product-template-button" className={btn}>
        <FileDown className="w-4 h-4" /> Template
      </button>
      <label className={`${btn} cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`} data-testid="product-import-button">
        <Upload className="w-4 h-4" /> {busy ? "Mengimpor..." : "Impor Excel"}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" data-testid="product-import-input" />
      </label>
    </>
  );
}
