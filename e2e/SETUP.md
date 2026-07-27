# Setup de Tests E2E con Playwright

## 📦 Instalación

### 1. Instalar Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

### 2. Inicializar configuración (opcional)

```bash
npx playwright install chromium
```

Esto instalará los navegadores necesarios (Chromium, Firefox, WebKit).

## ⚙️ Configuración

El archivo `playwright.config.ts` ya está configurado con:

- ✅ Base URL: `http://localhost:3000`
- ✅ Navegadores: Chromium, Firefox, WebKit
- ✅ Screenshots en fallos
- ✅ Videos de tests fallidos
- ✅ Retry automático (1 intento)

## 🚀 Comandos

### Ejecutar todos los tests E2E

```bash
npm run test:e2e
```

### Ejecutar en modo UI (interactivo)

```bash
npm run test:e2e:ui
```

### Ejecutar tests específicos

```bash
npx playwright test activos
npx playwright test activos/registro
```

### Ver reporte de tests

```bash
npx playwright show-report
```

### Modo debug

```bash
npx playwright test --debug
```

## 📁 Estructura de Tests E2E

```
e2e/
├── activos/
│   ├── registro.spec.ts       # Flujo de registro de activos
│   ├── listado.spec.ts        # Filtros y búsqueda
│   ├── asignacion.spec.ts     # Asignar y devolver activos
│   ├── estadisticas.spec.ts   # Dashboard y métricas
│   └── navegacion.spec.ts     # Navegación entre módulos
├── fixtures/
│   └── test-data.ts           # Datos de prueba
├── helpers/
│   └── auth.ts                # Helpers de autenticación
├── SETUP.md                   # Esta guía
└── playwright.config.ts       # Configuración de Playwright
```

## 🔐 Autenticación en Tests

Los tests necesitan autenticación (TurnoProtection). Configurar variables de entorno:

```bash
# .env.test.local
TEST_USER_EMAIL=test@siriusregenerative.com
TEST_USER_PASSWORD=tu-password-de-prueba
```

## ✅ Pre-requisitos

Antes de ejecutar los tests E2E:

1. ✅ Servidor de desarrollo corriendo en `http://localhost:3000`
2. ✅ Airtable configurado con datos de prueba
3. ✅ Variables de entorno configuradas
4. ✅ Usuario de prueba creado en el sistema

## 🎯 Flujos a Probar

### Críticos (Alta Prioridad)
- ✅ Registro de activo completo
- ✅ Asignar activo a usuario
- ✅ Devolver activo
- ✅ Búsqueda y filtrado
- ✅ Visualización de estadísticas

### Importantes (Media Prioridad)
- ✅ Editar activo existente
- ✅ Soft delete (dar de baja)
- ✅ Navegación entre módulos
- ✅ Responsive design (mobile)

### Nice to Have (Baja Prioridad)
- ⏳ Exportar a PDF
- ⏳ Alertas de vencimiento
- ⏳ Validaciones de campos

## 📊 Reportes

Playwright genera reportes automáticos en:
- `playwright-report/` - Reporte HTML
- `test-results/` - Screenshots y videos de fallos

## 🐛 Debugging

### Ver test en slow motion

```bash
npx playwright test --headed --slow-mo=1000
```

### Inspeccionar elementos

```bash
npx playwright codegen http://localhost:3000
```

Esto abre el navegador y genera código de Playwright mientras interactúas.

## 📝 Escribir Nuevos Tests

Ejemplo básico:

```typescript
import { test, expect } from '@playwright/test';

test('debe hacer algo', async ({ page }) => {
  await page.goto('/activos-fijos');
  await expect(page.getByText('Activos Fijos')).toBeVisible();
});
```

## ⚠️ Notas Importantes

1. **No ejecutar tests E2E contra producción** - Solo desarrollo/staging
2. **Limpiar datos de prueba** - Los tests pueden dejar datos en Airtable
3. **Rate limits de Airtable** - Cuidado con tests masivos
4. **Tiempo de ejecución** - Tests E2E son lentos (~30-60 segundos cada uno)

---

**Siguiente paso**: Ejecutar `npm install -D @playwright/test` y luego `npm run test:e2e`
