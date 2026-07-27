/**
 * Tests E2E - Listado y Filtrado de Activos
 *
 * Cubre:
 * 1. Visualización de tabla de activos
 * 2. Búsqueda por texto
 * 3. Filtros por estado, categoría, ubicación
 * 4. Paginación
 * 5. Cambio entre vista grid/lista
 */

import { test, expect } from '@playwright/test';

test.describe('Listado de Activos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/activos-fijos');
  });

  test('debe mostrar la tabla de activos', async ({ page }) => {
    // Verificar que hay una tabla o lista visible
    await expect(page.getByText(/activos/i)).toBeVisible();

    // TODO: Verificar columnas de la tabla
    // await expect(page.getByText('Código')).toBeVisible();
    // await expect(page.getByText('Nombre')).toBeVisible();
    // await expect(page.getByText('Estado')).toBeVisible();
  });

  test('debe buscar activos por texto', async ({ page }) => {
    // Encontrar campo de búsqueda
    const searchInput = page.getByPlaceholder(/buscar/i);

    // Verificar que existe
    await expect(searchInput).toBeVisible();

    // Buscar "Taladro"
    await searchInput.fill('Taladro');

    // Esperar resultados
    await page.waitForTimeout(1000);

    // TODO: Verificar que solo se muestran resultados con "Taladro"
    // Los resultados deben filtrarse automáticamente
  });

  test('debe filtrar por estado operativo', async ({ page }) => {
    // Buscar selector de estado
    const estadoFilter = page.locator('select').filter({ hasText: /estado/i }).first();

    if (await estadoFilter.isVisible()) {
      // Seleccionar "Operativo"
      await estadoFilter.selectOption('Operativo');

      // Esperar a que se aplique el filtro
      await page.waitForTimeout(1000);

      // TODO: Verificar que solo se muestran activos operativos
    }
  });

  test('debe filtrar por categoría', async ({ page }) => {
    // TODO: Implementar cuando el filtro esté en la UI
    // await page.getByLabel(/categoría/i).selectOption('Herramienta');
    // await page.waitForTimeout(1000);
    // await expect(page.getByText('Herramienta')).toBeVisible();
  });

  test('debe limpiar filtros', async ({ page }) => {
    // Aplicar búsqueda
    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill('Test');

    // Buscar botón de limpiar
    const clearButton = page.getByRole('button', { name: /limpiar|clear/i });

    if (await clearButton.isVisible()) {
      await clearButton.click();

      // Verificar que el campo se limpió
      await expect(searchInput).toHaveValue('');
    }
  });

  test('debe cambiar entre vista grid y lista', async ({ page }) => {
    // Buscar botones de vista
    const gridButton = page.getByRole('button', { name: /grid|cuadrícula/i });
    const listButton = page.getByRole('button', { name: /list|lista/i });

    if (await gridButton.isVisible()) {
      // Cambiar a vista grid
      await gridButton.click();
      await page.waitForTimeout(500);

      // Cambiar a vista lista
      await listButton.click();
      await page.waitForTimeout(500);

      // Verificar que la vista cambió (clase CSS o estructura)
      // TODO: Verificar clases o estructura específica
    }
  });

  test('debe mostrar detalles de un activo al hacer click', async ({ page }) => {
    // Esperar a que carguen los activos
    await page.waitForTimeout(1000);

    // Buscar primera tarjeta o fila de activo
    const firstActivo = page.locator('[data-testid="activo-card"]').first();

    if (await firstActivo.isVisible()) {
      await firstActivo.click();

      // Verificar que se muestra información detallada
      // TODO: Verificar modal o panel de detalles
      await page.waitForTimeout(500);
    }
  });

  test('debe ordenar por nombre', async ({ page }) => {
    // Buscar header de columna "Nombre"
    const nombreHeader = page.getByText('Nombre').first();

    if (await nombreHeader.isVisible()) {
      // Click para ordenar
      await nombreHeader.click();
      await page.waitForTimeout(1000);

      // TODO: Verificar que el orden cambió
      // Click de nuevo para orden inverso
      await nombreHeader.click();
      await page.waitForTimeout(1000);
    }
  });

  test('debe ordenar por fecha de adquisición', async ({ page }) => {
    const fechaHeader = page.getByText(/fecha.*adquisición/i).first();

    if (await fechaHeader.isVisible()) {
      await fechaHeader.click();
      await page.waitForTimeout(1000);

      // TODO: Verificar orden cronológico
    }
  });

  test('debe mostrar mensaje cuando no hay resultados', async ({ page }) => {
    // Buscar algo que no existe
    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill('ESTO_NO_EXISTE_XYZ123');

    await page.waitForTimeout(1000);

    // Verificar mensaje de "no hay resultados"
    await expect(page.getByText(/no se encontraron|sin resultados|no hay activos/i)).toBeVisible();
  });

  test('debe manejar carga lenta de datos', async ({ page }) => {
    // Mock de respuesta lenta
    await page.route('**/api/activos/list', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      route.continue();
    });

    await page.reload();

    // Verificar indicador de carga
    await expect(page.getByText(/cargando|loading/i)).toBeVisible();

    // Esperar a que termine
    await page.waitForTimeout(3000);

    // El indicador debe desaparecer
    await expect(page.getByText(/cargando|loading/i)).not.toBeVisible();
  });

  test('debe filtrar activos disponibles', async ({ page }) => {
    // Buscar toggle o checkbox de "Solo disponibles"
    const availableFilter = page.getByText(/disponible|sin asignar/i).first();

    if (await availableFilter.isVisible()) {
      await availableFilter.click();
      await page.waitForTimeout(1000);

      // TODO: Verificar que solo se muestran activos disponibles
    }
  });

  test('debe filtrar activos próximos a vencer', async ({ page }) => {
    // Buscar filtro de vencimiento
    const vencimientoFilter = page.getByText(/próximo.*vencer|vencimiento/i).first();

    if (await vencimientoFilter.isVisible()) {
      await vencimientoFilter.click();
      await page.waitForTimeout(1000);

      // TODO: Verificar que solo se muestran activos con vencimiento < 30 días
    }
  });

  test('debe combinar múltiples filtros', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/buscar/i);

    // Aplicar búsqueda
    await searchInput.fill('Industrial');

    // Aplicar filtro de estado
    const estadoFilter = page.locator('select').filter({ hasText: /estado/i }).first();
    if (await estadoFilter.isVisible()) {
      await estadoFilter.selectOption('Operativo');
    }

    await page.waitForTimeout(1000);

    // TODO: Verificar que se aplican ambos filtros
    // (nombre contiene "Industrial" Y estado = "Operativo")
  });

  test('debe mantener filtros al navegar entre páginas', async ({ page }) => {
    // Aplicar filtro
    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill('Test');

    // Navegar a otra página (si existe paginación)
    const nextButton = page.getByRole('button', { name: /siguiente|next/i });

    if (await nextButton.isVisible()) {
      await nextButton.click();
      await page.waitForTimeout(1000);

      // Verificar que el filtro se mantiene
      await expect(searchInput).toHaveValue('Test');
    }
  });

  test('debe mostrar cantidad total de activos', async ({ page }) => {
    // Buscar texto tipo "Mostrando 10 de 25 activos"
    await expect(page.getByText(/\d+ activos?/i)).toBeVisible();
  });

  test('debe actualizar contadores al filtrar', async ({ page }) => {
    // Capturar contador inicial
    const counterText = await page.getByText(/\d+ activos?/i).first().textContent();
    const initialCount = parseInt(counterText?.match(/\d+/)?.[0] || '0');

    // Aplicar filtro restrictivo
    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill('FILTRO_RESTRICTIVO_XYZ');
    await page.waitForTimeout(1000);

    // Capturar contador después de filtrar
    const filteredText = await page.getByText(/\d+ activos?/i).first().textContent();
    const filteredCount = parseInt(filteredText?.match(/\d+/)?.[0] || '0');

    // El contador debe ser menor o igual
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });
});
