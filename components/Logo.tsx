export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="#0A0A0A" />
      </svg>
    </span>
  );
}

export function LogoFull({ size = 24, variant = "light" }: { size?: number; variant?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Logo size={size} />
      <span
        className="app-logo-text font-semibold tracking-tight"
        style={{ color: variant === "dark" ? "#FAFAFA" : "#0A0A0A" }}
      >
        FisioFit App
      </span>
    </span>
  );
}
