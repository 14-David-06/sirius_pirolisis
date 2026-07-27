import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de Playwright para Tests E2E
 * Módulo: Gestión de Activos Fijos
 */

export default defineConfig({
  testDir: './e2e',

  // Timeout máximo por test (60 segundos)
  timeout: 60 * 1000,

  // Esperar a que los elementos estén listos antes de interactuar
  expect: {
    timeout: 10 * 1000,
  },

  // Ejecutar tests en paralelo
  fullyParallel: true,

  // Fallar si dejaste un test.only() por error
  forbidOnly: !!process.env.CI,

  // Reintentar tests fallidos una vez
  retries: process.env.CI ? 2 : 1,

  // Número de workers (tests en paralelo)
  workers: process.env.CI ? 1 : undefined,

  // Reporter: HTML para local, GitHub Actions para CI
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Configuración compartida para todos los tests
  use: {
    // Base URL de la aplicación
    baseURL: 'http://localhost:3000',

    // Capturar traces en fallo
    trace: 'on-first-retry',

    // Screenshots en fallo
    screenshot: 'only-on-failure',

    // Video solo en fallo
    video: 'retain-on-failure',

    // Timeout de navegación
    navigationTimeout: 30 * 1000,
  },

  // Configuración de proyectos (navegadores)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Tests móviles
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Servidor de desarrollo
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
