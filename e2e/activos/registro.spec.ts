/**
 * Tests E2E - Flujo de Registro de Activos Fijos
 *
 * Cubre el flujo completo de registro:
 * 1. Navegar a página de activos
 * 2. Abrir modal de registro
 * 3. Llenar formulario
 * 4. Guardar activo
 * 5. Verificar que aparece en listado
 */

import { test, expect } from '@playwright/test';

test.describe('Registro de Activos Fijos', () => {
  test.beforeEach(async ({ page }) => {
    // Navegar a la página de activos
    await page.goto('/activos-fijos');

    // TODO: Implementar autenticación si es necesario
    // await login(page, 'test@siriusregenerative.com', 'password');
  });

  test('debe mostrar la página de activos correctamente', async ({ page }) => {
    // Verificar título
    await expect(page.getByText('Gestión de Activos Fijos')).toBeVisible();

    // Verificar botón de registro
    await expect(page.getByRole('button', { name: /registrar activo/i })).toBeVisible();

    // Verificar secciones principales
    await expect(page.getByText('Estadísticas')).toBeVisible();
  });

  test('debe abrir el modal de registro al hacer click', async ({ page }) => {
    // Click en botón registrar
    await page.getByRole('button', { name: /registrar activo/i }).click();

    // Verificar que el modal se abre
    await expect(page.getByText('📋 Información Básica')).toBeVisible();
    await expect(page.getByText('📍 Estado y Ubicación')).toBeVisible();
    await expect(page.getByText('🔖 Identificación')).toBeVisible();

    // Verificar que los botones están presentes
    await expect(page.getByRole('button', { name: /cancelar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /registrar activo/i })).toBeVisible();
  });

  test('debe validar campos requeridos', async ({ page }) => {
    // Abrir modal
    await page.getByRole('button', { name: /registrar activo/i }).first().click();

    // Intentar guardar sin llenar campos
    await page.getByRole('button', { name: /registrar activo/i }).last().click();

    // Verificar mensajes de error
    await expect(page.getByText(/nombre del activo es requerido/i)).toBeVisible();
  });

  test('debe registrar un activo completamente (flujo happy path)', async ({ page }) => {
    // Abrir modal de registro
    await page.getByRole('button', { name: /registrar activo/i }).first().click();

    // Esperar a que el modal esté visible
    await page.waitForSelector('text=📋 Información Básica');

    // Llenar nombre del activo
    await page.getByLabel(/nombre del activo/i).fill('Taladro E2E Test ' + Date.now());

    // Llenar descripción
    await page.getByPlaceholder(/descripción detallada/i).fill('Activo de prueba E2E');

    // Seleccionar tipo de activo
    // TODO: Interactuar con el selector personalizado
    // await page.getByText('Selecciona tipos de activo').click();
    // await page.getByText('Herramientas Manuales').click();

    // Seleccionar estado operativo
    await page.getByLabel(/estado operativo/i).selectOption('Operativo');

    // Seleccionar ubicación
    // TODO: Interactuar con el selector personalizado de ubicaciones

    // Llenar campos opcionales
    await page.getByLabel(/número de serie/i).fill('SN-' + Date.now());
    await page.getByLabel(/marca/i).fill('Bosch');
    await page.getByLabel(/modelo/i).fill('GSB 13 RE');

    // Llenar valor de adquisición
    await page.getByLabel(/valor de adquisición/i).fill('350000');

    // Guardar
    await page.getByRole('button', { name: /registrar activo/i }).last().click();

    // Esperar mensaje de éxito o cierre del modal
    await page.waitForTimeout(2000);

    // Verificar que el modal se cerró
    await expect(page.getByText('📋 Información Básica')).not.toBeVisible();

    // TODO: Verificar que el activo aparece en el listado
    // await expect(page.getByText('Taladro E2E Test')).toBeVisible();
  });

  test('debe cancelar el registro sin guardar', async ({ page }) => {
    // Abrir modal
    await page.getByRole('button', { name: /registrar activo/i }).first().click();

    // Llenar algunos campos
    await page.getByLabel(/nombre del activo/i).fill('Este activo no se guardará');

    // Cancelar
    await page.getByRole('button', { name: /cancelar/i }).click();

    // Verificar que el modal se cerró
    await expect(page.getByText('📋 Información Básica')).not.toBeVisible();

    // Verificar que el activo NO aparece en el listado
    await expect(page.getByText('Este activo no se guardará')).not.toBeVisible();
  });

  test('debe manejar errores de API correctamente', async ({ page }) => {
    // Mock de error de API
    await page.route('**/api/activos/create', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Error simulado de servidor' })
      });
    });

    // Abrir modal y llenar formulario
    await page.getByRole('button', { name: /registrar activo/i }).first().click();
    await page.getByLabel(/nombre del activo/i).fill('Test Error');

    // Intentar guardar
    await page.getByRole('button', { name: /registrar activo/i }).last().click();

    // Verificar mensaje de error
    await expect(page.getByText(/error/i)).toBeVisible();
  });

  test('debe validar valor de adquisición negativo', async ({ page }) => {
    await page.getByRole('button', { name: /registrar activo/i }).first().click();

    // Llenar nombre
    await page.getByLabel(/nombre del activo/i).fill('Test Validación');

    // Intentar poner valor negativo
    await page.getByLabel(/valor de adquisición/i).fill('-1000');

    // Intentar guardar
    await page.getByRole('button', { name: /registrar activo/i }).last().click();

    // Verificar error de validación
    await expect(page.getByText(/el valor no puede ser negativo/i)).toBeVisible();
  });

  test('debe permitir registrar activo sin campos opcionales', async ({ page }) => {
    await page.getByRole('button', { name: /registrar activo/i }).first().click();

    // Llenar SOLO campos requeridos
    await page.getByLabel(/nombre del activo/i).fill('Activo Mínimo ' + Date.now());

    // TODO: Seleccionar tipo y ubicación (requeridos)

    // Guardar sin llenar campos opcionales
    await page.getByRole('button', { name: /registrar activo/i }).last().click();

    // Esperar que se guarde exitosamente
    await page.waitForTimeout(2000);

    // El modal debe cerrarse
    await expect(page.getByText('📋 Información Básica')).not.toBeVisible();
  });

  test('debe mostrar loading mientras guarda', async ({ page }) => {
    // Mock de respuesta lenta
    await page.route('**/api/activos/create', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'test' } })
      });
    });

    await page.getByRole('button', { name: /registrar activo/i }).first().click();
    await page.getByLabel(/nombre del activo/i).fill('Test Loading');

    // Click en guardar
    await page.getByRole('button', { name: /registrar activo/i }).last().click();

    // Verificar estado de loading
    await expect(page.getByText(/registrando.../i)).toBeVisible();

    // Esperar a que termine
    await page.waitForTimeout(3000);

    // El loading debe desaparecer
    await expect(page.getByText(/registrando.../i)).not.toBeVisible();
  });
});
