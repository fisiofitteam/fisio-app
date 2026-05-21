import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VideoLibraryEditor } from "@/components/VideoLibraryEditor";

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const v = await prisma.videoLibrary.findUnique({ where: { id: params.id } });
  if (!v) notFound();
  return (
    <div>
      <Link href="/fisio/biblioteca/videos" className="text-xs text-neutral-500">← Vídeos</Link>
      <h2 className="font-semibold mt-1 mb-4">{v.title}</h2>
      <VideoLibraryEditor video={{
        id: v.id,
        title: v.title,
        youtubeUrl: v.youtubeUrl,
        description: v.description ?? "",
        category: v.category,
        tags: v.tags,
      }} />
    </div>
  );
}
