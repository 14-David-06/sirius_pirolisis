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
| `insumosCore*` | **Sirius Insumos Core** | Insumos, movimientos y stock. Incluye `Biochar Puro` (SIRIUS-INS-0067) |
| `pedidosCore*` | **Sirius Pedidos Core** | Pedidos y detalles de cliente |
| `remisionesCore*` | **Sirius Remisiones Core** | Remisiones, productos remitidos, personas |
| `inventarioProdCore*` | **Sirius Inventario Production Core** | Libro mayor de producto terminado |
| `productsBaseId` | **Sirius Product Core** | Catálogo. Biochar Blend = `SIRIUS-PRODUCT-0016` |
| `clientesBaseId` | **Sirius Clients Core** | Clientes y su personal |
| `nominaCore*` | **Sirius Nomina Core** | Personal (solo login) |
| `novedadesNomina*` | **Sirius Novedades Nomina** | Permisos, vacaciones y novedades — los escribe `@sirius/solicitudes` (§6) |

### Regla de oro: FK simbólicas, nunca linked records entre bases

Airtable **no permite** links entre bases. Todo cruce se hace con códigos de texto
legibles:

```
SIRIUS-PED-0059     → pedido            SIRIUS-PRODUCT-0016 → producto
SIRIUS-REM-0116     → remisión          SIRIUS-INS-0067     → insumo
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
le descontó más de lo que tenía (pasó con S-00177: −0,18 kg).

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

Ver `runBlendDeduction()` en `src/lib/blend-deduction.ts` y `crearRemision()` en
`src/lib/blend-remisiones-core.ts`.

**Idempotencia:** toda escritura repetible necesita una llave de deduplicación.
Se usa `documento_referencia` en los movimientos de inventario, el estado del pedido
como lock en `iniciar-produccion`, y marcas en texto (`[lote:…]`,
`RECONSTRUCCION-HISTORICA:…`) donde no hay campo dedicado.

---

## 5. Biochar Blend: el modelo por lote

La producción de Blend **no es una fila en una tabla**. Es un conjunto de movimientos
en los Core unidos por un **código de lote** `BLEND-…`.

```
iniciar-produccion  →  lote BLEND-<fecha>-<pedido>
                       │
   ┌───────────────────┼──────────────────────────────┐
   │                   │                              │
Insumos Core      Inventario Prod. Core          PiroliApp
Salida por bache  Entrada de producto            Detalle Cantidades
ID Bache Origen   documento_referencia = lote    ID Produccion Blend = lote
ID Produccion                                    + Estado Bache → Agotado
  Destino = lote
```

**Composición, CO₂ y baches NO se guardan: se derivan del lote.** Guardarlos sería
duplicar un dato que puede divergir. Ver `composicionDeDespacho()` y
`getBachesDeLote()`.

**El biochar se escribe en DOS vistas a propósito.** Sirius Insumos Core es el libro
mayor ("cuánto hay y a dónde fue"); la fórmula del bache responde "cuánto queda de
ESTE bache", que es lo que necesita la UI de selección al producir. Cada consumo se
escribe una vez en cada vista con el mismo número.
**Todo consumidor de "biochar en stock" debe pasar por `resolverBiocharDisponible()`**
(`src/lib/baches-biochar.ts`), que decide la fuente y expone la `divergencia` entre
las dos. Si una pantalla elige su fuente, bodega y producción se contradicen.

**La tabla de baches es un HISTORIAL.** Los baches no se borran: cambian de
`Estado Bache` a `Bache Incompleto` o `Bache Agotado` al vaciarse
(`estadoTrasConsumo()`).

**Un bache también sale SIN producir.** Un bigbag al laboratorio, una muestra, un
derrame: `runSalidaBache()` (`src/lib/salida-bache.ts`) escribe las mismas tres
partes que la producción de Blend —el detalle que baja la fórmula del bache, la
`Salida` de `Biochar Puro` en Insumos Core y el `Estado Bache`— con `StepResult` y
207. Es el camino obligatorio: la UI de remisión de baches (`/api/remisiones-baches`)
escribe SOLO el detalle, así que usarla para esto infla el stock del Core y deja el
bache en "Completo Bodega" con 0 kg.

Su llave es la referencia `SAL-<MOTIVO>-<fecha>-<bache>`, y se verifica lado por
lado: **reintentar una salida COMPLETA la mitad que falte** en vez de duplicarla, así
que es también la herramienta para cerrar una divergencia Core↔baches. Por eso la
idempotencia se consulta ANTES de validar disponibilidad: con el detalle ya escrito
el bache marca 0 y validar primero mataba el reintento con "no tiene biochar
disponible". Acepta `dryRun` para ver el plan sin escribir.

**Las entregas sin factura son un acta, no una remisión.** Biochar entregado para
investigación, ensayo, piloto o donación se documenta con un `Acta de Entrega de
Biochar` (`src/lib/actas-biochar.ts`): evidencia del uso previsto declarado que exige
el numeral 5.4.2 de la Puro Biochar Methodology. Vive en PiroliApp —no en un Core—
porque no es un documento comercial: meterla en Pedidos/Remisiones Core mezclaría
donaciones con ventas. Sus receptores son tabla propia y **no** clientes de Clients
Core por la misma razón.

El tipo de biochar del acta decide de qué libro mayor se descuenta: **puro** → baches
+ Insumos Core (vía `runSalidaBache` con el código del acta como `referenciaBase`);
**blend** → Salida en Inventario Production Core con `documento_referencia =
ACTA-<código>`. El inventario se mueve al GENERAR el acta, no al firmar: el biochar
ya salió físicamente.

**Todo el biochar se maneja en MASA SECA** (decisión de David, 2026-08-05). El acta
física deja abierta la casilla húmeda/seca, pero la app no: no hay selector ni
conversión, los KG que se digitan son secos y `Base Cantidad` siempre se escribe
`Seca`. Ofrecer las dos bases invitaba a digitar el peso de la balanza contra un
inventario que se lleva en seco, y eso deja el bache con biochar que no existe. La
humedad del lote se guarda porque la sección 2 del acta la pide, pero no participa en
ningún cálculo. No reintroducir una ruta de masa húmeda.

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

- `scripts/diagnose-airtable.js` y `verify-env.js` usan `require()` y fallan el lint.
- `src/lib/blend-core-sync.ts` quedó obsoleto al invertirse la propiedad de las
  remisiones hacia el Core; su rol lo cumple `blend-remisiones-core.ts`.
- Campos vestigiales en PiroliApp de etapas anteriores: el link `Produccion Blend` y
  el rollup `KG Biochar Verificado (por bache)` en `Detalle Cantidades`, y la tabla
  `Produccion Biochar Blend Pirolisis` con 8 registros de prueba. La API de Airtable
  no permite borrar campos: hay que hacerlo desde la UI.
- 4 filas de `Detalle Cantidades` sin bache vinculado descontaron 8.070 kg de la nada
  ("biochar fantasma" de la auditoría del 2026-07-29).
- Captura de pedidos por IA/voz (equivalente a `/api/pedidos-ia` del laboratorio) no
  existe para Blend.
