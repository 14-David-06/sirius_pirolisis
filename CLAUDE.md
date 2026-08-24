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

Crítico en los endpoints **públicos y sin autenticar** (la firma de remisiones, que
el cliente abre desde el celular en la finca).

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
tipos de campo, nombres). Asumir es como se llega a un 422 en producción.

---

## 8. Estado conocido / deuda

- **Depuración del 2026-08-21.** Se eliminaron cuatro módulos completos: `/bodega`
  (materias primas del Blend), `/actas-biochar`, `/calendario-blend` (agendamiento) y
  `/pirolisis/blend/admin-pedidos` (pedidos y remisiones), con sus componentes, sus
  APIs (`/api/bodega/**`, `/api/actas-biochar/**`, casi todo `/api/pirolisis/blend/**`,
  las entradas de abono/biológicos, `/api/baches/salida` y `/api/baches/disponibles`) y
  las libs que quedaron huérfanas. Sobreviven `pirolisis/blend/firmar/[remisionId]`
  (firma pública de remisiones ya emitidas) y `/api/pirolisis/inventario/biochar-disponible`
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
  `scripts/reparar-biochar-bodega.mjs --pendientes`. Al 2026-08-21 quedan los 10
  (S-00251…S-00260) esperando monitoreo; las dos vistas del biochar cuadran en
  48.273,53 kg.
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
