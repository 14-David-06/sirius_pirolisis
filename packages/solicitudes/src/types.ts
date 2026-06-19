export type SiriusEmployee = {
  idCore: string;
  nombre: string;
  cedula: string;
};

// Función que cada app inyecta para resolver la sesión activa.
// El paquete no sabe qué sistema de auth usa la app consumidora.
export type ResolvePayload = () => Promise<SiriusEmployee | null>;
