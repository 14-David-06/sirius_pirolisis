---
name: project-control-horas-page
description: /control-horas page — frontend for nómina panel, maps to Airtable Novedades Nomina base
metadata:
  type: project
---

Page at: src/app/control-horas/page.tsx
Navbar entry: "Gestión" category → "Control de Horas"

**Why:** Manages HR novelties, permissions and vacations for Sirius employees.
**How to apply:** When adding backend, create API routes that map exactly to the Airtable field names in [[project-airtable-nomina]].

## Page structure
- Tab "Empleados": Cards per employee from Nomina Sirius, showing horas permiso concedidas, días vacaciones, novedades count and valor hora
- Tab "Permisos": Lists Solicitud_Permiso records; can approve/reject (updates Estado_Permiso)
- Tab "Novedades": Lists Reportes Novedades Nomina; can change Estado del Registro via dropdown
- Tab "Vacaciones": Lists Solicitud_Vacaciones; can approve/reject (updates Estado Solicitud)
- Modal "Solicitar Permiso": Creates new Solicitud_Permiso record

## Backend plan (pending)
- GET /api/nomina/empleados → Nomina Sirius table
- GET /api/nomina/permisos → Solicitud_Permiso table
- PATCH /api/nomina/permisos/[id] → update Estado_Permiso
- GET /api/nomina/novedades → Reportes Novedades Nomina
- PATCH /api/nomina/novedades/[id] → update Estado del Registro
- GET /api/nomina/vacaciones → Solicitud_Vacaciones
- PATCH /api/nomina/vacaciones/[id] → update Estado Solicitud
- POST /api/nomina/permisos → create new Solicitud_Permiso
