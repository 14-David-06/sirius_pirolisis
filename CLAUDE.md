# PiroliApp — Convenciones y arquitectura

Planta de pirólisis de Sirius Regenerative. Next.js 15 (App Router) + Airtable.

---

## 1. Arquitectura federada: bases Core

Las entidades transversales NO viven en la base local. Cada una tiene su base Core,
compartida con las otras apps del ecosistema Sirius (el laboratorio DataLab usa las
mismas). PiroliApp es un consumidor, no el dueño.

| Config (`src/lib/config.ts`) | Base | Rol |
|---|---|---|
| `airtable.baseId` | **PiroliApp** | Dominio propio de pirólisis: turnos, baches, balances de masa, bitácora, residuos |
| `insumosCore*` | **Sirius Insumos Core** | Insumos, movimientos y stock: abono 4G y biológicos |
| `pedidosCore*` | **Sirius Pedidos Core** | Pedidos y detalles de cliente |
| `remisionesCore*` | **Sirius Remisiones Core** | Remisiones, productos remitidos, personas |
| `inventarioProdCore*` | **Sirius Inventario Production Core** | Libro mayor de producto terminado: Biochar Blend **y Biochar Puro** |
| `productsBaseId` | **Sirius Product Core** | Catálogo. Biochar Blend = `SIRIUS-PRODUCT-0016`, Biochar Puro = `SIRIUS-PRODUCT-0015` |
| `clientesBaseId` | **Sirius Clients Core** | Clientes y su personal |
| `nominaCore*` | **Sirius Nomina Core** | Personal (solo login) |
| `novedadesNomina*` | **Sirius Novedades Nomina** | Permisos, vacaciones y novedades — los escribe `@sirius/solicitudes` (§6) |

### Regla de oro: FK simbólicas, nunca linked records entre bases

Airtable **no permite** links entre bases. Todo cruce se hace con códigos de texto
legibles:

```
SIRIUS-PED-0059     → pedido            SIRIUS-PRODUCT-0016 → producto
SIRIUS-REM-0116     → remisión          SIRIUS-PRODUCT-0015 → biochar puro
CL-0003             → cliente           SIRIUS-AREA-0009    → área
PER-REM-0001        → persona           S-00167             → bache (PiroliApp)
BLEND-2026-06-24    → lote de producción de Blend
```

Los identificadores de Airtable (`recXXX`) **no son intercambiables** entre bases.
Las APIs deben aceptar las dos formas y resolver:

```ts
import { esRecordId } from '@/lib/airtable-escape';

if (esRecordId(id)) { /* GET /base/tabla/{id} */ }
else { /* filterByFormula: {ID} = '<código>' */ }
```

---

## 2. `escapeAirtableValue` es OBLIGATORIO

Una `filterByFormula` se arma concatenando texto: un valor sin escapar es inyección
de fórmula. **Nunca** interpolar directo.

```ts
import { escapeAirtableValue } from '@/lib/airtable-escape';

// ✅
filterByFormula: `{Cedula} = '${escapeAirtableValue(cedula)}'`

// ❌ — y no basta con .replace(/'/g, "\\'"): no escapa la barra invertida
filterByFormula: `{Cedula} = '${cedula}'`
```

Crítico en cualquier endpoint **público y sin autenticar**. La firma pública de
remisiones se eliminó el 2026-10-02, pero desde el 2026-10-21 hay tres a propósito:
`/api/recibir/{consultar,identificar,confirmar}`, la recepción de remisiones por
enlace (§5). Los protege un token HMAC que se verifica —formato, firma con
`timingSafeEqual`, vencimiento— **antes de tocar Airtable**; un token malo, una
remisión inexistente y una ajena responden el mismo 404, para que quien no tiene
un enlace auténtico no aprenda nada. Detrás de eso siguen valiendo las mismas
reglas: la cédula se normaliza (`normalizarCedula()`) y se compara en JS, no en
una fórmula, y todo valor que sí se interpola va con `escapeAirtableValue`. Tienen
además límite de intentos por IP y por enlace (`atenderPublica()` en
`recepcion/recepcion.ts`).

Para códigos que vienen de la URL, además validar el formato con
`assertCodigoSimbolico()`: si no parece un código, rechazar en vez de consultar.

---

## 3. Trampas de Airtable ya pagadas

Cada una de estas costó un bug en producción. Están documentadas en el código donde
importan; aquí queda el índice.

**La API devuelve `fields` indexado por NOMBRE**, no por field ID, salvo que se pida
`returnFieldsByFieldId=true`. Leer `fields[config...algoFieldId]` contra una
respuesta por nombre da siempre `undefined`. Ver `src/lib/stock-insumos.ts`.

**En una fórmula, un campo link se evalúa como el texto del campo primario** del
registro vinculado, no como su record ID. `SEARCH("recXXX", {Link})` no funciona: el
match va en JS sobre los record IDs reales.

**El PATCH de un campo link REEMPLAZA el array.** Hay que releer y concatenar, o se
borra el histórico. Es como se destruyó una vez el `stock_actual` (que es
`SUM(entradas) − SUM(salidas)` sobre los movimientos vinculados). Ver
`appendMovimientoToStock()` y `vincularPersonas()`.

**Los campos link huérfanos se degradan a texto.** Al borrar una tabla, Airtable
convierte a `singleLineText` los links que la apuntaban. Enviarles un array devuelve
422 y **tumba el PATCH completo**, perdiendo también los campos que sí eran válidos.

**Los `singleSelect` rechazan valores fuera de sus opciones.** Mandar `'N/A'` a un
select que no lo tiene es un 422. Verificar las opciones antes de escribir.

**Las fórmulas pueden devolver `{ specialValue: 'NaN' }`**, no un número. Normalizar
siempre con un `toNumber()` que lo tolere.

**Las fórmulas admiten negativos.** Un bache puede quedar con stock negativo si se
le descontó más de lo que tenía (pasó con S-00177: −0,18 kg, cerrado el 2026-08-21 con
`scripts/reparar-biochar-bodega.mjs`).

**Rate limit: 5 req/s por base.** Evitar cascadas N+1; preferir una lectura completa
y el cruce en JS sobre N lecturas por registro.

---

## 4. No hay transacciones: `StepResult` + 207

Una operación que toca 3 o 4 bases no puede ser atómica. El patrón NO es fallar en
silencio con un `console.warn`, que deja estados inconsistentes invisibles.

Cada paso devuelve un `StepResult` (`{ step, ok, skipped?, detail?, error? }`). Los
pasos **críticos** hacen fallar la operación (y revierten lo que puedan); los
**best-effort** se reportan y elevan la respuesta a **207 Multi-Status** con el
array de `steps`, para que el operador vea qué quedó a medias.

Ver `crearRemision()` en `src/lib/blend-remisiones-core.ts`. El tipo vive en
`src/types/step-result.ts`.

**Idempotencia:** toda escritura repetible necesita una llave de deduplicación.
Se usa `documento_referencia` en los movimientos de inventario y marcas en texto
(`[lote:…]`, `RECONSTRUCCION-HISTORICA:…`) donde no hay campo dedicado.

---

## 5. Biochar Blend: el modelo por lote

La producción de Blend **no es una fila en una tabla**. Es un conjunto de movimientos
en los Core unidos por un **código de lote** `BLEND-…`.

```
iniciar-produccion  →  lote BLEND-<fecha>-<pedido>
                       │
   ┌───────────────────┴──────────────────┬────────────────────────┐
   │                                      │                        │
Inventario Prod. Core                Insumos Core             PiroliApp
Salida de Biochar Puro por bache     Salida de abono 4G       Detalle Cantidades
  bache_origen_id = S-00XXX          y de biológicos          ID Produccion Blend
  produccion_destino_id = lote                                  = lote
Entrada de Biochar Blend                                      + Estado Bache
  documento_referencia = lote                                   → Agotado
```

**Composición, CO₂ y baches NO se guardan: se derivan del lote.** Guardarlos sería
duplicar un dato que puede divergir. Ver `composicionDeDespacho()` y
`getBachesDeLote()`.

**El biochar puro es un PRODUCTO, no un insumo (2026-08-21).** Del 2026-07-29 al
2026-08-21 vivió en Sirius Insumos Core como `Biochar Puro` (SIRIUS-INS-0067), al
lado del abono 4G y de los biológicos. Estaba en el sitio equivocado: un insumo es
algo que el área COMPRA, y el biochar es lo que la planta PRODUCE. Como insumo, el
inventario de producto terminado del ecosistema no sabía nada del biochar puro —solo
veía el Blend— mientras el de insumos cargaba un renglón que ninguna otra app podía
interpretar.

Hoy es **`SIRIUS-PRODUCT-0015`** en Sirius Inventario Production Core, la misma base
donde ya vivía el Blend que alimenta, así que producir es lo que siempre fue: una
Salida de un producto y una Entrada de otro, en un solo libro mayor. Todo el acceso
pasa por `src/lib/biochar-inventario-core.ts`. El insumo viejo quedó en `Inactivo`
con un asiento de cierre y su histórico intacto; `blendBiocharInsumoRecordId` sigue
en `config.ts` **solo** para el script de migración y un eventual rollback.

Esa base **no traía trazabilidad por bache**, así que la migración le agregó a
`Movimientos_Inventario` los dos campos que la sostienen: `bache_origen_id` (el
`Codigo Bache`) y `produccion_destino_id` (el lote `BLEND-…`, o la referencia `SAL-…`
de una salida que no es producción). Sin ellos se pierde "de qué bache salió cada kg"
y "a qué lote fue", que es lo que sostiene la contabilidad de carbono. No se
reciclaron los campos existentes: `ubicacion_origen_id` significa ubicación y
`documento_referencia` ya es la llave de idempotencia.

⚠️ **Esa base se accede por NOMBRE de campo, no por field ID**, a diferencia de
Insumos Core, donde `config.ts` guarda field IDs. Mezclar las dos convenciones es
como se llega a leer `fields[fieldId]` contra una respuesta indexada por nombre y
obtener siempre `undefined`.

⚠️ **Un movimiento sin vincular a `Stock_Actual` es invisible para el saldo.** Esa
fila es una fórmula sobre los movimientos VINCULADOS por el campo link, así que se
vincula en el POST del movimiento (un PATCH posterior reemplazaría el array). Así fue
como la fila del Blend se quedó en 0 kg teniendo 15.528 kg de entradas.

**El biochar se escribe en DOS vistas a propósito.** El Core es el libro mayor
("cuánto hay y a dónde fue"); la fórmula del bache responde "cuánto queda de ESTE
bache", que es lo que necesita la UI de selección al producir. Cada consumo se
escribe una vez en cada vista con el mismo número.
**Todo consumidor de "biochar en stock" debe pasar por `resolverBiocharDisponible()`**
(`src/lib/baches-biochar.ts`), que decide la fuente y expone la `divergencia` entre
las dos. Si una pantalla elige su fuente, bodega y producción se contradicen.

**La tabla de baches es un HISTORIAL.** Los baches no se borran: cambian de
`Estado Bache` a `Bache Incompleto` o `Bache Agotado` al vaciarse
(`estadoTrasConsumo()`).

**Y desde el 2026-08-28 ese historial arranca en S-00083.** Los 61 baches de la era
V2 (S-00083…S-00143, del 2025-04-26 al 2025-10-10) vivían en la base **PiroliApp
V 1.0**, la que usó la planta antes de esta app. Los trajo
`scripts/migrar-baches-v2.mjs`, y el consecutivo S-00083…S-00279 quedó continuo.

Traerlos no fue copiar filas, porque **`Codigo Bache` es una fórmula anclada al
autonumber**, y el autonumber no se puede fijar ni reciclar. La fórmula que quedó
es la del offset original de la era V2, sin excepciones:

```
CONCATENATE("S-", RIGHT("00000" & (83 + {Auto Number} - 1), 5))
```

Cuadra porque al **recrear el campo autonumber, Airtable lo reasigna por el orden
de las filas**, y los migrados quedaron de 1 a 61 (→ S-00083…S-00143) y los que ya
existían de 62 a 197 (→ S-00144…S-00279). El próximo bache toma el 198 y sale
S-00280. La Meta API no edita campos calculados: ese paso fue a mano en la UI.

⚠️ **La fórmula ya no mira `Codigo Bache Historico`.** Ese campo sobrevive como
respaldo del código original y como rastro de la migración, pero el código lo manda
el autonumber. Consecuencia: **una segunda importación de histórico saldría con
códigos corridos** (la era V1, S-00063…S-00082, tomaría 198+ → S-00280+). Si se
trae, hay que reasignar el autonumber otra vez —recrear el campo con las filas en
orden de código— y bajar el offset de 83 a 63, no parchear la fórmula con
excepciones.

Cambiar en vez de eso el offset de 144 a 83 habría renumerado los 136 baches vivos
(S-00144 → S-00083) y roto **en silencio** todas las FK simbólicas del ecosistema:
`bache_origen_id` en Inventario Production Core, remisiones, `Detalle Cantidades`,
certificados. Nada habría fallado con error; todo habría apuntado a otro bache.

Tres decisiones más que sostienen la convivencia en una sola tabla:

**Los migrados entran con 0 kg disponibles, a propósito.** El saldo es
`SUM(Masa Seca from Monitoreo Baches) − SUM(salidas)`, una fórmula sobre filas
VINCULADAS de monitoreo, y no se les crea ninguna. Ese biochar se consumió en 2025
y no está en los kg conciliados de hoy. La masa seca real (29.855 kg) vive en
`Masa Seca Historica (KG)`, que no alimenta ninguna fórmula de inventario.

**Todo lector que OPERE con la tabla completa los excluye por `Origen Registro`**
(`FILTRO_SIN_MIGRADOS` en `src/lib/baches-biochar.ts`): `fetchBachesConBiochar()`,
`/api/baches/list` y `/api/baches/masa-seca-total`. Depender de que un histórico dé
0 kg es depender de que nadie le vincule nunca un monitoreo — y el día que alguien
lo haga, aparecerían como biochar disponible para producir Blend. En
`masa-seca-total` además el rango se evalúa sobre `Fecha Creacion`, que en ellos es
el día de la migración: sin el filtro sumarían 61 baches al conteo con 0 kg, un
descuadre invisible. La fecha real está en `Fecha Historica`.

La excepción deliberada es **`fetchBachesNoDisponibles()`, que sí los incluye**,
porque su trabajo es EXPLICAR una ausencia, no operar. El selector de bache pinta
en gris —con el motivo— todo lo que existe pero no tiene biochar que sacar:
consumido, todavía en planta, sin monitoreo, o histórico de la app anterior. Las
cuatro razones se veían igual desde afuera (el código no aparecía) y la pantalla
respondía «ningún bache coincide», que además es falso: el bache existe, lo que no
tiene es biochar. Un operador con una lona de 2025 en la mano merece esa respuesta.

**`Estado Bache` va en `Bache Agotado` para los 61** y el original queda en
`Estado Bache V2`: `Bache Pesado` —que traen 18— no es opción del singleSelect de
hoy, y un 422 tumba el PATCH completo. La trazabilidad de salida de la era (11
ventas, 2 lotes de Blend) se aplanó a texto en `Salidas Historicas` en vez de
resucitar las tablas `Venta Biochar` y `Biochar Blend Pirolisis`, que ya se
reemplazaron por el modelo por lote de los Core.

**La salida de un bache SIN producir ya no tiene camino en la app (2026-08-21).**
`runSalidaBache()` y `/api/baches/salida` se eliminaron con la depuración de §8. La
regla de fondo sigue viva por si se reconstruye: una salida honesta escribe TRES
partes —el detalle que baja la fórmula del bache, la `Salida` de `Biochar Puro` en
Inventario Production Core y el `Estado Bache`—, con llave `SAL-<MOTIVO>-<fecha>-<bache>`
verificada lado por lado para que un reintento COMPLETE la mitad que falte en vez de
duplicarla. La UI de remisión de baches (`/api/remisiones-baches`) escribe SOLO el
detalle: usarla para esto infla el stock del Core y deja el bache en "Completo Bodega"
con 0 kg.

**Las actas de entrega de biochar se eliminaron (2026-08-21).** Documentaban las
entregas sin contraprestación (investigación, ensayo, piloto, donación) que exige el
numeral 5.4.2 de la Puro Biochar Methodology, y vivían en PiroliApp —no en un Core—
porque no son documentos comerciales. Si vuelven, esa separación es la decisión a
respetar: receptores en tabla propia, no clientes de Clients Core.

**El acta volvió en versión mínima (2026-09-28): es la salida `entrega`, no un
módulo.** Sin tabla de actas ni firma en vivo. `/api/baches/salida` con motivo
`entrega` EXIGE el receptor (nombre y cédula; vehículo, color y placa opcionales) y
lo escribe en la misma remisión de `Remisiones Baches Pirolisis` que registra la
salida —en el POST, no en un PATCH aparte—. El PDF (`/api/baches/salida/acta`,
con sesión) se ARMA de esa fila cada vez: no hay copia archivada que pueda
contradecir a la base. Lleva el banner del compromiso de no quemar el biochar y
llevarlo al suelo (`COMPROMISO_ENTREGA_BIOCHAR`, el mismo texto que muestra el
formulario) y se firma en papel. El vehículo se guarda pero NO se imprime
(decisión de David). Las salidas `SAL-ENT-…` ya registradas se
completan desde el botón `Acta` de los movimientos del biochar. Ver
`acta-entrega-biochar.ts`.

**La salida se pide como TOTAL, no por bache (2026-10-20).** El operador digita
los kg y `runSalidaBiochar()` los reparte FIFO (`repartirSalidaFIFO()`): cada kg
sigue saliendo de un bache con su referencia, nunca de un "total suelto". El
ensayo elige el reparto y la confirmación lo reenvía tal cual —recalcularlo
caería en otros baches porque el saldo ya bajó—. Una segunda salida del mismo
motivo el mismo día lleva `SAL-<M>-<fecha>-<n>-<bache>` (`referenciaBaseLibre()`)
para no leerse como reintento. Se valida contra el saldo del **Core** (peso de
referencia), igual que la producción: la fórmula seca rechazaba baches que la
bodega mostraba con saldo (S-00165: 89,77 kg en el Core, 0 en la fórmula).

**El Blend también se saca sin venta (2026-10-20).** `Sacar Blend` en la bodega
→ `runSalidaBlend()` (`salida-blend.ts`): el total se reparte FIFO por **lote**
(orden de `lotesDisponiblesBlend()`, por fecha), pero se escribe UNA sola Salida
aunque cubra varios lotes (decisión de David): `documento_referencia` =
`produccion_destino_id` = `SAL-<M>-<fecha>[-<n>]`, y el reparto va en las
observaciones con las marcas de la remisión multilote (`[lote:…]`
`[kg-lote:<lote>=<kg>]`), que `lotesDisponiblesBlend()` lee para descontar a
cada lote lo suyo. Es el único camino de salida del Blend que no es una remisión. Sin motivo `entrega` (`MOTIVOS_SALIDA_BLEND`): el acta guarda quién
recibe en PiroliApp atada a un bache, y el Blend solo vive en el Core.

**Todo el biochar se maneja en MASA SECA** (decisión de David, 2026-08-05). El acta
física deja abierta la casilla húmeda/seca, pero la app no: no hay selector ni
conversión, los KG que se digitan son secos y `Base Cantidad` siempre se escribe
`Seca`. Ofrecer las dos bases invitaba a digitar el peso de la balanza contra un
inventario que se lleva en seco, y eso deja el bache con biochar que no existe. La
humedad del lote se guarda porque la sección 2 del acta la pide, pero no participa en
ningún cálculo. No reintroducir una ruta de masa húmeda.

**Producir se hace desde `/inventario-bodega-sirius` (2026-08-24).** El botón
`Producción` de la tarjeta del Blend abre el formulario, y `runProduccionBlend()`
(`src/lib/produccion-blend.ts`) escribe las cinco partes del lote: un detalle por
bache en PiroliApp con `ID Produccion Blend` = lote, una Salida de Biochar Puro POR
BACHE (`produccion_destino_id` = lote), una Salida de abono por el total, la Entrada
de Blend y los `Estado Bache`. Es el único camino por el que el Blend entra al
inventario: `registrarEntradaBlend()` exige el lote justamente para que no exista un
"ingresar Blend" suelto, que sería producto sin receta.

Dos decisiones que sostienen eso: los **KG de Blend se digitan** —son lo que se pesó,
y derivarlos de una fórmula que suma 99,7% inventaría kilos—, y la **llave de
deduplicación no es la traza**: `documento_referencia` lleva `<lote>-<bache>` (única
por bache, o el chequeo de duplicados se saltaría todos menos el primero) mientras
`produccion_destino_id` lleva el lote pelado, que es lo que `getBachesDeLote()` cruza.
⚠️ Dos producciones distintas el mismo día SIN sufijo comparten lote y la segunda se
lee como reintento de la primera; por eso el formulario ofrece el pedido como sufijo.

**Un pedido se produce y DESPUÉS se despacha (2026-09-22).** En la tabla de pedidos,
`Producir` fabrica lo programado con el pedido en el lote `BLEND-<fecha>-<pedido>`
(`-<n>` si ya hubo otro ese día), y solo cuando ese lote tiene producto aparece
`Despachar`, que es donde se piden los datos de quien se lo lleva. El
despacho nunca produce desde la UI. El lote de un pedido no se le despacha a otro
(`esLoteDeOtroPedido()` en `despacho-blend.ts`).

**La recepción se confirma por enlace (2026-10-21).** Del 2026-10-02 a hoy la
remisión se firmaba solo en papel: primero salió de la app el trazo del conductor
del despacho y después la página pública `/pirolisis/blend/firmar/[remisionId]`,
que era el único endpoint de Blend sin autenticar. Nada pasaba la remisión a
`Entregada` ni llenaba `Fecha Recibido`. Ese paso volvió, pero NO como firma: como
un enlace que confirma la recepción.

El PDF de la remisión (`/api/pirolisis/blend/remision/pdf`, con sesión) se sigue
ARMANDO del Core cada vez, igual que el acta de entrega, y el despacho lo ADJUNTA
a `Documento Remision` (`adjuntarPdfRemision()`, paso `documento`, best-effort →
207) por `uploadAttachment` y no por URL pública, porque lleva cédulas: sin eso la
remisión quedaba en la tabla sin documento, como SIRIUS-REM-0202, ya que antes lo
adjuntaba la firma digital. ⚠️ Lo que se adjunta al Core va SIN QR (decisión de
David, 2026-10-21): el QR es una llave que confirma la recepción y Remisiones Core
también la lee DataLab; el QR solo existe en el papel (la descarga con sesión) y en
el enlace que se comparte. Para las viejas que falten:
`npx tsx scripts/adjuntar-pdf-remisiones.ts`, que adjunta la versión SIN QR —para
una por recibir, el enlace se saca de la bodega—. Por estado: `Borrador` da 409
(no viaja papel de un despacho que el sistema no terminó); `Pendiente` o
`En Tránsito` llevan el bloque «RECEPCIÓN PENDIENTE» con el QR; `Entregada` lleva
quién recibió y a qué hora.

- **El token va en el fragmento:** `/recibir#v1.<recId>.<exp>.<mac>`
  (`recepcion/token.ts`, `enlace.server.ts`). El fragmento no llega a los logs, al
  `Referer` ni a la vista previa de WhatsApp; la página lo pasa a
  `sessionStorage` y lo borra de la barra. Vence al terminar el día en Bogotá,
  `RECEPCION_TTL_DIAS` después de emitido (7 por defecto, recortado a 1…30). No se
  guarda en ningún lado: es determinista por día, y el PDF adjunto y el que se
  descarga ese día llevan el mismo QR. La URL base es `RECEPCION_URL_BASE` (o
  `NEXT_PUBLIC_APP_URL`), https en producción, y **nunca** `VERCEL_URL` ni el Host
  de la petición: el QR impreso tiene que seguir abriendo semanas después.
- **Uso único por `Estado`, no por un registro aparte.** El enlace vale mientras la
  remisión esté en `Pendiente` o `En Tránsito`; al pasar a `Entregada` mueren todos
  los de esa remisión. Con la misma cédula, un reintento responde 200 `yaRecibida`
  sin reenviar el correo; con otra, 409. La revocación de emergencia es rotar
  `RECEPCION_SECRET`.
- **Se emite en el servidor, en tres sitios:** el paso `enlace` de los dos
  despachos (en producción, si falta configuración, `ok:false` → 207; fuera,
  `skipped`), el PDF por recibir y `POST /api/pirolisis/remisiones/[codigo]/enlace`
  (con sesión, 30 cada 15 min por usuario), que devuelve el QR y el texto listo
  para WhatsApp (`mensajeWhatsAppRecepcion()`, sin cédulas). **En producción emitir
  exige la sesión firmada** (`sesionFirmada()`, §7): con la cookie sin firma
  cualquiera fabrica una sesión, y los códigos de remisión son consecutivos.
- **Identidad solo por cédula, dentro del alcance del cliente** (`identidad.ts`):
  las Personas de esta remisión, las de otras remisiones del mismo `ID Cliente`
  (también las de DataLab: es la misma gente) y el Personal Cliente activo. Nunca
  en toda la tabla: la página es pública, y buscar en todo `Personas` la volvería
  un oráculo cédula→nombre del ecosistema, que es el defecto de la firma pública
  del laboratorio. A quien consulta se le muestran nombre y correo enmascarados,
  nunca la cédula. Si la coincidencia no es un Receptor, se crea una COPIA
  Receptor en `Personas`; «No soy yo» registra una persona nueva y lo deja en
  `ID Origen`. **Personal Cliente no se escribe nunca**: Clients Core es solo de
  lectura para esta app, y escribirle desde una página pública es el defecto del
  laboratorio.
- **La prueba de la autorización va ANTES que el dato.** Cuando entra un dato
  personal nuevo (una persona o un correo agregado), primero se inserta la fila en
  la tabla de PiroliApp `Autorizaciones Datos Personales` (Ley 1581 de 2012;
  Decreto 1377 de 2013, art. 8: hay que poder probar la autorización) y después se
  escribe la persona. Vive en PiroliApp y no en un Core porque es evidencia de esta
  app; se accede por NOMBRE de campo, es de solo inserción y la revocación se marca
  a mano. Sin la tabla configurada, ese camino responde 503 sin escribir nada; el
  de una persona conocida que ya tiene correo sigue funcionando. El texto legal
  está versionado en `recepcion/textos.ts`: cambiarlo es una versión nueva, no
  una edición, porque no puede cambiar lo que alguien ya aceptó.
- **La recepción es UN PATCH** —`Estado` `Entregada`, `Fecha Recibido` en Bogotá,
  `Personas` previas ∪ receptor, marca `[recibida:<ISO>]`— que se relee después:
  si la marca no es la propia, otra confirmación ganó y esta responde 409 sin
  correo. `Fecha Recibido` es `date` y no guarda la hora; la marca sí.
- **El correo sale al CONFIRMAR, al receptor, con copia a adm@ y david@**
  (`RECEPCION_CORREO_CC`; decisión de David). Responder a adm@. Lleva el PDF ya
  recibido, que también reemplaza al adjunto en el Core como `<REM>-recibida.pdf`.
  **Nunca** va a los contactos del cliente ni a una dirección que llegue en el
  body: la página es pública, y un destinatario elegible haría del correo de Sirius
  un relé. Si el receptor no tiene correo, sale solo a la copia, con una franja que
  lo dice. Solo cuando salió de verdad se escribe `[correo:<ISO>]`; sin esa marca
  la remisión aparece en el panel de la bodega como incompleta, con [Reenviar]
  (3 por hora por remisión). Documento y correo son best-effort: lo que importa,
  la recepción, ya quedó.
- **El papel queda como respaldo.** El bloque del QR trae líneas para firmar: si
  quien recibe no tiene señal ni celular, se firma como antes, y la remisión se
  cierra a mano.
- **La página no muestra direcciones de correo (decisión de David, 2026-10-22)**:
  ni la de adm@ ni la del receptor enmascarada. El único `@` que queda es el canal
  de derechos del texto legal versionado, que la Ley 1581 exige.
- **El último paso es Flujo de caja (2026-10-22).** Finanzas factura desde la base
  Flujo de caja, no desde los Core, y las remisiones de pirólisis no llegaban. Al
  confirmar, el paso `flujo_caja` (best-effort → 207) copia la remisión a
  `Remisiones Pirolisis` y su línea a `Productos Remisiones Pirolisis`
  (`flujo-caja-remisiones.ts`), armadas con `construirDatosPdf()` para que digan
  lo mismo que el papel. Idempotente por `Numero Remision`. Lo anterior y lo que
  se cierra a mano lo trae `npx tsx scripts/registrar-remisiones-flujo-caja.ts
  [--remision …] [--apply]`, que verifica el esquema antes de escribir. Las
  tablas se clonaron de las del laboratorio y el mismo día se adaptaron al
  biochar: `Cantidad Kg`, `Producto`, `Código Producto`, `Precio por Kg` y
  `Valor Total` = kg × precio, sin tarifas de referencia. ⚠️ Los vínculos del
  clon apuntan a las tablas del LABORATORIO y la API no los puede repuntar ni
  borrar: quedaron como «(No usar) …»; los buenos son «Productos Remisiones
  Pirolisis» y «Remisión Pirolisis». Sin precio la línea vale 0, así que el del
  catálogo (Product Core, `Precio Venta Unitario`) es obligatorio: sin él no se
  escribe.
  Usa el token global (que tiene la base desde el 2026-10-22) salvo que se
  defina `AIRTABLE_FLUJO_CAJA_TOKEN`.

**El biochar puro también se vende: despacho por pedido (2026-10-21).** Hasta hoy
el biochar puro solo salía SIN venta (`runSalidaBiochar()`); un pedido de Pedidos
Core con línea `SIRIUS-PRODUCT-0015` no tenía cómo despacharse, y la venta se
terminaba registrando como «muestra» o «laboratorio» con destino de un pedido.
Ahora `Despachar` en «Pedidos de biochar» de la bodega llama a
`despacharPedidoBiochar()` (`despacho-biochar.ts`,
`/api/pirolisis/pedidos/despachar-biochar`, con sesión). El operador digita el
TOTAL y el ensayo lo reparte FIFO por bache sobre lo DESPACHABLE: el saldo del
Core menos lo ya prometido en remisiones no canceladas cuya Salida todavía no
existe. Igual que en la salida, la confirmación reenvía el reparto tal cual.

- **El `Borrador` es el ancla.** Sin transacciones entre cuatro bases, el orden
  sostiene una invariante: **toda remisión de biochar activa (Pendiente, En
  Tránsito, Entregada) tiene su inventario escrito en las dos vistas.** Primero la
  remisión nace en `Borrador` con su `Productos Remitidos` (una fila 0015 por el
  total) y su plan en las marcas; después la parte local y las Salidas del Core
  (críticas); solo entonces `activar` la pasa a `En Tránsito` (con cédula de
  transportista) o `Pendiente`. Estado de los baches, verificación de saldo,
  estado del pedido, enlace y documento son best-effort. Si algo crítico falla
  queda un Borrador VISIBLE que bloquea el pedido y que el PDF y el enlace
  rechazan; `/despachar-biochar/completar` lo termina, o lo anula si todavía no se
  escribió inventario. ⚠️ `Borrador` ya existía en `Remisiones.Estado` y lo usa
  DataLab; las de PiroliApp se distinguen por `Area Origen = Producción` más las
  marcas (`tipoRemision()`).
- **Idempotencia:** el ensayo genera en el SERVIDOR un `idDespacho` (UUID) que va
  a la remisión como `[desp:<uuid>]`. Confirmar dos veces encuentra la remisión y
  completa lo que falte (`yaExistia`); si dos instancias crearon dos, gana la de
  menor `numeracion` y la otra se descarta. El Blend usa la misma marca.
- **Las marcas son la trazabilidad:** `[bache:S-XXXXX=kg]` una por bache, antes del
  primer ` — ` de `Notas de Remisión` (lo de después es texto del operador y nunca
  se lee como marca: si se leyera, un `[bache:…]` escrito a mano entraría a la
  contabilidad de carbono). El contrato vive en `remision-pirolisis.constants.ts`.
  Lo despachado y el estado del pedido (`actualizarEstadoPedidoPirolisis()`, que
  nunca pisa `Completado` ni `Cancelado`) se derivan de lo remitido, no del
  rollup.
- **Una Salida 0015 POR BACHE en Inventario Production Core**, con
  `bache_origen_id` = el bache, `produccion_destino_id` = `SIRIUS-REM-XXXX` y
  `documento_referencia` = `DESP-<REM>-<S-XXXXX>` como llave, vinculada a
  `Stock_Actual` en el POST.
- **Una sola remisión LOCAL por despacho** en `Remisiones Baches Pirolisis`
  (`[DESPACHO:<REM>]`, `consumo-local-bache.ts`) con un detalle por bache: eUse
  cuenta cada fila como un VIAJE, y un despacho de cinco baches es un camión. Por
  lo mismo `Cliente` lleva el nombre EXACTO del cliente en Clients Core, que es
  por donde eUse lo cruza (y lanza si no cruza).
- **Lo no comercial sigue siendo `SAL-…` sin remisión**, con acta si es `entrega`.
  La bodega lo hace visible: el botón dice «Sacar sin venta (no es remisión)», y
  cada Salida se clasifica `venta` / `blend` / `sin-venta` por su destino
  (`clasificarSalidaBiochar()`): `SIRIUS-REM-…` es venta, los `SAL-` de motivo son
  sin venta.

**Se despacha el PEDIDO, no un lote (2026-09-24).** Un pedido producido en varias
tandas (SIRIUS-PED-0093: 1.446,98 + 585,23 kg) sale completo en UNA remisión con
todos sus lotes; si no alcanzan, se completa con lotes que no son de ningún pedido.
La remisión lleva una marca `[lote:…]` por lote más `[kg-lote:<lote>=<kg>]` con el
reparto (`lotesDeNotas()`), una fila de `Productos Remitidos` y una Salida
(`DESP-<rem>-<lote>`) por lote. Con el reparto, la composición y el CO₂ se siguen
derivando exactos: el biochar de la remisión es la suma de lo que aporta cada lote
con su propia proporción real. Sin él no se podría, y por eso antes era un lote
por remisión. Las remisiones de un solo lote quedan como siempre.

**Un despacho va a un ÁREA del cliente (2026-09-28).** Sanidad, Fertilización,
Cultivo… son áreas de la organización del cliente y viven por cliente en Sirius
Clients Core › `Areas Cliente` (`AC-XXXX`), no en una lista fija: cada cliente se
organiza distinto. Pedidos y Remisiones Core las apuntan en `ID Area Cliente`.
⚠️ No es `ID Area Core` del pedido, que es un área INTERNA de Sirius
(`SIRIUS-AREA-XXXX`). El pedido solo propone el área —PiroliApp no escribe
pedidos—; la remisión guarda la suya, porque un pedido puede salir en tandas para
áreas distintas, y el despacho rechaza un área que no sea del mismo cliente. El
operador puede registrar una nueva desde el despacho (`/api/clientes/areas`,
idempotente por nombre). Ver `areas-cliente-core.ts`.

**La fórmula del Blend suma 99,7%** (biochar 20% / abono 74% / agua 5% / biológicos
0,7%). Es una decisión abierta con DataLab; los componentes NO cuadran con el total
y no se debe forzar. Centralizada en `config.blend`.

---

## 6. Solicitudes de nómina: el paquete `@sirius/solicitudes`

`/solicitudes` y `/api/solicitudes/**` **no son código de PiroliApp**: los trae el
paquete `@sirius/solicitudes`, el mismo módulo que usa Gestión del Ser. Se instala
desde el tarball versionado en `vendor/` y se distribuye en TypeScript sin build,
así que `next.config.ts` necesita `transpilePackages: ['@sirius/solicitudes']`.

⚠️ **No lo aliases en `tsconfig.json` ni copies su `src/` al repo.** Antes había una
copia en `packages/solicitudes/` con un alias, y se quedó doce archivos atrás:
sin firma digital, sin calendario y con su propia lista de tipos de permiso. Se
resuelve por el `exports` de su package.json, como cualquier dependencia.

| Lo que PiroliApp le inyecta | Archivo |
|---|---|
| Sesión (`idCore`, nombre, cédula) | `src/lib/solicitudesAuth.ts` |
| Almacenamiento de la firma | `src/lib/solicitudesInfra.ts` |
| Base y tablas de Airtable | `src/lib/solicitudesAirtable.ts` |
| Cromado (foto, Navbar, Footer) | `src/components/SolicitudesShell.tsx` |
| Dónde archivar el PDF del día siriano | `src/lib/solicitudesInfra.ts` |
| Servir el documento con control de acceso | `src/app/api/documentos/permiso/[id]/route.ts` |

Tres cosas que no se pueden aflojar:

**La firma va al bucket de nómina, no al de pirólisis.** La `Firma_S3_Key` que
queda en Airtable la lee Gestión del Ser para servir el documento del permiso, y
la resuelve contra `S3_BUCKET_FIRMAS`. Escribirla en `siriuspirolisis` dejaría el
permiso radicado y su firma inaccesible, sin error visible en ninguna de las dos
apps. La convención de la key es parte del contrato, no un detalle.

**El día siriano está encendido, y eso arrastra tres piezas.** Ese permiso nace
autorizado: su único respaldo es el PDF que se emite al radicarlo, así que si
falta cualquiera de las tres, el handler responde 400 antes de registrar nada —
mejor eso que un permiso concedido sin nada que lo acredite.

1. El documento lo genera el paquete (`@sirius/solicitudes/dia-siriano`), no esta
   app: maqueta institucional, logo, QR y firma de Gestión del Ser. Aquí solo se
   dice dónde archivarlo (`solicitudesInfra.ts`), junto a las firmas y con la
   misma estructura de carpetas que Gestión del Ser: es el mismo expediente.
2. **`FIRMA_GESTION_SER_BASE64`** tiene que estar en el entorno del despliegue. Es
   una firma manuscrita: no va al repositorio, y los tests usan el trazo sintético
   que el paquete exporta (`FIRMA_FIXTURE_BASE64`). ⚠️ Next no carga `.env.local`
   con `NODE_ENV=test`, así que en tests hay que inyectarla siempre.
3. **`/api/documentos/permiso/[id]`** sirve el PDF, y ahí la regla es **solo el
   dueño**. Es completa para esta app: PiroliApp no autoriza solicitudes ni tiene
   jefaturas con potestad sobre ellas (eso vive en Gestión del Ser, que además abre
   el documento a quien autorizó). Al denegar responde **404, no 403**: un 403
   confirmaría que el registro existe, y eso ya es información sobre un tercero.
   El cliente nunca nombra el archivo —pide `(tipo, recordId)`— y el PDF se
   transmite por el route: una URL firmada sale del perímetro y funciona sin
   sesión mientras viva.

Si algún día se le quita esa infraestructura, hay que volver a pasarle
`diaSirianoHabilitado={false}` a `PermisoForm`: sin la prop el formulario ofrece un
camino que termina en error.

**Las tablas se le pasan explícitas.** El paquete las leería de sus propias
`AIRTABLE_TABLE_SOLICITUD_*`, que aquí no existen; `solicitudesAirtable.ts` le
entrega los IDs de `config.ts`. Y van también a `SolicitudesOverview`, que lee las
tres tablas por su cuenta: apuntarlo a otras dejaría el historial siempre vacío.

Se eliminaron `/api/nomina/permisos` y `/api/nomina/vacaciones` (con sus `[id]`):
no tenían autenticación —su GET devolvía los permisos de toda la empresa con el
motivo y la cédula—, nadie los consumía, y el paquete ya cubre esas tablas
exigiendo sesión. `/api/nomina/novedades` y `/api/nomina/empleados` siguen ahí
porque los usa `panel-control`, **y siguen respondiendo sin autenticar.**

---

## 7. Reglas del repositorio

**Ningún ID ni credencial de Airtable en el fuente**, tampoco en comentarios: van en
variables de entorno y se leen por `src/lib/config.ts`.

**Los comentarios explican el POR QUÉ**, no el qué. Si un comentario describe lo que
el código ya dice, sobra; si documenta una trampa o una decisión, es lo más valioso
del archivo.

**Scripts de datos** (`scripts/*.mjs`): `--dry-run` por defecto, `--apply` explícito,
idempotentes, y validan todo antes de escribir. Nunca un script que muta producción
sin poder ensayarlo.

**Antes de escribir a Airtable, verificar el esquema real** (opciones de los selects,
tipos de campo, nombres). Asumir es como se llega a un 422 en producción. Para las
remisiones comerciales lo hace `scripts/esquema-remisiones-pirolisis.mjs`, que
también crea la tabla de autorizaciones.

**Los secretos se leen perezosos, en un `*.server.ts`.** `config.ts` también entra
en páginas de cliente, así que ahí va solo lo que no es secreto
(`config.recepcion`, `config.empresa`). `SESSION_SECRET*` se lee en
`sesion-config.server.ts`, `RECEPCION_SECRET*` en `recepcion/enlace.server.ts` y
las credenciales de Azure en `correo/graph.server.ts`, todos con
`import 'server-only'` y en cada llamada, no al importar: así un test fija la
variable antes de usarla, y un despliegue sin las de Azure no tumba las rutas que
importan el módulo —solo falla el paso `correo`, con un 207 que nombra la
variable—. Ese es el defecto del laboratorio, que arma su cliente de correo al
cargar el módulo. Los mensajes nombran la variable que falta, **nunca su valor**.

**La sesión va firmada cuando hay `SESSION_SECRET` (2026-10-21).** Hasta hoy la
cookie era `base64(JSON)`: cualquiera podía escribirse la sesión de otro, y «con
sesión» valía lo mismo que «público». Con `SESSION_SECRET` (≥ 32 caracteres) va
`s1.<b64url>.<HMAC>` (`sesion-firma.ts`), el servidor exige las 24 h de vigencia y
rechaza la cookie sin firma —cada usuario inicia sesión una vez tras el
despliegue—; la rotación pasa el valor viejo a `SESSION_SECRET_ANTERIOR`. **Sin la
variable, la sesión funciona exactamente como antes, sin firma**, con un único
`console.error` por proceso: un despliegue sin ella no puede dejar a la planta sin
login. El costo es que en ese modo la sesión no autentica, y por eso lo sensible
pregunta antes `sesionFirmada()`: en producción, emitir enlaces de recepción.

**El correo sale por Microsoft Graph, no por SMTP** (`src/lib/correo/`). Se usa la
app de Azure de DataLab (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`) con client-credentials por `fetch`, sin dependencias nuevas,
y se envía desde `OUTLOOK_SENDER_EMAIL` (sirius.notify@). `nodemailer` y `SMTP_*`
quedan sin uso. Los logs solo llevan `{etiqueta, modo, destinatarios: n, status,
requestId, intentos}`: nunca direcciones, asunto, cuerpo ni token. Tres modos
(`resolverModoCorreo()`), para que ningún entorno de prueba le escriba a un
cliente:
- `enviar`: solo con `VERCEL_ENV=production` (Preview corre con
  `NODE_ENV=production`, así que `NODE_ENV` no sirve para decidirlo). Un
  `CORREO_MODO=enviar` fuera de producción se ignora.
- `redirigir`: todo va a `CORREO_REDIRIGIR_A`, que tiene que ser UNA dirección
  `@siriusregenerative.com`; el asunto lleva `[PRUEBA]` y una franja con los
  destinatarios originales enmascarados.
- `simular`: no sale a la red; con `CORREO_GUARDAR_EN` (nunca en producción) deja
  `.html`, `.pdf` y `.json` para revisarlos.
Fuera de producción el defecto es `redirigir` si hay destino válido y, si no,
`simular`. Para probar las credenciales: `npx tsx scripts/probar-correo.ts --para
david@siriusregenerative.com [--apply]`, que solo acepta el dominio propio. Para
recorrer la recepción sin Airtable ni correo: `RECEPCION_FIXTURES=1` (ignorado en
producción) y `scripts/ensayar-recepcion.ts`.

---

## 8. Estado conocido / deuda

- **Depuración del 2026-08-21.** Se eliminaron cuatro módulos completos: `/bodega`
  (materias primas del Blend), `/actas-biochar`, `/calendario-blend` (agendamiento) y
  `/pirolisis/blend/admin-pedidos` (pedidos y remisiones), con sus componentes, sus
  APIs (`/api/bodega/**`, `/api/actas-biochar/**`, casi todo `/api/pirolisis/blend/**`,
  las entradas de abono/biológicos, `/api/baches/salida` y `/api/baches/disponibles`) y
  las libs que quedaron huérfanas. Sobrevivió `/api/pirolisis/inventario/biochar-disponible`
  (lo consume `dashboard-produccion`). Consecuencia práctica: **ya no hay UI para
  agendar pedidos ni emitir remisiones**; el biochar sigue entrando a bodega al crear
  el bache (`/api/baches/update` → `biochar-bodega.ts`). El árbol previo quedó en el
  tag `pre-depuracion-blend`. La salida de un bache, las entradas de abono y la
  producción de Blend volvieron después por `/inventario-bodega-sirius` (ver abajo).
- **Un bache SIN monitoreo que pasa a bodega no entra al inventario.** `Total Cantidad
  Actual Biochar Seco` es 0 mientras no haya monitoreo de masa seca, y
  `registrarEntradaBiocharBodega()` OMITE la Entrada cuando no hay kg — correcto: el
  número no existe todavía y no se inventa. Lo que faltaba era verlo: el transporte por
  lotes de `/sistema-baches` solo miraba el HTTP de cada PATCH, así que S-00251…S-00260
  se movieron a bodega el 2026-08-21 con "✅ 10 baches movidos" y cero kg en el Core.
  Hoy la UI nombra los baches omitidos, y **registrar el monitoreo es el segundo
  disparador de la Entrada**: `/api/monitoreo-baches/create` la crea si el bache ya
  está en `Bache Completo Bodega` (best-effort, idempotente por `BODEGA-<bache>`).
  Para el rezago —un bache monitoreado antes de que existiera ese disparador— está
  `scripts/reparar-biochar-bodega.mjs --pendientes`. Para el rezago de monitoreo
  está `scripts/registrar-monitoreo-baches.mjs`, que carga en lote desde un CSV
  pasando por `/api/monitoreo-baches/create` —no escribe Airtable directo, para no
  tener dos versiones de la Entrada al Core: la del script sería la que nadie
  prueba—. Hoy **no queda ninguno pendiente** y las dos vistas del biochar cuadran
  en **52.368,65 kg** sobre 103 baches.
- **⚠️ S-00251…S-00260 tienen masa seca ESTIMADA, no medida (2026-08-28).** Decisión
  explícita de David tras advertirle dos veces. Esos diez pasaron a bodega sin
  monitoreo el 2026-08-21 y ocho no tenían ni el peso húmedo, así que la medición no
  existe y no se iba a hacer; sin masa seca eran invisibles —no se podían sacar ni
  producir con ellos— teniendo el biochar físicamente en la bodega. Se cargaron con
  `registrar-monitoreo-baches.mjs --estimar`: humedad **22,02%** y masa seca
  **508,40 kg**, el promedio de los 20 monitoreados INMEDIATAMENTE anteriores
  (S-00231…S-00250), que salieron de la misma corrida. S-00251 y S-00252 sí tenían
  peso húmedo propio, así que su masa seca es `húmedo × (1 − 22,02%)` = 389,90 y
  467,88 kg: un dato del bache, aunque sea uno solo, vence a un promedio ajeno.
  **Entraron 4.924,98 kg no medidos.** Cada registro lleva `ESTIMADO (no medido)` en
  `Realiza Registro`, y el endpoint copia esa marca al `responsable` del movimiento
  del Core, así que la estimación es visible en las dos vistas — que es lo que
  permite separarlos de lo medido al auditar la contabilidad de carbono. `--estimar`
  no es la vía normal: un bache monitoreado cuesta una muestra, uno estimado cuesta
  la credibilidad de los demás.
- **El abono 4G quedó conciliado el 2026-08-21.** Su libro mayor tenía una sola
  Entrada —los 33.614 kg del conteo del 2026-07-27— y cero salidas, contra 11.458 kg
  reales en bodega (conteo de Santiago). `scripts/salidas-abono-historicas.mjs` asentó
  las cuatro salidas que faltaban (11.100 kg → `BLEND-2026-04-30`, 8.880 kg →
  `BLEND-2026-06-24`, 2.000 kg al laboratorio, 176 kg de consumo del 20 ago) y
  `Stock_Actual` cuadra. Esto **revierte** la decisión del 2026-07-29 de no re-deducir
  el histórico de abono: esa decisión era una inferencia desde la ausencia de salidas
  en el Core, y el conteo físico la contradijo. Los **biológicos siguen sin conciliar**
  y son el único caso donde la vieja inferencia todavía manda: pedir el conteo antes de
  asentar salidas, no inferirlo. La trazabilidad de las dos salidas de producción es el
  lote (`produccion_destino_id`), que es la junta con los 11 baches —6 + 5— que viven
  en las Salidas de Biochar Puro del mismo lote. El abono no se traza por bache.
- **La era anterior a S-00083 sigue solo en PiroliApp V 1.0.** Los 19 baches de
  `Baches V1` (S-00063…S-00082, kg NOMINALES de lonas × 25, sin humedad, pero con
  los CORCs calculados por bache) y los ~62 de 2024 (S-00001…S-00062, que solo
  existen como agregado mensual en `historico_produccion`, con los rangos de código
  asignados a posteriori para reportar a Puro.earth). Falta **S-00077**: el
  autonumber 15 de `Baches V1` se borró, y como el código deriva del autonumber el
  hueco es irreparable. ⚠️ En `calculos_historico_produccion`, **noviembre y
  diciembre de 2024 son copias** de octubre y septiembre (sin `id_puro_earth` y sin
  registros diarios detrás): sumar esa tabla mensual infla el histórico en 59.800 kg
  de biomasa y 13.539 kg de biochar. Los registros diarios dan lo correcto: 132.062
  kg de biomasa → 30.770 kg de biochar. Y `Cantidad de Baches` no cuenta baches, es
  biochar/500.
- `scripts/diagnose-airtable.js` y `verify-env.js` usan `require()` y fallan el lint.
- `src/lib/blend-core-sync.ts` quedó obsoleto al invertirse la propiedad de las
  remisiones hacia el Core; su rol lo cumple `blend-remisiones-core.ts`.
- Campos vestigiales en PiroliApp de etapas anteriores: el link `Produccion Blend` y
  el rollup `KG Biochar Verificado (por bache)` en `Detalle Cantidades`, y la tabla
  `Produccion Biochar Blend Pirolisis` con 8 registros de prueba. La API de Airtable
  no permite borrar campos: hay que hacerlo desde la UI.
- 4 filas de `Detalle Cantidades` sin bache vinculado descontaron 8.070 kg de la nada
  ("biochar fantasma" de la auditoría del 2026-07-29).
- La fila de `Stock_Actual` del **Biochar Blend** en Inventario Production Core marca
  0 kg teniendo 15.528,45 de entradas y 13.050 de salidas: los movimientos históricos
  que cargó `scripts/blend-core-produccion.mjs` el 2026-07-30 nunca se vincularon al
  campo link `Stock_Actual`, y el saldo es una fórmula sobre los movimientos
  VINCULADOS. El código que escribe hoy sí los vincula; falta reparar esos históricos.
- Captura de pedidos por IA/voz (equivalente a `/api/pedidos-ia` del laboratorio) no
  existe para Blend.
- **Pendientes de la recepción por enlace y el despacho de biochar (2026-10-21):**
  - **La cookie va sin firma mientras falte `SESSION_SECRET` en Vercel.** Hasta
    entonces «con sesión» no autentica y, en producción, no se emiten enlaces de
    recepción (el paso `enlace` da 207 y `/enlace` responde 503). Cargarla —una
    distinta para Production y Preview— y avisar que todos vuelven a iniciar
    sesión. Las variables de Azure también faltan en Vercel Production.
  - **La tabla `Autorizaciones Datos Personales` no existe todavía.** La crea
    `node scripts/esquema-remisiones-pirolisis.mjs --crear-autorizaciones --apply`,
    que imprime el valor de `AIRTABLE_AUTORIZACIONES_DATOS_TABLE_ID`. Sin ella, la
    recepción de alguien nuevo (o de un correo nuevo) responde 503.
  - **El límite de intentos y el candado viven en memoria, por instancia**
    (`rate-limit.ts`, `candado.ts`): dos funciones de Vercel no los comparten. Por
    eso los flujos además releen y verifican después de escribir. Alcanza para
    este volumen; con más tráfico, un almacén compartido.
  - **Páginas y API heredadas que siguen públicas:** `/entrega-remision`,
    `/recepcion-remision` y `/api/remisiones-baches/*` salvo `biochar-aplicado`.
    No se tocaron; se recomienda retirarlas.
  - **Tres field IDs viejos en `config.ts`** de `Remisiones Baches Pirolisis`
    (`AIRTABLE_REMISIONES_QR_DOCUMENTO_FIELD_ID`, `…_FIRMA_ENTREGA_…`,
    `…_FIRMA_RECIBE_…`): nadie los lee ni escribe, pero `validateEnvVars` los
    exige. La limpieza empieza por `config.ts`, no por la variable.
  - **El NIT está por confirmar.** El encabezado traía uno de relleno que no
    coincidía con el de Clients Core; ahora sale de `EMPRESA_NIT` y, vacía, el
    documento no imprime NIT. Confirmarlo antes de que los correos salgan a
    terceros en producción.
  - **Coordinar con DataLab:** su firma pública de remisiones no filtra
    `Area Origen` y acepta cualquier estado menos `Entregada`; tiene que rechazar
    `Producción`. Nuestro flujo ve `Entregada` y se detiene, pero su página podría
    cerrar una remisión nuestra. También comparten el secreto de Azure, que ya
    venció una vez.
  - **Los contactos de Pablo (pablofelipe@) en Clients Core se inactivaron el
    2026-10-21**, porque le llegaban las remisiones del laboratorio. Nuestro correo
    nunca va a contactos del cliente, pero el Personal Cliente activo sí entra en
    la búsqueda de identidad de la recepción.
  - `consumo-local-bache.ts` solo lo usa el despacho de biochar; la salida
    (`salida-bache.ts`) y la producción (`produccion-blend.ts`) siguen con su
    propia escritura del detalle local, y su fecha por defecto sigue siendo UTC
    (`toISOString()`): después de las 19:00 en Bogotá ya es mañana. El despacho
    usa `fechaBogota()`.
  - eUse no cuenta los despachos de Blend: no escriben fila en
    `Remisiones Baches Pirolisis`, que es lo que eUse lee como viaje.
  - **Un transportista que no queda en `Personas` no avisa.** Sin
    `AIRTABLE_TABLE_PERSONAS_REMISION`, `buscarOCrearPersona()` devuelve null con
    un `console.warn` y el paso `transportista` sale `ok`: así quedó
    SIRIUS-REM-0228 sin quien la llevó (2026-10-22), y la recepción fallaba en el
    paso `receptor`. Hay que vincularle PER-REM-0025 a mano.
  - **Flujo de caja (2026-10-22):** las 5 remisiones de Blend (REM-0200, 0202,
    0203, 0204, 0228) ya están registradas. Falta cargar en Vercel
    `AIRTABLE_FLUJO_CAJA_BASE_ID`,
    `AIRTABLE_FLUJO_CAJA_REMISIONES_PIROLISIS_TABLE` y
    `AIRTABLE_FLUJO_CAJA_PRODUCTOS_REMISIONES_PIROLISIS_TABLE`. En la UI de
    Airtable: borrar los seis campos «(No usar) …» y, si hace falta, darle
    decimales a `Cantidad Kg` (hoy es entero, heredado).
