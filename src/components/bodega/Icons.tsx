/**
 * Iconos propios del módulo Bodega.
 *
 * Mismo criterio que en Inventario: SVG inline (trazos estilo Lucide, viewBox
 * 24×24) en lugar de emojis, para que hereden color y tamaño del texto. Los
 * iconos genéricos (entrada, salida, alerta, cerrar…) se reutilizan desde
 * `@/components/inventario/Icons` en vez de duplicarse aquí.
 */

interface IconProps {
  className?: string;
}

function Svg({ className = 'w-5 h-5', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Bodega / almacén */
export const IconWarehouse = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 20V9.5a2 2 0 0 1 1.24-1.85l8-3.2a2 2 0 0 1 1.52 0l8 3.2A2 2 0 0 1 22 9.5V20" />
    <path d="M2 20h20" />
    <path d="M7 20v-6h10v6" />
    <path d="M7 17h10" />
  </Svg>
);

/** Biochar puro (carbón / material granular) */
export const IconBiochar = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 17.5 8 9l4 4 3-5 5 9.5Z" />
    <path d="M2 20h20" />
    <circle cx="7.5" cy="5.5" r="1.5" />
  </Svg>
);

/** Bioabono (materia orgánica) */
export const IconBioabono = (props: IconProps) => (
  <Svg {...props}>
    <path d="M11 20c-4 0-7-3-7-7 0-1 .2-2 .6-2.9C7 11 9 12 11 14c1-3 4-6 8-7 .7 4-1 8-4 10a7 7 0 0 1-4 3Z" />
    <path d="M11 20c0-4 2-7 5-9" />
  </Svg>
);

/** Biológicos (inóculo líquido) */
export const IconBiologicos = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 3h6" />
    <path d="M10 3v5.5L5.6 16A3 3 0 0 0 8.2 20.5h7.6A3 3 0 0 0 18.4 16L14 8.5V3" />
    <path d="M7.2 14h9.6" />
  </Svg>
);

/** Blend (mezcla de materias primas) */
export const IconBlend = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="9" cy="9" r="6" />
    <circle cx="15" cy="15" r="6" />
  </Svg>
);

/** Lote / bache */
export const IconLayers = (props: IconProps) => (
  <Svg {...props}>
    <path d="m12 3 9 5-9 5-9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);
