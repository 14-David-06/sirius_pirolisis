import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/**
 * Marco de las páginas de solicitudes: la foto de planta, el velo oscuro, el
 * Navbar y el Footer de PiroliApp.
 *
 * Existe para que los componentes de @sirius/solicitudes queden dentro del
 * cromado de esta app sin repetirlo en cuatro páginas. `superficie-noche` (del
 * paquete) da el color de texto claro por herencia: sin ella, cualquier texto al
 * que se le olvide una clase de color hereda el `--foreground` del body, que en
 * modo claro es gris oscuro y desaparece sobre la foto.
 */
const BG =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

export function SolicitudesShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="superficie-noche relative min-h-screen bg-cover bg-center bg-no-repeat text-white"
      style={{ backgroundImage: BG }}
    >
      <div className="absolute inset-0 bg-black/55 print:hidden" />
      <div className="relative z-10">
        <Navbar />
        {children}
        <Footer />
      </div>
    </div>
  );
}
