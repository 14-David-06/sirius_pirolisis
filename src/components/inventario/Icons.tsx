/**
 * Iconos del módulo de Inventario.
 *
 * SVG inline (trazos estilo Lucide, viewBox 24×24) en lugar de emojis: los
 * emojis se renderizan distinto en cada sistema operativo, no heredan el color
 * del texto y no se pueden alinear de forma consistente.
 *
 * Todos aceptan `className` para el tamaño/color y son decorativos
 * (`aria-hidden`): el significado va en el texto que acompaña al icono.
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

/** Caja / inventario */
export const IconPackage = (props: IconProps) => (
  <Svg {...props}>
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </Svg>
);

/** Entrada de mercancía */
export const IconArrowDownToBox = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3v10" />
    <path d="m8 9 4 4 4-4" />
    <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
  </Svg>
);

/** Salida de mercancía */
export const IconArrowUpFromBox = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 13V3" />
    <path d="m8 7 4-4 4 4" />
    <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
  </Svg>
);

/** Nuevo registro */
export const IconPlus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

/** Búsqueda */
export const IconSearch = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

/** Alerta */
export const IconAlert = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  </Svg>
);

/** Métricas */
export const IconChart = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 3v18h18" />
    <path d="M7 16v-5" />
    <path d="M12 16V8" />
    <path d="M17 16v-3" />
  </Svg>
);

/** Etiquetas / categorías */
export const IconTag = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12.59 2.59a2 2 0 0 0-1.42-.59H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.24 8.24a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.83Z" />
    <path d="M7 7h.01" />
  </Svg>
);

/** Calendario */
export const IconCalendar = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M3 11h18" />
  </Svg>
);

/** Fábrica / planta */
export const IconFactory = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 20h20" />
    <path d="M4 20V9l5 3V9l5 3V9l5 3v8" />
    <path d="M8 20v-4" />
    <path d="M13 20v-4" />
  </Svg>
);

/** Información */
export const IconInfo = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </Svg>
);

/** Herramientas (enlace a activos fijos) */
export const IconWrench = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.2 9.2a2.4 2.4 0 0 1-3.4 0l-1.6-1.6a2.4 2.4 0 0 1 0-3.4Z" />
    <path d="m15 9-1.5-1.5" />
    <path d="M19.7 11.3 21 6l-3-3-5.3 1.3" />
  </Svg>
);

/** Chevron (acordeones) */
export const IconChevron = (props: IconProps) => (
  <Svg {...props}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

/** Cerrar / limpiar */
export const IconX = (props: IconProps) => (
  <Svg {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
);

/** Sin resultados */
export const IconInbox = (props: IconProps) => (
  <Svg {...props}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
  </Svg>
);
