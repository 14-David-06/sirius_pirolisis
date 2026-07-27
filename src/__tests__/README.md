# Tests Unitarios - Módulo de Activos Fijos

Este directorio contiene los tests unitarios para el módulo de Gestión de Activos Fijos de Sirius.

## 📁 Estructura

```
__tests__/
├── api/
│   └── activos/
│       ├── create.test.ts        # Tests para POST /api/activos/create
│       ├── list.test.ts          # Tests para GET /api/activos/list
│       └── estadisticas.test.ts  # Tests para GET /api/activos/estadisticas
├── hooks/
│   └── useActivos.test.ts        # Tests para hook useActivos
├── components/
│   └── activos/
│       └── RegistrarActivoForm.test.tsx  # Tests para formulario de registro
└── README.md
```

## 🧪 Framework de Testing

- **Jest**: Framework de testing principal
- **React Testing Library**: Para testing de componentes React
- **@testing-library/user-event**: Para simular interacciones de usuario

## 🚀 Comandos de Testing

### Ejecutar todos los tests
```bash
npm test
```

### Ejecutar tests en modo watch
```bash
npm run test:watch
```

### Ejecutar tests con cobertura
```bash
npm run test:coverage
```

### Ejecutar tests específicos
```bash
# Solo tests de APIs
npm test -- api

# Solo tests de hooks
npm test -- hooks

# Solo tests de componentes
npm test -- components

# Un archivo específico
npm test -- create.test.ts
```

## 📊 Cobertura de Tests

### APIs Backend (5 tests principales)

#### ✅ POST /api/activos/create
- Crear activo con datos válidos
- Validación de campos requeridos (nombre, tipo, ubicación)
- Manejo de errores de Airtable
- Inclusión de campos opcionales
- Casos de error 400, 422

#### ✅ GET /api/activos/list
- Listar todos los activos
- Filtrado por estado operativo
- Filtrado por categoría
- Búsqueda por texto
- Filtrado de activos próximos a vencer
- Manejo de lista vacía
- Manejo de errores 401

#### ✅ GET /api/activos/estadisticas
- Cálculo de estadísticas totales
- Conteo por estado operativo
- Cálculo de valor total
- Conteo de asignados vs disponibles
- Manejo de valores null/undefined
- Cálculo de porcentajes

### Hooks (1 hook principal)

#### ✅ useActivos
- Carga exitosa de datos
- Manejo de errores
- Aplicación de filtros
- Cálculo de estadísticas
- Obtención de activos disponibles
- Conteo por categoría
- Identificación de vencimientos próximos
- Búsqueda por texto

### Componentes (1 componente principal)

#### ✅ RegistrarActivoForm
- Renderizado correcto del formulario
- Validación de campos requeridos
- Envío de formulario con datos válidos
- Cancelación del formulario
- Manejo de errores de registro
- Validación de valores negativos
- Estados de carga

## 🎯 Tests Críticos Cubiertos

| Categoría | Cobertura | Descripción |
|-----------|-----------|-------------|
| **APIs** | Alta | Create, List, Estadísticas |
| **Hooks** | Alta | useActivos completo |
| **Componentes** | Media | Formulario de registro |
| **Validaciones** | Alta | Campos requeridos y tipos |
| **Errores** | Alta | Manejo de errores de API |

## ⚠️ Limitaciones Conocidas

1. **Componentes de Selectores Personalizados**: Los tests del formulario tienen limitaciones con `SimpleTipoActivoSelector` y `SimpleUbicacionSelector` debido a su complejidad de interacción.

2. **Tests de Integración**: Estos son tests unitarios. Los tests E2E se encuentran en la Fase 15.

3. **Mocks de Airtable**: Las pruebas usan mocks de las llamadas a Airtable. No hacen llamadas reales a la API.

## 📝 Escribir Nuevos Tests

### Estructura básica de un test de API

```typescript
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tu-endpoint/route';

global.fetch = jest.fn();

describe('GET /api/tu-endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup environment
  });

  it('debe hacer algo específico', async () => {
    // Mock de respuesta
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'mock' }),
    });

    const request = new NextRequest('http://localhost/api/tu-endpoint');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toBeDefined();
  });
});
```

### Estructura básica de un test de hook

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { tuHook } from '@/lib/tuHook';

describe('tuHook', () => {
  it('debe retornar datos correctamente', async () => {
    const { result } = renderHook(() => tuHook());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
  });
});
```

### Estructura básica de un test de componente

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import TuComponente from '@/components/TuComponente';

describe('TuComponente', () => {
  it('debe renderizar correctamente', () => {
    render(<TuComponente />);
    expect(screen.getByText('Texto esperado')).toBeInTheDocument();
  });
});
```

## 🐛 Debugging de Tests

### Ver logs durante los tests
```bash
npm test -- --verbose
```

### Ejecutar un solo test
```typescript
it.only('este test se ejecutará solo', () => {
  // ...
});
```

### Saltar un test temporalmente
```typescript
it.skip('este test se saltará', () => {
  // ...
});
```

## ✅ Checklist de Nuevos Tests

Cuando agregues nuevos tests, asegúrate de:

- [ ] Usar nombres descriptivos (`debe hacer X cuando Y`)
- [ ] Limpiar mocks en `beforeEach`
- [ ] Probar casos de éxito Y error
- [ ] Validar tanto inputs como outputs
- [ ] Mantener tests independientes
- [ ] Documentar casos especiales
- [ ] Actualizar este README si es necesario

## 📚 Recursos

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Última actualización**: Julio 2026  
**Módulo**: Gestión de Activos Fijos  
**Fase**: 14 - Tests Unitarios
