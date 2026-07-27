/**
 * Tests E2E - Flujo de Asignación y Devolución
 *
 * Cubre:
 * 1. Asignar activo a usuario
 * 2. Ver historial de asignaciones
 * 3. Devolver activo
 * 4. Validar estados durante el flujo
 */

import { test, expect } from '@playwright/test';

test.describe('Asignación de Activos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/activos-fijos');
  });

  test('debe mostrar botón de asignar en activo disponible', async ({ page }) => {
    // Esperar a que carguen activos
    await page.waitForTimeout(1500);

    // Buscar un activo disponible
    // TODO: Filtrar por "Disponible" primero
    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await expect(assignButton).toBeEnabled();
    }
  });

  test('debe abrir modal de asignación', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Click en botón asignar del primer activo disponible
    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();

      // Verificar que se abre el modal
      await expect(page.getByText(/asignar activo|responsable/i)).toBeVisible();
    }
  });

  test('debe validar campos requeridos en asignación', async ({ page }) => {
    await page.waitForTimeout(1500);

    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();

      // Intentar asignar sin llenar campos
      const confirmButton = page.getByRole('button', { name: /confirmar|asignar/i }).last();
      await confirmButton.click();

      // Verificar mensaje de error
      await expect(page.getByText(/responsable.*requerido|campo.*obligatorio/i)).toBeVisible();
    }
  });

  test('debe asignar activo exitosamente (flujo completo)', async ({ page }) => {
    await page.waitForTimeout(1500);

    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();

      // Llenar nombre del responsable
      const responsableInput = page.getByLabel(/responsable|persona/i);
      await responsableInput.fill('Juan Pérez E2E Test');

      // Llenar área
      const areaInput = page.getByLabel(/área/i);
      if (await areaInput.isVisible()) {
        await areaInput.fill('Pirólisis');
      }

      // Llenar propósito
      const purposeInput = page.getByLabel(/propósito|uso/i);
      if (await purposeInput.isVisible()) {
        await purposeInput.fill('Trabajo de campo E2E');
      }

      // Seleccionar ubicación destino si existe
      // TODO: Implementar selector de ubicación

      // Confirmar asignación
      const confirmButton = page.getByRole('button', { name: /confirmar|asignar/i }).last();
      await confirmButton.click();

      // Esperar confirmación
      await page.waitForTimeout(2000);

      // Verificar que el modal se cerró
      await expect(page.getByText(/asignar activo/i)).not.toBeVisible();

      // TODO: Verificar que el activo ahora muestra estado "Asignado"
    }
  });

  test('debe mostrar historial de asignaciones', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Buscar botón de historial o detalles
    const detailsButton = page.getByRole('button', { name: /ver.*detalle|historial/i }).first();

    if (await detailsButton.isVisible()) {
      await detailsButton.click();

      // Verificar que se muestra el historial
      await expect(page.getByText(/asignaciones|historial/i)).toBeVisible();
    }
  });

  test('debe devolver activo asignado', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Buscar activo asignado
    // TODO: Filtrar por "Asignados" primero

    const returnButton = page.getByRole('button', { name: /devolver/i }).first();

    if (await returnButton.isVisible()) {
      await returnButton.click();

      // Verificar modal de devolución
      await expect(page.getByText(/devolver activo|devolución/i)).toBeVisible();

      // Llenar observaciones de devolución
      const observationsInput = page.getByLabel(/observaciones|notas/i);
      if (await observationsInput.isVisible()) {
        await observationsInput.fill('Devolución E2E Test - Todo en orden');
      }

      // Seleccionar condición al devolver
      const conditionSelect = page.getByLabel(/condición/i);
      if (await conditionSelect.isVisible()) {
        await conditionSelect.selectOption('Bueno');
      }

      // Confirmar devolución
      const confirmButton = page.getByRole('button', { name: /confirmar|devolver/i }).last();
      await confirmButton.click();

      // Esperar confirmación
      await page.waitForTimeout(2000);

      // El modal debe cerrarse
      await expect(page.getByText(/devolver activo/i)).not.toBeVisible();
    }
  });

  test('debe marcar si requiere mantenimiento post-devolución', async ({ page }) => {
    await page.waitForTimeout(1500);

    const returnButton = page.getByRole('button', { name: /devolver/i }).first();

    if (await returnButton.isVisible()) {
      await returnButton.click();

      // Buscar checkbox de mantenimiento
      const maintenanceCheckbox = page.getByLabel(/requiere.*mantenimiento/i);

      if (await maintenanceCheckbox.isVisible()) {
        await maintenanceCheckbox.check();

        // Confirmar devolución
        const confirmButton = page.getByRole('button', { name: /confirmar|devolver/i }).last();
        await confirmButton.click();

        await page.waitForTimeout(2000);

        // TODO: Verificar que el activo tiene estado "En Mantenimiento"
      }
    }
  });

  test('debe cancelar asignación sin guardar', async ({ page }) => {
    await page.waitForTimeout(1500);

    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();

      // Llenar algunos datos
      const responsableInput = page.getByLabel(/responsable/i);
      await responsableInput.fill('Este dato no se guardará');

      // Cancelar
      const cancelButton = page.getByRole('button', { name: /cancelar/i });
      await cancelButton.click();

      // El modal debe cerrarse
      await expect(page.getByText(/asignar activo/i)).not.toBeVisible();

      // Los datos no deben guardarse
      await expect(page.getByText('Este dato no se guardará')).not.toBeVisible();
    }
  });

  test('debe subir evidencia al asignar', async ({ page }) => {
    await page.waitForTimeout(1500);

    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();

      // Buscar input de archivo
      const fileInput = page.locator('input[type="file"]');

      if (await fileInput.isVisible()) {
        // Simular subida de archivo
        // await fileInput.setInputFiles('path/to/test-image.jpg');

        // TODO: Verificar preview de imagen
      }
    }
  });

  test('debe subir evidencia al devolver', async ({ page }) => {
    await page.waitForTimeout(1500);

    const returnButton = page.getByRole('button', { name: /devolver/i }).first();

    if (await returnButton.isVisible()) {
      await returnButton.click();

      // Buscar input de evidencia de devolución
      const fileInput = page.locator('input[type="file"]').last();

      if (await fileInput.isVisible()) {
        // TODO: Simular subida de archivo de evidencia
      }
    }
  });

  test('debe mostrar días en uso durante asignación activa', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Buscar un activo asignado
    // TODO: El activo debe mostrar "X días en uso"
    await expect(page.getByText(/\d+ día[s]? en uso/i).first()).toBeVisible();
  });

  test('debe registrar usuario que asigna y recibe', async ({ page }) => {
    await page.waitForTimeout(1500);

    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();

      // Llenar datos mínimos
      await page.getByLabel(/responsable/i).fill('Test User');

      // Confirmar
      await page.getByRole('button', { name: /confirmar|asignar/i }).last().click();
      await page.waitForTimeout(2000);

      // TODO: Verificar en el historial que se guardó quién hizo la asignación
    }
  });

  test('debe manejar error de API al asignar', async ({ page }) => {
    // Mock de error
    await page.route('**/api/activos/asignar', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Error simulado' })
      });
    });

    await page.waitForTimeout(1500);

    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();
      await page.getByLabel(/responsable/i).fill('Test Error');
      await page.getByRole('button', { name: /confirmar|asignar/i }).last().click();

      // Verificar mensaje de error
      await expect(page.getByText(/error|falló/i)).toBeVisible();
    }
  });

  test('debe prevenir asignación duplicada', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Intentar asignar un activo ya asignado
    // TODO: El botón de asignar debe estar deshabilitado o no visible
    // para activos que ya tienen responsable asignado
  });

  test('debe actualizar ubicación al asignar', async ({ page }) => {
    await page.waitForTimeout(1500);

    const assignButton = page.getByRole('button', { name: /asignar/i }).first();

    if (await assignButton.isVisible()) {
      await assignButton.click();

      // Llenar datos básicos
      await page.getByLabel(/responsable/i).fill('Test User');

      // Seleccionar ubicación destino
      // TODO: Implementar selector de ubicación
      // La ubicación actual del activo debe actualizarse

      await page.getByRole('button', { name: /confirmar|asignar/i }).last().click();
      await page.waitForTimeout(2000);

      // TODO: Verificar que la ubicación del activo cambió
    }
  });
});
