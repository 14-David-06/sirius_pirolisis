import type { Metadata, Viewport } from 'next';

// La página la abre un desconocido desde un QR o un WhatsApp, con el token en el
// fragmento. Que no la indexe nadie, y que ningún recurso que cargue reciba la
// URL en el `Referer`: el fragmento no viaja ahí, pero no hay por qué contarle a
// un tercero ni siquiera que existe `/recibir`.
export const metadata: Metadata = {
  title: 'Confirmar recepción · Sirius',
  description: 'Confirmación de recepción de una remisión de Sirius Regenerative Solutions.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

// Sin `maximumScale` ni `userScalable`: quien lee al sol necesita poder ampliar.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111111',
  colorScheme: 'light',
};

/**
 * Sin Navbar ni `TurnoProtection`: el layout raíz no los inyecta (cada página
 * privada los monta por su cuenta), así que basta con no montarlos aquí.
 *
 * El fondo del `body` lo pinta globals.css con el tema oscuro de la app interna;
 * esta página es de tema claro, pensada para leerse al sol, y se fuerza aquí para
 * que el rebote del scroll no muestre el fondo oscuro detrás.
 */
export default function RecibirLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{'body{background:#F6F7F9 !important;color:#222222 !important;}'}</style>
      {children}
    </>
  );
}
