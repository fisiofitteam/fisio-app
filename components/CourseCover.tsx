// Portada de un curso estilo Skool: fondo oscuro (imagen o degradado con
// franjas diagonales) y el título en grande, blanco y en mayúsculas.
export function CourseCover({ title, coverUrl, className = "" }: { title: string; coverUrl?: string | null; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center text-center ${className}`}
      style={{
        background: coverUrl
          ? `center/cover no-repeat url(${coverUrl})`
          : "linear-gradient(135deg, #1c1c1c 0%, #0a0a0a 100%)",
      }}
    >
      {/* franjas diagonales sutiles cuando no hay imagen */}
      {!coverUrl && (
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ background: "repeating-linear-gradient(115deg, #fff 0 2px, transparent 2px 22px)" }}
        />
      )}
      {coverUrl && <div className="absolute inset-0 bg-black/35" />}
      <h3
        className="relative px-4 font-extrabold uppercase text-white leading-[0.95] tracking-tight"
        style={{ fontSize: "clamp(1.5rem, 4vw, 2.6rem)", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
      >
        {title}
      </h3>
    </div>
  );
}
