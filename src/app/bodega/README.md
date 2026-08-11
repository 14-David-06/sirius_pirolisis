# 🏬 Bodega — materias primas del Biochar Blend

Inventario de las **tres materias primas** que entran a la producción de Biochar
Blend: **bioabono**, **biochar puro** y **biológicos**.

No es un segundo inventario de insumos. La separación por módulo es deliberada:

| Módulo | Qué controla |
|---|---|
| `/bodega` | Materias primas del Blend (bioabono, biochar, biológicos) |
| `/inventario-pirolisis` | Insumos consumibles del área (lonas, químicos, EPP…) |
| `/activos-fijos` | Herramientas y equipos |

## Estructura

```
src/app/bodega/
├── page.tsx                        # Orquestador de la página
└── README.md                       # Este documento

src/app/api/bodega/
├── materias-primas/route.ts        # GET stock + capacidad de producción
└── movimientos/route.ts            # GET últimos movimientos (Core)

src/components/bodega/
├── index.ts                        # Barrel export
├── Icons.tsx                       # Iconos propios del módulo
├── CapacidadProduccionCard.tsx     # Cuántos kg de Blend alcanzan
├── MateriaPrimaCard.tsx            # Tarjeta por materia prima
├── BachesBiocharTable.tsx          # Biochar disponible bache por bache
├── MovimientosTable.tsx            # Entradas y salidas recientes
└── EntradaMateriaPrimaForm.tsx     # Registrar entrada (única acción manual)

src/lib/bodega.constants.ts         # Registro de materias primas y umbrales
src/lib/useBodega.ts                # Hook de datos
src/types/bodega.ts                 # Contrato API ↔ UI
```

## Una sola fuente: Sirius Insumos Core

| Materia prima | Unidad | Fuente del stock | Entrada manual |
|---|---|---|---|
| Bioabono (Abono 4G) | kg | `Stock Insumos` de Sirius Insumos Core (`SIRIUS-INS-0064`) | Sí |
| Biológicos (DataLab) | L | `Stock Insumos` de Sirius Insumos Core (`SIRIUS-INS-0065`) | Sí |
| Biochar puro | kg | `resolverBiocharDisponible()` → Core (`SIRIUS-INS-0067`), baches de respaldo | **No** |

El biochar es de solo lectura en la bodega: entra al inventario al registrar
producción en `/sistema-baches` y sale al producir Blend o por una salida de bache,
no digitando una cantidad. Conserva el desglose **bache por bache**, reconstruido
del libro mayor del Core (`ID Bache Origen` de cada movimiento).

Su saldo pasa por `resolverBiocharDisponible()` (`src/lib/baches-biochar.ts`), que
es donde vive —y solo ahí— la decisión "manda el Core, la tabla de baches es el
respaldo", y que expone la `divergencia` entre las dos vistas. Esta ruta era el
último consumidor que leía el saldo por su cuenta, y ese atajo hacía que un fallo
del Core dejara la bodega en 0 kg mientras la agenda mostraba el total de los
baches: una pantalla diciendo "no alcanza" y la otra "está cubierto" con el mismo
inventario detrás.

Si una lectura falla, las otras se siguen mostrando: el endpoint las hace con
`Promise.allSettled` y devuelve el problema en `advertencias`, que la página muestra
como un aviso. Una bodega a medias es más útil que un error en pantalla.

## Capacidad de producción

La lectura principal del módulo no es "cuánto hay de cada cosa" sino **cuántos kg
de Blend se pueden producir sin comprar nada**:

```
kgBlendPosibles(materia) = floor(stock / pctBlend)
capacidad               = min(kgBlendPosibles) sobre las tres materias primas
limitante               = la materia prima que produjo ese mínimo
```

La cuenta vive en `calcularCapacidadBlend()` (`src/lib/bodega.constants.ts`), no en
el endpoint, porque **/calendario-blend muestra la misma conclusión**. Cubierta por
`src/lib/__tests__/lib/capacidadBlend.test.ts`.

Las proporciones vienen de `config.blend` (env vars `BLEND_PCT_*`), las **mismas**
que usan `verificar-stock-blend` y la auto-deducción de `src/lib/blend-deduction.ts`.
No se duplican aquí para que no puedan divergir. El agua (`pctAgua`) no se
inventaría: se registra en el turno.

## Contra qué se lee la capacidad

Capacidad sin compromiso no dice si alcanza. La tarjeta muestra también los kg
comprometidos con clientes, tomados de `/api/pirolisis/blend/agenda` (`useAgendaBlend`)
en vez de recalcular la cobertura aquí: es la misma regla acumulada de
`src/lib/agenda-blend.ts`, y duplicarla es exactamente cómo las dos pantallas
empezarían a decir cosas distintas. Se carga en su propio hook, así que la bodega se
pinta completa aunque la agenda tarde o falle.

> ⚠️ Los porcentajes se calculan **en el servidor** y viajan en la respuesta. Las
> env vars `BLEND_PCT_*` no existen en el cliente: si la UI los recalculara,
> obtendría los valores por defecto en silencio.

## Stock mínimo

El umbral de reposición de cada materia prima es, en orden de prioridad:

1. `Stock Minimo` del insumo en Sirius Insumos Core, si está definido.
2. Lo que consume **un lote de Blend de referencia** (`BODEGA_LOTE_BLEND_REFERENCIA_KG`,
   1.000 kg por defecto): 740 kg de bioabono, 200 kg de biochar y 7 L de biológicos.

Se prefiere derivarlo de la fórmula antes que inventar un número por materia
prima: el umbral significa "tengo bodega para producir al menos un lote".

## Movimientos: solo entradas a mano

La **única acción manual** de la bodega es registrar una entrada. Reutiliza los
endpoints que ya alimentan la producción de Blend:

- `POST /api/pirolisis/inventario/entrada-abono4g`
- `POST /api/pirolisis/inventario/entrada-biologicos`

Así una entrada hecha desde la bodega es indistinguible de una hecha desde otro
punto del sistema, y el stock que verifica la producción es el mismo.

**No hay formulario de salida** (2026-07-29). Las salidas se generan solas:

| Salida | Quién la registra |
|---|---|
| Consumo de bioabono y biológicos | `src/lib/blend-deduction.ts` al confirmar una producción de Blend |
| Consumo de biochar | Remisión de baches (`Detalle Cantidades Remision Pirolisis`) |

Ofrecer además una salida manual invitaba a descontar dos veces el mismo consumo.
Tampoco hay botón para ingresar biochar: entra al inventario al registrar
producción en `/sistema-baches`.

Si algún día hace falta registrar una pérdida o un ajuste de conteo, el camino ya
existe: `POST /api/inventario/remove-quantity` con `tipo_uso` `dano_o_perdida` o
`ajuste_inventario` (nunca `balance_de_masa`, que es lo que descuenta la
producción).

## Nombres de campo en Airtable

`GET /api/bodega/movimientos` lee `Movimientos Insumos` por **nombre** de campo
(Airtable indexa `fields` por nombre, no por field ID, salvo que se pida lo
contrario). Dos nombres reales que parecen erratas y no lo son:

- `"Cantidad "` — con espacio al final.
- `"Name"` — es el campo de notas del movimiento.

Ambos están verificados contra el schema de la base y documentados en el propio
endpoint. El match del insumo se hace **en JS sobre los record IDs**: en una
fórmula de Airtable un campo link se evalúa como el texto del campo primario del
registro vinculado, así que `filterByFormula` no puede comparar contra un `recXXX`
(ver `src/lib/stock-insumos.ts`).

## Variables de entorno

Todas existían ya, salvo la última:

```
AIRTABLE_GLOBAL_TOKEN
AIRTABLE_INSUMOS_CORE_BASE_ID
AIRTABLE_INSUMOS_TABLE_ID
AIRTABLE_STOCK_INSUMOS_TABLE_ID
AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID
AIRTABLE_BLEND_ABONO_4G_RECORD_ID
AIRTABLE_BLEND_BIOLOGICOS_RECORD_ID
AIRTABLE_BASE_ID / AIRTABLE_TOKEN / AIRTABLE_BACHES_TABLE_ID
BLEND_PCT_BIOCHAR / BLEND_PCT_ABONO / BLEND_PCT_BIOLOGICOS / BLEND_PCT_AGUA
BODEGA_LOTE_BLEND_REFERENCIA_KG   # opcional, default 1000
```

---

**Última actualización**: 2026-07-29
