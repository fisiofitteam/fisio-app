import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { VideosByCategory } from "@/components/VideosByCategory";

export default async function LibraryVideosPage() {
  const videos = await prisma.videoLibrary.findMany({ orderBy: [{ title: "asc" }] });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">{videos.length} vídeos / mini-clases</p>
        <Link href="/fisio/biblioteca/videos/nuevo" className="btn btn-primary text-xs">
          + Nuevo vídeo
        </Link>
      </div>

      <VideosByCategory
        videos={videos.map((v) => ({
          id: v.id,
          title: v.title,
          youtubeUrl: v.youtubeUrl,
          category: v.category,
          tags: v.tags ?? "",
        }))}
      />
    </div>
  );
}
