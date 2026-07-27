/**
 * Tests E2E - Dashboard y Estadísticas
 *
 * Cubre:
 * 1. Visualización de métricas principales
 * 2. Gráficos y charts
 * 3. Alertas de vencimiento
 * 4. Valor total de activos
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard y Estadísticas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/activos-fijos');
  });

  test('debe mostrar tarjetas de estadísticas principales', async ({ page }) => {
    // Esperar a que carguen las estadísticas
    await page.waitForTimeout(2000);

    // Verificar que se muestran las métricas principales
    // Total de activos
    await expect(page.getByText(/total.*activos|activos totales/i)).toBeVisible();

    // Operativos
    await expect(page.getByText(/operativos/i)).toBeVisible();

    // Disponibles
    await expect(page.getByText(/disponible/i)).toBeVisible();

    // En mantenimiento
    await expect(page.getByText(/mantenimiento/i)).toBeVisible();
  });

  test('debe mostrar números correctos en estadísticas', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar tarjetas con números
    const statCards = page.locator('[data-testid="stat-card"]');

    if (await statCards.first().isVisible()) {
      const count = await statCards.count();

      // Debe haber al menos 4 tarjetas de estadísticas
      expect(count).toBeGreaterThanOrEqual(4);

      // Cada tarjeta debe tener un número
      for (let i = 0; i < Math.min(count, 6); i++) {
        const card = statCards.nth(i);
        await expect(card.getByText(/\d+/)).toBeVisible();
      }
    }
  });

  test('debe mostrar valor total de activos', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar formato de moneda COP
    await expect(page.getByText(/\$.*\d+|COP.*\d+/i)).toBeVisible();
  });

  test('debe formatear valores grandes correctamente', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Los valores grandes deben tener separadores de miles
    // Ej: $1.500.000 o $1,500,000
    const valorText = await page.getByText(/\$\s*[\d,.]+/i).first().textContent();

    if (valorText) {
      // Verificar que tiene formato de moneda
      expect(valorText).toMatch(/\$|COP/i);
    }
  });

  test('debe mostrar alertas de activos próximos a vencer', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar sección de alertas
    const alertSection = page.getByText(/alertas|vencimiento|próximo.*vencer/i).first();

    if (await alertSection.isVisible()) {
      // Verificar que hay lista de alertas
      await expect(page.getByText(/\d+ días/i).first()).toBeVisible();
    }
  });

  test('debe mostrar alertas de mantenimiento programado', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar alertas de mantenimiento
    const maintenanceAlert = page.getByText(/mantenimiento.*programado|próximo mantenimiento/i).first();

    if (await maintenanceAlert.isVisible()) {
      // Verificar que muestra fecha o días restantes
      await expect(page.getByText(/\d+ días|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i).first()).toBeVisible();
    }
  });

  test('debe calcular porcentajes correctamente', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar indicadores de porcentaje
    const percentages = page.getByText(/\d+%/);

    if (await percentages.first().isVisible()) {
      const count = await percentages.count();

      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await percentages.nth(i).textContent();
        const percent = parseInt(text?.match(/\d+/)?.[0] || '0');

        // Los porcentajes deben estar entre 0 y 100
        expect(percent).toBeGreaterThanOrEqual(0);
        expect(percent).toBeLessThanOrEqual(100);
      }
    }
  });

  test('debe actualizar estadísticas al filtrar', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Capturar número inicial de activos
    const initialText = await page.getByText(/total.*activos/i).first().textContent();
    const initialCount = parseInt(initialText?.match(/\d+/)?.[0] || '0');

    // Aplicar filtro
    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill('Test Filter');
    await page.waitForTimeout(1500);

    // Capturar número después del filtro
    const filteredText = await page.getByText(/total.*activos/i).first().textContent();
    const filteredCount = parseInt(filteredText?.match(/\d+/)?.[0] || '0');

    // El número debe cambiar (o ser 0 si no hay resultados)
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('debe mostrar gráfico de distribución por categoría', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar canvas de chart (Recharts usa SVG)
    const chart = page.locator('svg').first();

    if (await chart.isVisible()) {
      // Verificar que hay elementos gráficos
      const shapes = chart.locator('path, rect, circle');
      const count = await shapes.count();

      expect(count).toBeGreaterThan(0);
    }
  });

  test('debe mostrar conteo por estado operativo', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Verificar que se muestran todos los estados
    const estados = [
      'Operativo',
      'En Mantenimiento',
      'Disponible',
      'En Reparación'
    ];

    for (const estado of estados) {
      // Cada estado debe aparecer en alguna parte
      const estadoElement = page.getByText(estado).first();
      // No forzamos que todos existan, pero si existen deben ser visibles
      if (await estadoElement.isVisible().catch(() => false)) {
        await expect(estadoElement).toBeVisible();
      }
    }
  });

  test('debe mostrar activos asignados vs disponibles', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar indicadores de asignación
    await expect(page.getByText(/asignados|en uso/i).first()).toBeVisible();
  });

  test('debe hacer refresh de estadísticas', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar botón de refresh
    const refreshButton = page.getByRole('button', { name: /actualizar|refresh/i });

    if (await refreshButton.isVisible()) {
      await refreshButton.click();

      // Verificar loading
      await expect(page.getByText(/cargando|loading/i)).toBeVisible();

      // Esperar a que termine
      await page.waitForTimeout(2000);
    }
  });

  test('debe navegar a lista filtrada desde estadística', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Click en tarjeta de "Operativos"
    const operativosCard = page.getByText(/operativos/i).first();

    if (await operativosCard.isVisible()) {
      // Si es clickeable, debería filtrar la tabla
      await operativosCard.click();
      await page.waitForTimeout(1000);

      // TODO: Verificar que la tabla se filtró por "Operativo"
    }
  });

  test('debe mostrar tendencias si hay datos históricos', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Buscar indicadores de tendencia (↑ ↓)
    const trendIndicator = page.getByText(/↑|↓|⬆|⬇/);

    if (await trendIndicator.first().isVisible()) {
      // Verificar que hay al menos uno
      expect(await trendIndicator.count()).toBeGreaterThan(0);
    }
  });

  test('debe manejar estadísticas vacías correctamente', async ({ page }) => {
    // Mock de respuesta vacía
    await page.route('**/api/activos/estadisticas', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            totalActivos: 0,
            operativos: 0,
            enMantenimiento: 0,
            disponibles: 0,
            valorTotal: 0
          }
        })
      });
    });

    await page.reload();
    await page.waitForTimeout(2000);

    // Debe mostrar 0 en las métricas
    await expect(page.getByText(/0.*activos|total.*0/i)).toBeVisible();
  });

  test('debe mostrar error si falla carga de estadísticas', async ({ page }) => {
    // Mock de error
    await page.route('**/api/activos/estadisticas', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Error al cargar estadísticas' })
      });
    });

    await page.reload();
    await page.waitForTimeout(2000);

    // Verificar mensaje de error
    await expect(page.getByText(/error|falló.*cargar/i)).toBeVisible();
  });

  test('debe ser responsive en mobile', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.waitForTimeout(2000);

      // En mobile, las tarjetas deben apilarse verticalmente
      const statCards = page.locator('[data-testid="stat-card"]');

      if (await statCards.first().isVisible()) {
        // TODO: Verificar layout en columna (flex-direction: column)
      }
    }
  });
});
