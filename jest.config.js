// jest.config.js
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/src/$1',
    // `import 'server-only'` lanza fuera de un Server Component, y los módulos
    // `*.server.ts` (enlace de recepción, correo, sesión) se prueban en Node.
    // next/jest ya lo mapea hoy; se deja explícito para que esas pruebas no
    // dependan de un detalle interno de next/jest. Es el mismo archivo vacío que
    // usa Next con la condición `react-server`.
    '^server-only$': '<rootDir>/node_modules/server-only/empty.js',
  },
  testEnvironment: 'jest-environment-jsdom',
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)