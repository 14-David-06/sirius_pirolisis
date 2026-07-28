/**
 * Iconos del módulo de Activos Fijos.
 *
 * SVG inline (trazos estilo Lucide, viewBox 24×24) en lugar de emojis: los
 * emojis se renderizan distinto en cada sistema operativo, no heredan el color
 * del texto y no se alinean de forma consistente con la tipografía.
 *
 * Todos aceptan `className` para tamaño/color y son decorativos (`aria-hidden`):
 * el significado va en el texto que acompaña al icono.
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

/** Herramientas / activos fijos (identidad del módulo) */
export const IconWrench = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.2 9.2a2.4 2.4 0 0 1-3.4 0l-1.6-1.6a2.4 2.4 0 0 1 0-3.4Z" />
    <path d="m15 9-1.5-1.5" />
    <path d="M19.7 11.3 21 6l-3-3-5.3 1.3" />
  </Svg>
);

/** Caja / inventario (enlace a insumos) */
export const IconPackage = (props: IconProps) => (
  <Svg {...props}>
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
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

/** Persona / responsable */
export const IconUser = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Svg>
);

/** Entregar a un responsable */
export const IconUserPlus = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 21v-1a6 6 0 0 1 6-6h2" />
    <path d="M18 12v6" />
    <path d="M15 15h6" />
  </Svg>
);

/** Devolución */
export const IconUndo = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 8h11a5 5 0 0 1 0 10H8" />
    <path d="m7 4-4 4 4 4" />
  </Svg>
);

/** Ubicación */
export const IconMapPin = (props: IconProps) => (
  <Svg {...props}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
);

/** Calendario / vencimiento */
export const IconCalendar = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M3 11h18" />
  </Svg>
);

/** Valor / dinero */
export const IconCoins = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="9" cy="9" r="5" />
    <path d="M15.5 5.2a5 5 0 0 1 0 13.6" />
    <path d="M11 15.9A5 5 0 0 0 15.5 21" />
  </Svg>
);

/** Etiquetas / categorías */
export const IconTag = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12.59 2.59a2 2 0 0 0-1.42-.59H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.24 8.24a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.83Z" />
    <path d="M7 7h.01" />
  </Svg>
);

/** Editar */
export const IconPencil = (props: IconProps) => (
  <Svg {...props}>
    <path d="M17 3.5a2.1 2.1 0 0 1 3 3L7.5 19 3 20.5 4.5 16Z" />
    <path d="m15 5.5 3 3" />
  </Svg>
);

/** Dar de baja */
export const IconArchive = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 13h4" />
  </Svg>
);

/** Reactivar */
export const IconRotate = (props: IconProps) => (
  <Svg {...props}>
    <path d="M21 12a9 9 0 1 1-3.2-6.9" />
    <path d="M21 4v5h-5" />
  </Svg>
);

/** Chevron (acordeones, "ver detalle") */
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

/** Confirmación */
export const IconCheck = (props: IconProps) => (
  <Svg {...props}>
    <path d="m4 12.5 5 5L20 6.5" />
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

/** Empresa / multi-área */
export const IconBuilding = (props: IconProps) => (
  <Svg {...props}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
    <path d="M10 21v-3h4v3" />
  </Svg>
);

/** Historial / hoja de vida */
export const IconHistory = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 12a9 9 0 1 0 3.2-6.9" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </Svg>
);
