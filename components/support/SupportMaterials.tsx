import { ExternalLink, FileText, Play } from "lucide-react";
import { supportWebUrl, type SupportFile, type SupportMaterialLink } from "@/lib/support/materials-contract";

export function SupportMaterials({ files, links }: { files: SupportFile[]; links: SupportMaterialLink[] }) {
  if (!files.length && !links.length) return null;
  return <div className="space-y-3">
    {files.map(file => <div key={file.id} className="rounded-xl border border-neutral-200 overflow-hidden">
      {file.mime.startsWith("image/") && <a href={file.href} target="_blank" rel="noopener noreferrer"><img src={file.href} alt={file.name} loading="lazy" className="max-h-72 w-full object-contain bg-neutral-50" /></a>}
      {file.mime.startsWith("video/") && <video src={file.href} controls preload="none" playsInline className="w-full max-h-80 bg-neutral-950" />}
      {file.mime.startsWith("audio/") && <audio src={file.href} controls preload="none" className="w-full" />}
      <a href={file.href + "?download=1"} className="flex items-center gap-2 p-3 text-xs hover:underline" download><FileText size={16} className="shrink-0" /><span className="min-w-0 break-all flex-1">{file.name}</span><span className="text-neutral-500 whitespace-nowrap">{file.size < 1048576 ? Math.ceil(file.size / 1024) + " KB" : (file.size / 1048576).toFixed(1) + " MB"} ↓</span></a>
    </div>)}
    {links.filter(link => supportWebUrl(link.url)).map((link, i) => {
      const host = new URL(link.url).hostname;
      const loom = host === "loom.com" || host.endsWith(".loom.com");
      return <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 hover:border-amber-400">
        {loom ? <Play size={18} className="shrink-0 text-amber-700" /> : <ExternalLink size={18} className="shrink-0" />}<span className="min-w-0 flex-1"><span className="block text-sm font-medium break-words">{link.title || (loom ? "Ver vídeo de Loom" : "Abrir recurso")}</span><span className="block text-xs text-neutral-500 truncate">{host}</span></span><ExternalLink size={13} className="shrink-0" />
      </a>;
    })}
  </div>;
}
