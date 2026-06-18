export function tieneAccesoPanel(cedula: string): boolean {
  if (!cedula) return false;
  const autorizados = (process.env.NEXT_PUBLIC_PANEL_ACCESS_CEDULAS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return autorizados.includes(cedula.trim());
}
