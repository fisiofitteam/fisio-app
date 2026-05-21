import Link from "next/link";
import { VideoLibraryEditor } from "@/components/VideoLibraryEditor";

export default function NewVideoPage() {
  return (
    <div>
      <Link href="/fisio/biblioteca/videos" className="text-xs text-neutral-500">← Vídeos</Link>
      <h2 className="font-semibold mt-1 mb-4">Nuevo vídeo</h2>
      <VideoLibraryEditor video={null} />
    </div>
  );
}
