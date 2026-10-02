export function Brand({
  href = "/",
  subtitle = "A little room to think.",
}: {
  href?: string;
  subtitle?: string;
}) {
  return (
    <a href={href} className="brand" aria-label="PODU home">
      <img src="/assets/podu-logo.png" alt="" width="44" height="44" />
      <span>
        <strong>PODU</strong>
        <span className="brand-subtitle">{subtitle}</span>
      </span>
    </a>
  );
}
