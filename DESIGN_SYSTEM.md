# SIRIUS PIROLISIS — Sistema de Diseño Visual

> **Prompt de referencia completo.** Pásale este archivo a cualquier IA junto con:
> _"Usando el patrón de diseño descrito en este documento, crea un nuevo componente para [DESCRIPCIÓN]. Asegúrate de seguir todos los estándares visuales, especialmente los valores numéricos en text-3xl, los colores semánticos y la estructura glass-morphism."_

---

## 🎨 1. Sistema de Color y Estética Glass-Morphism

### Paleta de Colores Completa

**Colores de Marca:**
```
Verde marca:    #5A7836  (botones CTA principales)
Verde hover:    #4a6429  (estado hover)
Verde profundo: #3d5422  (gradiente fin)
```

**Etapas de Carbono (CSS variables en CarbonoTotalDashboard):**
```
eBiomasa:     #3B6D11  verde oscuro
ePirólisis:   #854F0B  marrón
eUse:         #185FA5  azul
eTransporte:  #533AB7  púrpura
```

**Colores Semánticos (Tailwind):**
```
Éxito / Positivo:   emerald-300 · emerald-400 · #10b981 · #16a34a
Peligro / Negativo: red-300    · red-400    · #ef4444 · #dc2626
Advertencia:        amber-300  · amber-400  · #f59e0b
Info / Azul:        blue-400   · blue-500   · #3b82f6
Púrpura:            violet-400 · #8b5cf6
```

**Variables CSS Globales (`globals.css`):**
```css
/* Dark mode — default */
--background: #1a1a2e;
--foreground: #eee2dc;
--accent:     #16213e;
--secondary:  #0f3460;
--highlight:  #e94560;
```

### Glass-Morphism — Niveles de Transparencia

```tailwind
/* Nivel 1 — Muy sutil (subsecciones internas) */
bg-white/5  border border-white/10  rounded-xl  backdrop-blur-sm

/* Nivel 2 — Estándar (cards más comunes) */
bg-white/10 border border-white/20  rounded-2xl backdrop-blur-md

/* Nivel 3 — Principal (contenedores grandes) */
bg-white/20 border border-white/30  rounded-2xl backdrop-blur-md shadow-lg

/* Nivel 4 — Overlay pesado (modales, capas) */
bg-black/35 border border-white/30  rounded-lg  backdrop-blur-md shadow-lg
```

**Blur levels:**
```tailwind
backdrop-blur-sm   /* sutil */
backdrop-blur-md   /* estándar — más usado */
backdrop-blur-xl   /* modal / overlay completo */
```

### Background con Overlay (patrón de página)
```tsx
<div className="relative min-h-screen">
  {/* Imagen de fondo fija */}
  <div
    className="fixed inset-0 z-0 bg-cover bg-center"
    style={{ backgroundImage: 'url(/img/background.jpg)' }}
  />
  {/* Overlay oscuro */}
  <div className="fixed inset-0 z-10 bg-black/60" />
  {/* Contenido */}
  <div className="relative z-20">
    <Navbar />
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6">{/* secciones */}</div>
    </main>
  </div>
</div>
```

---

## ✍️ 2. Tipografía y Tamaños

### Jerarquía de Títulos (H1 → H4)

```tailwind
/* H1 — Título de página */
text-3xl sm:text-4xl font-bold text-white drop-shadow-lg

/* H2 — Título de sección */
text-xl sm:text-2xl font-semibold text-white drop-shadow

/* H3 — Título de card */
text-sm font-semibold uppercase tracking-[0.14em] text-white/80

/* H4 — Label de campo / columna */
text-xs font-medium uppercase tracking-[0.18em] text-white/75
```

### ⚡ VALORES NUMÉRICOS — MUY IMPORTANTE

```tailwind
/* Valor principal de métrica — SIEMPRE así */
text-3xl font-bold text-white

/* Variantes por contexto */
text-2xl font-bold text-white            /* Valor secundario */
text-xl  font-bold text-emerald-300      /* Positivo destacado */
text-xl  font-bold text-red-300          /* Negativo destacado */
text-3xl font-bold text-emerald-300      /* Hero positivo */
text-5xl sm:text-6xl font-bold text-white /* Métrica principal de página */

/* Sufijo de unidad — siempre junto al número */
<span className="ml-1 text-sm font-normal text-white/65">tCO₂eq</span>
<span className="ml-1 text-sm text-white/65">CORCs</span>
```

### Texto Descriptivo

```tailwind
text-sm  text-white/70   /* Descripción normal */
text-xs  text-white/50   /* Subtítulo */
text-xs  text-white/40   /* Notas al pie */
text-xs  text-white/30   /* Muy sutil / watermark */
text-xs  italic text-white/40  /* Estados vacíos */
```

---

## 📐 3. Estructura de Layouts

### Grids Responsivos

```tailwind
/* 2 columnas — layout principal */
grid grid-cols-1 gap-6 xl:grid-cols-2

/* 4 tarjetas de métricas */
grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4

/* 3 columnas */
grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3

/* 5 columnas (stats compactos) */
grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5

/* Cascada con columnas de ancho fijo */
grid grid-cols-[1fr_minmax(110px,auto)] sm:grid-cols-[1fr_minmax(110px,auto)_minmax(136px,auto)] gap-x-4
```

### Espaciado Consistente

```tailwind
space-y-6        /* Entre secciones principales */
gap-6            /* Grid principal */
gap-4            /* Grid de cards */
p-6              /* Padding card principal */
p-4 sm:p-6       /* Padding responsivo */
px-4 py-3        /* Botones y filas de tabla */
mb-4 mb-6 mb-8   /* Márgenes inferiores */
```

---

## 🧩 4. Componentes Recurrentes

### Card de Métrica Estándar

```tsx
<motion.article
  variants={cardItem}
  whileHover={{ scale: 1.02, transition: { type: 'spring', stiffness: 260, damping: 20 } }}
  className="rounded-2xl border bg-white/10 p-4 backdrop-blur-sm"
  style={{ borderColor: `${color}AA`, opacity: enabled ? 1 : 0.55 }}
>
  <p className="text-sm font-semibold" style={{ color }}>{label}</p>
  <div className="mt-2 text-3xl font-bold text-white">
    {formatTon(value)}
    <span className="ml-1 text-sm font-normal text-white/65">{unit}</span>
  </div>
  <p className="mt-1 text-sm text-white/70">{formatTon(percentage, 1)}% del total</p>
</motion.article>
```

### Card con Gradiente Semántico

```tsx
<div className="text-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 p-4 rounded-lg border border-emerald-400/30">
  <div className="text-3xl font-bold text-emerald-200 mb-2">{value}</div>
  <div className="text-sm drop-shadow text-white/80">{label}</div>
</div>

{/* Variantes de color */}
from-red-500/20    to-red-600/10    border-red-400/30
from-amber-500/20  to-amber-600/10  border-amber-400/30
from-blue-500/20   to-blue-600/10   border-blue-400/30
```

### Card con Subsecciones Internas

```tsx
<div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
  <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
    Título
  </h3>
  {/* Subsección */}
  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
    <div className="flex items-center justify-between text-xs text-white/80">
      <span>Campo</span>
      <span className="font-semibold text-white">Valor</span>
    </div>
    <div className="border-t border-white/10 pt-2">
      {/* más contenido */}
    </div>
  </div>
</div>
```

### Header de Sección con Filtros

```tsx
<section className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
  <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
    Filtros
  </h3>

  {/* Botones de período */}
  <div className="flex flex-wrap gap-2 mb-3">
    {periodOptions.map((opt) => (
      <button
        key={opt.key}
        onClick={() => setActive(opt.key)}
        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 ${
          active === opt.key
            ? 'border-white/70 bg-white/20 text-white'
            : 'border-white/30 bg-white/5 text-white/75 hover:bg-white/10'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>

  {/* Toggles de categoría (pill con color) */}
  <div className="flex flex-wrap gap-2">
    {stages.map((stage) => {
      const on = enabled[stage.key];
      return (
        <button
          key={stage.key}
          onClick={() => toggle(stage.key)}
          className="rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-150"
          style={{
            borderColor: stage.color,
            backgroundColor: on ? stage.color : 'transparent',
            color: on ? '#FFFFFF' : stage.color,
            opacity: on ? 1 : 0.55,
          }}
        >
          {stage.label}
        </button>
      );
    })}
  </div>
</section>
```

### Badges y Estados

```tsx
{/* Badge de estado general */}
<span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
  loading
    ? 'border-amber-300/70 bg-amber-500/20 text-amber-200'
    : 'border-emerald-300/70 bg-emerald-500/20 text-emerald-200'
}`}>
  {loading ? 'Calculando...' : 'Actualizado'}
</span>

{/* Paleta de badges semánticos */}
// Positivo:    border-emerald-300/70 bg-emerald-500/20 text-emerald-200
// Negativo:    border-red-300/70     bg-red-500/20     text-red-200
// Advertencia: border-amber-300/70   bg-amber-500/20   text-amber-200
// Info:        border-blue-300/70    bg-blue-500/20    text-blue-200

{/* Indicadores de signo (+/−/=) en cascadas */}
<span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 text-xs font-bold text-emerald-400">(+)</span>
<span className="shrink-0 rounded bg-red-400/15     px-1.5 py-0.5 text-xs font-bold text-red-400">(−)</span>
<span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 text-xs font-bold text-emerald-400">(=)</span>
```

### Botones y Controles

```tsx
{/* Primario CTA */}
<button className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] hover:from-[#4a6429] hover:to-[#3d5422]
  text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200
  hover:scale-105 shadow-md hover:shadow-lg">
  Acción principal
</button>

{/* Peligro */}
<button className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700
  text-white px-4 py-2 rounded-lg font-medium transition-all duration-200">
  Eliminar
</button>

{/* Ghost */}
<button className="border border-white/30 bg-white/5 text-white/75 hover:bg-white/10
  px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150">
  Cancelar
</button>

{/* Input glass */}
<input className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg
  text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#5A7836]
  focus:border-transparent backdrop-blur-sm transition-all duration-200" />
```

---

## 📊 5. Gráficos y Visualizaciones (Recharts)

### Configuración Estándar Completa

```tsx
<div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
    Título del gráfico
  </h3>
  <div className="h-[320px] w-full">
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <BarChart data={data} margin={{ top: 12, right: 8, left: -20, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
        <XAxis dataKey="label" stroke="rgba(255,255,255,0.7)" tick={{ fontSize: 12 }} />
        <YAxis stroke="rgba(255,255,255,0.7)" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            background: 'rgba(12,17,24,0.92)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 12,
          }}
          formatter={(value) => [`${formatTon(Number(value))} tCO₂eq`, '']}
        />
        <Bar dataKey="eBiomas"     stackId="total" fill="#3B6D11" radius={[4, 4, 0, 0]} />
        <Bar dataKey="epirolisis"  stackId="total" fill="#854F0B" radius={[4, 4, 0, 0]} />
        <Bar dataKey="euse"        stackId="total" fill="#185FA5" radius={[4, 4, 0, 0]} />
        <Bar dataKey="etransporte" stackId="total" fill="#533AB7" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
</div>
```

### Donut Chart

```tsx
<PieChart>
  <Pie
    data={donutData}
    dataKey="value"
    nameKey="name"
    cx="50%" cy="50%"
    innerRadius={70}
    outerRadius={105}
    paddingAngle={2}
  >
    {donutData.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
  </Pie>
  <Tooltip
    contentStyle={{
      background: 'rgba(12,17,24,0.92)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 12,
    }}
    formatter={(value) => `${formatTon(Number(value))} tCO₂eq`}
  />
</PieChart>
```

### Colores de Series

```
eBiomasa:     #3B6D11
ePirólisis:   #854F0B
eUse:         #185FA5
eTransporte:  #533AB7
Serie verde:  #10b981
Serie roja:   #ef4444
Serie azul:   #3b82f6
```

---

## 🔔 6. Alertas y Notificaciones

```tsx
{/* Advertencia */}
<div className="rounded-xl border border-amber-400/60 bg-amber-500/20 p-3 text-sm text-amber-100">
  <strong>Advertencia:</strong> Descripción del problema.
</div>

{/* Error / Peligro */}
<div className="rounded-xl border border-red-400/60 bg-red-500/20 p-3 text-sm text-red-100">
  {errorMessage}
</div>

{/* Éxito */}
<div className="rounded-xl border border-emerald-400/60 bg-emerald-500/20 p-3 text-sm text-emerald-100">
  Operación completada exitosamente.
</div>

{/* Info */}
<div className="rounded-xl border border-blue-400/60 bg-blue-500/20 p-3 text-sm text-blue-100">
  Información relevante para el usuario.
</div>
```

---

## ⚡ 7. Animaciones y Transiciones

### Framer-Motion Variants (copiar directo)

```typescript
import { type Variants } from 'framer-motion';

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: 'easeOut' },
  },
};

const cardContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

const cardItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
};
```

### Uso en JSX

```tsx
{/* Sección con fade */}
<motion.section variants={fadeInUp} initial="hidden" animate="visible">

{/* Grid de cards con stagger — key fuerza re-animación al cambiar filtros */}
<motion.div
  key={filterSignature}
  variants={cardContainer}
  initial="hidden"
  animate="visible"
  className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
>
  {items.map((item) => (
    <motion.article
      key={item.id}
      variants={cardItem}
      whileHover={{ scale: 1.02, transition: { type: 'spring', stiffness: 260, damping: 20 } }}
    />
  ))}
</motion.div>
```

### Tailwind Hover Effects

```tailwind
/* Cards interactivas */
hover:scale-105 transition-all duration-200

/* Botones */
transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed

/* Links con flecha */
hover:translate-x-1 transition-transform duration-150
```

### Estados de Carga

```tsx
{/* Skeleton */}
<div className="animate-pulse space-y-3">
  <div className="h-8 bg-white/10 rounded-lg w-3/4" />
  <div className="h-4 bg-white/5  rounded-lg w-1/2" />
</div>

{/* Spinner */}
<div className="flex items-center justify-center py-12">
  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/60" />
</div>

{/* Inline con texto */}
<div className="flex items-center gap-2 text-xs text-white/50">
  <Loader2 className="h-3 w-3 animate-spin" />
  Calculando...
</div>
```

---

## 📋 8. Tablas de Datos

### Tabla con Glass-Morphism y Hover States

```tsx
<div className="overflow-hidden rounded-xl border border-white/20 bg-white/5">
  <table className="w-full text-sm">
    <thead className="border-b border-white/20 bg-white/10">
      <tr>
        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
          Columna A
        </th>
        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/60">
          Valor
        </th>
        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/60">
          Estado
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr
          key={row.id}
          className="border-t border-white/10 transition-colors hover:bg-white/5"
        >
          <td className="px-5 py-3 font-semibold text-white">{row.name}</td>
          <td className="px-5 py-3 text-right text-white/70">
            <span className="text-xl font-bold text-white">{formatTon(row.value)}</span>
            <span className="ml-1 text-xs text-white/50">unidad</span>
          </td>
          <td className="px-5 py-3 text-right">
            <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold
              border-emerald-300/70 bg-emerald-500/20 text-emerald-200">
              {row.status}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### Sub-filas Indentadas (cascada)

```tsx
{/* Fila padre */}
<div className="flex items-start gap-2 px-4 py-3">
  <span className="shrink-0 rounded bg-red-400/15 px-1.5 py-0.5 text-xs font-bold text-red-400">(−)</span>
  <span className="text-sm font-semibold text-white">Categoría padre</span>
</div>

{/* Sub-filas */}
<div className="border-l-2 border-white/10 pl-3 ml-7 space-y-1">
  {items.map((item) => (
    <div key={item.key} className="flex items-center gap-1.5 text-xs text-white/55">
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
      <span style={{ color: `${item.color}CC` }}>↳ {item.label}</span>
      <span className="ml-auto font-medium" style={{ color: `${item.color}99` }}>
        {formatTon(item.value, 3)}
      </span>
    </div>
  ))}
</div>
```

---

## 🔲 9. Íconos (Lucide React)

### Categorías y Tamaños Estándar

```tsx
import {
  // Tendencias y métricas
  TrendingUp, TrendingDown, BarChart3, PieChart, Activity,
  // Estados y alertas
  AlertTriangle, CheckCircle, XCircle, Info, Loader2,
  // Acciones
  RefreshCw, Filter, Download, Upload, Plus, Trash2, Edit2,
  // Tiempo
  Calendar, Clock, Timer,
  // Dominio pirolisis
  Leaf, Factory, Truck, Zap, Flame, Wind,
} from 'lucide-react';

{/* Tamaños estándar */}
<Icon className="h-3 w-3" />   {/* Muy pequeño — inline inline */}
<Icon className="h-4 w-4" />   {/* Pequeño — junto a texto */}
<Icon className="h-5 w-5" />   {/* Medio — badge / botón */}
<Icon className="h-6 w-6" />   {/* Grande — header */}

{/* Con colores semánticos */}
<TrendingUp   className="h-4 w-4 text-emerald-400" />
<TrendingDown className="h-4 w-4 text-red-400" />
<AlertTriangle className="h-4 w-4 text-amber-400" />
<CheckCircle  className="h-4 w-4 text-emerald-400" />
<Loader2      className="h-4 w-4 animate-spin text-white/50" />
```

---

## 📱 10. Responsividad

### Breakpoints Usados

```
sm: 640px   mobile → tablet
md: 768px   tablet
lg: 1024px  desktop
xl: 1280px  large desktop
```

### Patrones Comunes

```tailwind
/* Tipografía */
text-2xl sm:text-3xl
text-4xl sm:text-5xl sm:text-6xl

/* Grid */
grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
grid-cols-1 gap-6 xl:grid-cols-2

/* Flex direction */
flex flex-col sm:flex-row sm:items-center

/* Show / hide */
hidden sm:block        /* solo desde tablet */
block  sm:hidden       /* solo móvil */
hidden md:table-cell   /* columna oculta en móvil */

/* Padding */
px-3 sm:px-6 lg:px-8
p-4 sm:p-6 lg:p-8

/* Gaps */
gap-3 sm:gap-6
```

---

## 🔢 11. Formateo de Números

### Funciones Auxiliares (copiar directo)

```typescript
// Formato general — locale es-CO (puntos como miles, coma decimal)
function formatTon(value: number, maxDigits = 3): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: maxDigits });
}

// Moneda COP
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Porcentaje
function formatPercent(value: number, decimals = 1): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: decimals }) + '%';
}

// Eje de gráficas (compacto)
function formatAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000)     return `${(value / 1_000).toFixed(1)}k`;
  return formatTon(value, 1);
}
```

### Componente AnimatedCount (framer-motion)

```tsx
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

function AnimatedCount({
  value,
  className,
  suffix,
}: {
  value: number;
  className?: string;
  suffix?: string;
}) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) =>
    Number(latest).toLocaleString('es-CO', { maximumFractionDigits: 3 })
  );
  const [display, setDisplay] = useState(() => formatTon(value));
  const first = useRef(true);

  useEffect(() => {
    const unsub = rounded.on('change', setDisplay);
    return unsub;
  }, [rounded]);

  useEffect(() => {
    if (first.current) { first.current = false; motionValue.set(value); return; }
    const controls = animate(motionValue, value, { duration: 0.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [motionValue, value]);

  return (
    <span className={className}>
      {display}
      {suffix && <span className="ml-1 text-sm text-white/65">{suffix}</span>}
    </span>
  );
}
```

---

## 📭 12. Estados Vacíos y Errores

```tsx
{/* Estado vacío */}
{items.length === 0 && !loading && (
  <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center">
    <p className="text-sm italic text-white/40">
      No hay datos para el período seleccionado.
    </p>
  </div>
)}

{/* Error de API */}
{error && (
  <div className="rounded-xl border border-red-400/60 bg-red-500/20 p-3 text-sm text-red-100">
    {error}
  </div>
)}

{/* Sin remisiones (dominio específico) */}
{!hasApplied && !loading && (
  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs italic text-white/40">
    Sin remisiones de biochar aplicado en este período.
  </div>
)}

{/* Loading full-page */}
{loading && (
  <div className="flex min-h-[300px] items-center justify-center">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/60" />
  </div>
)}
```

---

## ✅ 13. Checklist de Implementación

Antes de entregar un nuevo componente, verificar:

1. [ ] **Números en `text-3xl font-bold`** — mínimo `text-2xl` para valores secundarios
2. [ ] Cards con `rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md`
3. [ ] Labels en `UPPERCASE` con `tracking-[0.14em]` y `text-white/80`
4. [ ] Colores semánticos correctos: verde = éxito, rojo = error, amber = advertencia
5. [ ] Signos visibles en cascadas: badges `(+)` verde, `(−)` rojo, `(=)` coloreado
6. [ ] Hover en cards interactivas: `whileHover scale: 1.02` o `hover:scale-105`
7. [ ] Animación de entrada: `fadeInUp` para secciones, `staggerChildren` para listas
8. [ ] Tooltip de gráfica: `background: 'rgba(12,17,24,0.92)'` + borde `rgba(255,255,255,0.2)`
9. [ ] Textos secundarios con opacidad correcta (`/70`, `/50`, `/40`)
10. [ ] Responsive: nunca columnas hardcoded — siempre `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`
11. [ ] Números con `formatTon()` en locale `es-CO` (no `.toFixed()` directo)
12. [ ] Columna "por tonelada" `hidden sm:block` en tablas de dos columnas
13. [ ] Sub-filas indentadas con `border-l-2 border-white/10 pl-3 ml-7`
14. [ ] Loading state con `animate-pulse` o spinner — nunca dejar pantalla en blanco
15. [ ] Estado vacío y estado de error siempre manejados explícitamente

---

## 💻 14. Ejemplo Completo de Card (listo para copiar)

```tsx
"use client";
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

function formatTon(value: number, maxDigits = 3): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: maxDigits });
}

const cardItem = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

const cardContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

interface MetricCardProps {
  label:      string;
  value:      number;
  unit:       string;
  color:      string;
  percentage?: number;
  trend?:     'up' | 'down';
  enabled?:   boolean;
}

function MetricCard({ label, value, unit, color, percentage, trend, enabled = true }: MetricCardProps) {
  return (
    <motion.article
      variants={cardItem}
      whileHover={{ scale: 1.02, transition: { type: 'spring', stiffness: 260, damping: 20 } }}
      className="rounded-2xl border bg-white/10 p-4 backdrop-blur-sm"
      style={{ borderColor: `${color}AA`, opacity: enabled ? 1 : 0.55 }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color }}>{label}</p>
        {trend === 'up'   && <TrendingUp   className="h-4 w-4 text-emerald-400" />}
        {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-400" />}
      </div>

      <div className="mt-2 text-3xl font-bold text-white">
        {formatTon(value)}
        <span className="ml-1 text-sm font-normal text-white/65">{unit}</span>
      </div>

      {percentage !== undefined && (
        <p className="mt-1 text-sm text-white/70">{formatTon(percentage, 1)}% del total</p>
      )}
    </motion.article>
  );
}

// Uso en una sección completa:
export default function MetricsSection({ cards }: { cards: MetricCardProps[] }) {
  return (
    <motion.section
      variants={cardContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </motion.section>
  );
}
```

---

*Generado desde análisis exhaustivo del codebase — Sirius Pirolisis.*  
*Actualizar cuando se introduzcan nuevos patrones visuales.*
