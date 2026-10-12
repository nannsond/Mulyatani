import { useRef, useState } from "react";
import { Upload, FileDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import ImportPreviewDialog from "@/components/ImportPreviewDialog";

export default function ExcelImport({ title, endpoint, parse, onTemplate, onDone, testid }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const body = await parse(f);
      if (!Object.values(body)[0].length) { toast.error("File kosong atau format tidak sesuai template"); return; }
      const { data } = await api.post(endpoint, { ...body, dry_run: true });
      setPending({ body, preview: data.preview });
    } catch { toast.error("Gagal membaca file Excel"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(endpoint, pending.body);
      toast.success(`${data.created} ${title} baru, ${data.updated} diperbarui`);
      setPending(null); onDone();
    } catch { toast.error("Gagal menyimpan data impor"); }
    finally { setBusy(false); }
  };

  const btn = "flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary";
  return (
    <>
      <button onClick={onTemplate} data-testid={`${testid}-template-button`} className={btn}><FileDown className="w-4 h-4" /> Template</button>
      <label className={`${btn} cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`} data-testid={`${testid}-import-button`}>
        <Upload className="w-4 h-4" /> {busy && !pending ? "Membaca..." : "Impor Excel"}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" data-testid={`${testid}-import-input`} />
      </label>
      {pending && <ImportPreviewDialog preview={pending.preview} title={title} busy={busy} onConfirm={confirm} onClose={() => setPending(null)} />}
    </>
  );
}
