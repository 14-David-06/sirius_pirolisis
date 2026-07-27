# Checklist de Validación Manual - Activos Fijos

## 📋 Instrucciones

Este checklist complementa los tests automatizados E2E. Ejecutar manualmente antes de considerar el módulo completamente validado.

**Tester**: _______________  
**Fecha**: _______________  
**Versión**: _______________

---

## ✅ 1. Funcionalidad Core

### Registro de Activos
- [ ] Se puede registrar un activo con solo los campos mínimos (nombre, tipo, ubicación)
- [ ] Se puede registrar un activo con todos los campos completos
- [ ] El código de activo se genera automáticamente (ACT-XXX)
- [ ] Las validaciones funcionan correctamente:
  - [ ] Nombre requerido
  - [ ] Tipo de activo requerido
  - [ ] Ubicación requerida
  - [ ] Valor no negativo
- [ ] Los selectores de Tipo y Ubicación cargan datos de Airtable
- [ ] Se puede seleccionar múltiples tipos de activo
- [ ] El estado por defecto es "Operativo"
- [ ] El modal se cierra después de guardar exitosamente
- [ ] Aparece mensaje de éxito/error apropiado

### Listado y Filtros
- [ ] La tabla muestra todos los activos registrados
- [ ] La búsqueda por texto funciona correctamente
- [ ] Los filtros funcionan:
  - [ ] Filtro por Estado Operativo
  - [ ] Filtro por Categoría
  - [ ] Filtro por Ubicación
  - [ ] Filtro de "Solo Disponibles"
  - [ ] Filtro de "Próximos a Vencer"
- [ ] Se pueden combinar múltiples filtros
- [ ] El botón "Limpiar" resetea todos los filtros
- [ ] El contador de activos es correcto
- [ ] La paginación funciona (si aplica)
- [ ] El ordenamiento por columnas funciona

### Asignación de Activos
- [ ] Solo activos disponibles muestran botón "Asignar"
- [ ] El formulario de asignación valida:
  - [ ] Responsable requerido
  - [ ] Área (si es requerida)
  - [ ] Ubicación destino
- [ ] Se puede subir evidencia fotográfica (asignación)
- [ ] La asignación se registra correctamente en Airtable
- [ ] El activo cambia de estado después de asignar
- [ ] La fecha de asignación se registra
- [ ] El usuario que asigna se guarda

### Devolución de Activos
- [ ] Solo activos asignados muestran botón "Devolver"
- [ ] El formulario de devolución valida:
  - [ ] Condición al devolver
  - [ ] Observaciones (opcional)
- [ ] Se puede subir evidencia fotográfica (devolución)
- [ ] Se puede marcar "Requiere Mantenimiento"
- [ ] La devolución se registra correctamente
- [ ] El activo vuelve a estado "Disponible" (o "En Mantenimiento")
- [ ] Se calcula correctamente los días en uso
- [ ] El usuario que recibe se guarda

### Estadísticas y Dashboard
- [ ] Se muestran todas las métricas principales:
  - [ ] Total de activos
  - [ ] Operativos
  - [ ] En mantenimiento
  - [ ] Disponibles en almacén
  - [ ] Asignados
  - [ ] Valor total (COP)
- [ ] Los números son correctos (verificar contra Airtable)
- [ ] Las alertas de vencimiento funcionan
- [ ] Las alertas de mantenimiento funcionan
- [ ] Los porcentajes suman correctamente
- [ ] Los gráficos se visualizan bien

---

## 🎨 2. UI/UX

### Diseño Visual
- [ ] El glassmorphism se ve bien (backdrop blur, transparencias)
- [ ] Los colores contrastan correctamente
- [ ] Los íconos son apropiados y consistentes
- [ ] Los botones tienen estados hover/active visibles
- [ ] Las tarjetas tienen sombras y bordes correctos
- [ ] Los modales centran correctamente
- [ ] Los estados de loading son visibles

### Responsive Design
- [ ] **Desktop (1920x1080)**:
  - [ ] Layout de 2-3 columnas funciona
  - [ ] Las tarjetas se ven bien
  - [ ] La tabla no se desborda
- [ ] **Tablet (768x1024)**:
  - [ ] Se adapta a 1-2 columnas
  - [ ] La navegación funciona
  - [ ] Los modales se ajustan
- [ ] **Mobile (375x667)**:
  - [ ] Todo en 1 columna
  - [ ] Botones son tocables (min 44px)
  - [ ] La tabla hace scroll horizontal
  - [ ] Los selectores funcionan en touch

### Accesibilidad
- [ ] Todos los inputs tienen labels
- [ ] Los botones tienen texto descriptivo
- [ ] El contraste de texto cumple WCAG AA
- [ ] Se puede navegar con teclado (Tab)
- [ ] Los estados de error son claros
- [ ] Los mensajes de éxito/error son descriptivos

---

## 🔌 3. Integración con Airtable

### Lectura de Datos
- [ ] Los activos se cargan desde Airtable correctamente
- [ ] Los tipos de activo se cargan dinámicamente
- [ ] Las ubicaciones se cargan dinámicamente
- [ ] Los lookups funcionan (categoría desde tipo)
- [ ] Los rollups funcionan (última asignación)

### Escritura de Datos
- [ ] Los activos nuevos se crean en la tabla correcta
- [ ] Todos los campos se mapean correctamente
- [ ] Los linked records se vinculan bien
- [ ] Las asignaciones se crean en tabla Asignaciones
- [ ] Las fechas se guardan en formato correcto (ISO)
- [ ] Los valores numéricos se guardan sin formato

### Manejo de Errores
- [ ] Error 401 (token inválido) se maneja
- [ ] Error 422 (campo inválido) se maneja
- [ ] Error 429 (rate limit) se maneja
- [ ] Error 500 (servidor) se maneja
- [ ] Timeout de red se maneja
- [ ] Se muestran mensajes de error claros al usuario

---

## 🔐 4. Seguridad y Autenticación

### TurnoProtection
- [ ] Solo usuarios autenticados pueden acceder
- [ ] El turno/usuario se valida correctamente
- [ ] El nombre del usuario se captura en registros
- [ ] El logout funciona correctamente

### Validación de Datos
- [ ] No se puede inyectar HTML en campos de texto
- [ ] No se puede ingresar SQL en los campos
- [ ] Los valores numéricos solo aceptan números
- [ ] Las fechas solo aceptan formato válido
- [ ] Los archivos subidos tienen límite de tamaño

---

## 🚀 5. Performance

### Tiempos de Carga
- [ ] La página inicial carga en < 3 segundos
- [ ] Las estadísticas cargan en < 2 segundos
- [ ] El listado de activos carga en < 2 segundos
- [ ] Los selectores cargan en < 1 segundo
- [ ] No hay "lag" al escribir en búsqueda

### Optimizaciones
- [ ] Las imágenes están optimizadas
- [ ] No hay re-renders innecesarios (React DevTools)
- [ ] Los fetch no se duplican
- [ ] El scroll es suave
- [ ] No hay memory leaks (DevTools Memory)

---

## 🔄 6. Navegación e Integración

### Navegación entre Módulos
- [ ] El link en Navbar funciona
- [ ] El banner en Inventario funciona
- [ ] Se puede volver atrás desde Activos
- [ ] El estado de navegación se mantiene
- [ ] No hay errores 404

### Separación con Inventario
- [ ] El inventario NO muestra "Herramientas"
- [ ] El inventario NO muestra "Equipos"
- [ ] Activos Fijos tiene sus propias categorías
- [ ] No hay conflicto de datos entre módulos
- [ ] Los links cruzados funcionan

---

## 📊 7. Datos de Prueba

### Escenarios a Probar

#### Activo Simple
- [ ] Nombre: "Martillo Stanley"
- [ ] Tipo: Herramientas Manuales
- [ ] Estado: Operativo
- [ ] Ubicación: Planta Pirólisis

#### Activo Completo
- [ ] Nombre: "Laptop Dell Latitude 5420"
- [ ] Tipo: Computador
- [ ] Estado: Operativo
- [ ] Número de Serie: SN123456789
- [ ] Marca: Dell
- [ ] Modelo: Latitude 5420
- [ ] Valor: $3.500.000
- [ ] Fecha Adquisición: 2026-01-15

#### Activo con Vencimiento
- [ ] Nombre: "Extintor CO2 5kg"
- [ ] Tipo: Extintor
- [ ] Fecha Vencimiento: (30 días en el futuro)
- [ ] Debe aparecer en alertas

#### Flujo de Asignación Completo
1. [ ] Crear activo "Taladro Bosch GSB 13"
2. [ ] Asignar a "Juan Pérez" área "Mantenimiento"
3. [ ] Verificar en tabla que está asignado
4. [ ] Devolver con observaciones "Todo OK"
5. [ ] Verificar que volvió a Disponible
6. [ ] Verificar historial de asignación

---

## 🐛 8. Casos Edge

### Datos Extremos
- [ ] Nombre muy largo (>100 caracteres)
- [ ] Valor muy grande ($999.999.999.999)
- [ ] Fecha en el pasado lejano (1900)
- [ ] Fecha en el futuro lejano (2100)
- [ ] Caracteres especiales en nombre (ñ, á, @, #)
- [ ] Emojis en campos de texto

### Condiciones Especiales
- [ ] Sin conexión a internet
- [ ] Airtable temporalmente no disponible
- [ ] Usuario sin permisos
- [ ] Base de datos vacía (0 activos)
- [ ] Muchos activos (>1000)
- [ ] Subir archivo muy grande (>10MB)

---

## ✅ Criterios de Aceptación

Para considerar la validación completa:

- [ ] **100%** de Funcionalidad Core pasada
- [ ] **95%** de UI/UX pasada
- [ ] **100%** de Integración con Airtable pasada
- [ ] **100%** de Seguridad pasada
- [ ] **90%** de Performance pasada
- [ ] **100%** de Navegación pasada
- [ ] **80%** de Casos Edge pasados

**Total**: _____ / _____ checks pasados

---

## 📝 Bugs Encontrados

| # | Descripción | Severidad | Estado |
|---|-------------|-----------|--------|
| 1 | | Alta/Media/Baja | Abierto/Cerrado |
| 2 | | | |
| 3 | | | |

---

## 📸 Evidencia

Adjuntar screenshots de:
- [ ] Dashboard principal
- [ ] Formulario de registro completo
- [ ] Listado con filtros aplicados
- [ ] Modal de asignación
- [ ] Vista mobile (responsive)
- [ ] Mensaje de error
- [ ] Mensaje de éxito

---

**Validado por**: _______________  
**Firma**: _______________  
**Fecha**: _______________
