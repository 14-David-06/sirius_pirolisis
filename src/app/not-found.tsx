import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="max-w-xl w-full rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md p-8 shadow-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300">404</p>
        <h1 className="mt-4 text-3xl font-bold">Esta página está en mantenimiento</h1>
        <p className="mt-4 text-sm text-slate-300">
          Por ahora, la sección de solicitudes no está disponible en este portal. Puedes continuar en el siguiente enlace:
        </p>
        <Link
          href="https://novedadesnomina.s3.us-east-1.amazonaws.com/Index_Novedades_Nomina.html"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
        >
          Ir a novedades de nómina
        </Link>
      </div>
    </div>
  );
}
