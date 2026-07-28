# Inventario de Activos Fijos

Gestión de los bienes que **se asignan y se devuelven** (herramientas, equipos,
vehículos, tecnología, infraestructura), a diferencia de
[`/inventario-pirolisis`](../inventario-pirolisis/README.md), que gestiona los
insumos que **se consumen**.

Base de datos: **Sirius Activos Core** (Airtable, multi-área para toda la empresa).

---

## Estructura

```
src/
├── app/
│   ├── activos-fijos/page.tsx          # Orquestador de la página
│   └── api/activos/
│       ├── list/                       # GET  — parque completo, links resueltos
│       ├── create/                     # POST — alta
│       ├── update/[id]/                # PATCH— edición parcial
│       ├── delete/[id]/                # DELETE/POST — baja lógica
│       ├── asignar/                    # POST — entrega a un responsable
│       ├── devolver/                   # POST — cierre de la asignación
│       ├── disponibles/                # GET  — subconjunto entregable
│       ├── estadisticas/               # GET  — agregados (tableros externos)
│       ├── asignaciones/list/          # GET  — historial de entregas
│       ├── tipos-activo/list/          # GET  — catálogo de tipos
│       └── ubicaciones/list/           # GET  — catálogo de ubicaciones
├── components/activos/
│   ├── index.ts                        # Barrel export
│   ├── Icons.tsx                       # Iconos SVG del módulo
│   ├── FormFields.tsx                  # Campo / Input / Select / Seccion…
│   ├── EstadisticasActivos.tsx         # Fila de indicadores
│   ├── AlertasActivos.tsx              # Lista priorizada de pendientes
│   ├── ActivosTable.tsx                # Listado: filtros + tabla/tarjetas
│   ├── ActivoCard.tsx                  # Tarjeta (vista móvil)
│   ├── DetalleActivoModal.tsx          # Detalle + cambio rápido de estado
│   ├── ActivoForm.tsx                  # Alta Y edición
│   ├── AsignarActivoForm.tsx           # Entrega
│   ├── DevolverActivoForm.tsx          # Devolución
│   ├── BajaActivoForm.tsx              # Baja lógica
│   ├── TipoActivoSelector.tsx          # Catálogo de tipos (múltiple)
│   └── UbicacionSelector.tsx           # Catálogo de ubicaciones
├── lib/
│   ├── useActivos.ts                   # Hook: estado, filtros y derivados
│   ├── activos.client.ts               # Cliente CRUD (lo usan los formularios)
│   ├── activos.server.ts               # Airtable: paginación, catálogos, normalización
│   ├── activos.payload.ts              # Traducción nombre→field ID + validación
│   ├── activos.format.ts               # Formato y colores por estado
│   ├── activos.constants.ts            # Opciones de UI (client-safe)
│   └── activos.fields.ts               # Field IDs (server-only, desde el entorno)
└── types/activos.ts                    # Tipos del módulo
```

## Flujo de datos

```
/api/activos/list  (normaliza: resuelve tipos y ubicaciones a nombres)
        ↓ records
useActivos  (una sola carga; filtros, agrupación y KPIs en memoria)
        ↓ data + getters
page.tsx  (orquestador: estado de filtros y modales)
        ↓ props específicas
Componentes de presentación
```

**Una sola petición.** El endpoint devuelve el parque completo y todo el
filtrado ocurre en memoria: cambiar un filtro es instantáneo y no consulta
Airtable. Los indicadores se calculan sobre esos mismos registros, así que la
página nunca puede contradecirse consigo misma.

## Ciclo de vida de un activo

1. **Alta** → `ActivoForm` → `POST /api/activos/create`
   Exige nombre, tipo y ubicación: sin tipo el activo no hereda categoría ni
   vida útil, y sin ubicación no se puede encontrar.
2. **Edición** → `ActivoForm` (modo edición) → `PATCH /api/activos/update/[id]`
   Envía solo los campos modificados.
3. **Asignación** → `AsignarActivoForm` → `POST /api/activos/asignar`
   Crea el registro en *Asignaciones* y marca el responsable en el activo. Si lo
   segundo falla, la asignación se anula (operación compensatoria).
4. **Devolución** → `DevolverActivoForm` → `POST /api/activos/devolver`
   Cierra la asignación abierta del activo y libera el responsable. Si la
   condición de retorno es «Necesita Reparación» o «Dañada», el activo pasa a
   *En Mantenimiento*.
5. **Baja** → `BajaActivoForm` → `DELETE /api/activos/delete/[id]`
   Baja **lógica**: estado *Dado de Baja* + motivo fechado en las notas. Un
   activo es un bien contable; su historial tiene que sobrevivir al retiro.
   Reversible con «Reactivar» desde el detalle.

## Decisiones que conviene conocer

### Los field IDs sirven para escribir, no para leer
Airtable devuelve las claves de `fields` con el **nombre** del campo salvo que se
pida `returnFieldsByFieldId=true`. Toda guarda que lea un registro antes de
mutarlo debe usar `getActivoRaw()` / `getAsignacionRaw()` de `activos.server.ts`,
que ya envían ese parámetro. Leer `fields[FIELD_ID]` sin él devuelve
`undefined` **siempre**, y una guarda que compara contra `undefined` no protege
nada.

### Campos que no existen en la base
`Código Interno`, `Foto del Activo` (Activos Fijos) y `Evidencia Asignación`
(Asignaciones) **no existen**. Incluirlos en una escritura hace que Airtable
rechace el registro completo con `UNKNOWN_FIELD_NAME`. Están documentados como
"no configurar" en `.env.example`.

### Las categorías las manda el dato, no el código
`Categoría` es un *lookup* del catálogo de tipos, que a su vez es texto libre.
Hoy conviven nombres ("Herramienta", "Tecnología") con códigos ("CAT-PIR",
"CAT-EMG"). Por eso el filtro de categorías se construye desde los registros
cargados y no desde una lista fija; `CATEGORIAS_ACTIVO` solo aporta descripciones.

### `aiText` llega como objeto
La `Descripción` del catálogo de tipos es un campo `aiText`: Airtable lo
serializa como `{ state, value, isStale }`. La API lo aplana. Ese objeto fue el
origen de tres componentes "wrapper" que clonaban props con
`JSON.parse(JSON.stringify(...))` creyendo que era un artefacto de React 19.

### Un activo incompleto es un pendiente, no una categoría
Los activos sin tipo ni ubicación se agrupan en «Sin clasificar», que se ordena
siempre al final, y la página muestra cuántos hay con un acceso directo a
completarlos. No se pueden asignar por accidente ni contaminan los reportes por
categoría.

## Cómo extender el módulo

1. **Tipos** en `src/types/activos.ts`
2. **Constantes de UI** en `src/lib/activos.constants.ts` (nunca IDs de Airtable)
3. **Field ID** en `src/lib/activos.fields.ts` + variable en `.env.example`
4. **Lectura/normalización** en `src/lib/activos.server.ts`
5. **Getter** en `src/lib/useActivos.ts`
6. **Componente** en `src/components/activos/` y export en `index.ts`
7. **Uso** en `page.tsx`

### Añadir un campo editable
Basta agregarlo a `CAMPOS_TEXTO` / `CAMPOS_FECHA` en `activos.payload.ts` y al
formulario: `create` y `update` lo recogen automáticamente porque comparten el
mismo constructor de payload.

## Pendientes conocidos

- **Hoja de Vida Activo**: la tabla existe y el detalle ya muestra el conteo de
  eventos, pero no hay UI para registrarlos. Requiere añadir los field IDs de esa
  tabla al entorno.
- **Historial de asignaciones por activo**: `useAsignaciones(activoId)` ya lo
  resuelve; falta mostrarlo dentro del detalle.
- **Datos heredados**: los 37 activos actuales solo tienen nombre y estado. El
  banner «sin clasificar» y el formulario de edición existen precisamente para
  cerrar esa brecha.

## Tests

```
src/__tests__/hooks/useActivos.test.ts               # 14 casos
src/__tests__/components/activos/ActivoForm.test.tsx # 11 casos
src/__tests__/lib/activos.format.test.ts             # 14 casos
```

```bash
npx jest src/__tests__/hooks/useActivos.test.ts src/__tests__/components/activos src/__tests__/lib
```
