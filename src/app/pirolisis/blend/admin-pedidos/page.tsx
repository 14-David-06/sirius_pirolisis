"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TurnoProtection from "@/components/TurnoProtection";

// ─── Constantes remisiones ────────────────────────────────────────────────────
const FACTOR_CO2 = 2.5;
const ESTADO_PEDIDO_VALIDOS_REM = ["Aprobado", "En Producción", "Listo Despacho"];
const ESTADO_BADGE_REM: Record<string, string> = {
  Borrador: "bg-gray-500/20 text-gray-300 border-gray-500/40",
  Generada: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Firmada: "bg-green-500/20 text-green-300 border-green-500/40",
  Despachado: "bg-teal-500/20 text-teal-300 border-teal-500/40",
  Cancelada: "bg-red-500/20 text-red-300 border-red-500/40",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Cliente {
  recordId: string;
  nombre: string;
  nit: string;
  ciudad: string;
  idClienteCore?: string;
}


const EMPAQUE_OPTIONS = ["Big Bag", "Lona", "Bulto", "Otro"] as const;
type Empaque = typeof EMPAQUE_OPTIONS[number];

interface Producto {
  recordId: string;
  nombre: string;
  codigo: string;
  precioUnitario: number;
  unidadBase: string;
  categoria: string;
  abreviatura: string;
}

const BG_IMAGE =
  "https://res.cloudinary.com/dk0k0bfet/image/upload/v1748114941/ChatGPT_Image_May_20_2025_01_34_17_AM_phafxp.png";

const ESTADOS = [
  "Todos",
  "Recibido",
  "Pendiente Stock",
  "Aprobado",
  "En Producción",
  "Listo Despacho",
  "Despachado",
  "Cancelado",
] as const;

const ESTADO_COLORS: Record<string, string> = {
  "Recibido":       "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "Pendiente Stock":"bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  "Aprobado":       "bg-green-500/20 text-green-300 border-green-500/40",
  "En Producción":  "bg-purple-500/20 text-purple-300 border-purple-500/40",
  "Listo Despacho": "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  "Despachado":     "bg-teal-500/20 text-teal-300 border-teal-500/40",
  "Cancelado":      "bg-red-500/20 text-red-300 border-red-500/40",
};

// Transiciones permitidas por estado
const TRANSICIONES: Record<string, string[]> = {
  "Recibido":       ["Aprobado", "Pendiente Stock", "Cancelado"],
  "Pendiente Stock":["Aprobado", "Cancelado"],
  "Aprobado":       ["En Producción", "Cancelado"],
  "En Producción":  ["Listo Despacho"],
  "Listo Despacho": ["Despachado"],
  "Despachado":     [],
  "Cancelado":      [],
};

interface Pedido {
  id: string;
  fields: Record<string, unknown>;
}

interface Bache {
  id: string;
  fields: Record<string, unknown>;
}

interface Remision {
  id: string;
  fields: Record<string, unknown>;
}

interface PersonaCliente {
  recordId: string;
  nombre: string;
  cedula: string;
  email: string;
  emailNotificacion: string;
  telefono: string;
  cargo: string;
}

export default function AdminPedidosBlendPage() {
  // ── Lista de pedidos ──────────────────────────────────────────────────────
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [accionando, setAccionando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);
  const [modalPedido, setModalPedido] = useState<Pedido | null>(null);

  // ── Modal stock insuficiente ──────────────────────────────────────────────
  interface InsumoStock { necesario: number; stock: number; faltante: number; }
  const [stockModal, setStockModal] = useState<{
    pedidoId: string;
    abono4g: InsumoStock;
    biologicos: InsumoStock;
  } | null>(null);
  const [entradaKg4g, setEntradaKg4g] = useState("");
  const [entradaKgBio, setEntradaKgBio] = useState("");
  const [registrandoEntradas, setRegistrandoEntradas] = useState(false);
  const [errorEntradas, setErrorEntradas] = useState<string | null>(null);

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"pedidos" | "remisiones">("pedidos");

  // ── Estado Remisiones ─────────────────────────────────────────────────────
  const [remisiones, setRemisiones] = useState<Remision[]>([]);
  const [loadingRemisiones, setLoadingRemisiones] = useState(false);
  const [baches, setBaches] = useState<Bache[]>([]);
  const [personal, setPersonal] = useState<PersonaCliente[]>([]);
  const [pedidosValidos, setPedidosValidos] = useState<Pedido[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [showRemisionForm, setShowRemisionForm] = useState(false);
  const [submittingRemision, setSubmittingRemision] = useState(false);
  const [submitRemisionError, setSubmitRemisionError] = useState<string | null>(null);
  const [submitRemisionSuccess, setSubmitRemisionSuccess] = useState<string | null>(null);
  const [selectedPedidoIdRem, setSelectedPedidoIdRem] = useState("");
  const [selectedClienteIdRem, setSelectedClienteIdRem] = useState("");
  const [selectedPersonaRecibeId, setSelectedPersonaRecibeId] = useState("");
  const [selectedBachesIds, setSelectedBachesIds] = useState<string[]>([]);
  const [remisionFormData, setRemisionFormData] = useState({
    produccionId: "",
    cliente: "",
    nitCcCliente: "",
    fechaEvento: new Date().toISOString().split("T")[0],
    realizaRegistro: "",
    responsableEntrega: "",
    numDocEntrega: "",
    telefonoEntrega: "",
    emailEntrega: "",
    responsableRecibe: "",
    numDocRecibe: "",
    telefonoRecibe: "",
    emailRecibe: "",
    kgBiocharPuro: "",
    kgAbono4g: "",
    kgAgua: "",
    kgBiologicos: "",
    observaciones: "",
  });

  // ── Formulario Agendar Pedido ─────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState("");
  const [selectedProductoId, setSelectedProductoId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Edición de pedido (PATCH a Sirius Pedidos Core)
  const [editPedido, setEditPedido] = useState<Pedido | null>(null);
  const [editFormData, setEditFormData] = useState<{
    kgSolicitados: string;
    empaque: Empaque | "";
    fechaRequerida: string;
    observaciones: string;
  }>({ kgSolicitados: "", empaque: "", fechaRequerida: "", observaciones: "" });
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Estado de producción por pedido (para habilitar botón Remisión cuando completa)
  const [produccionStatus, setProduccionStatus] = useState<Record<string, { completa: boolean; kg_producido: number; kg_solicitado: number; falta: number }>>({});
  const [formData, setFormData] = useState({
    cliente: "",
    nitCcCliente: "",
    idClienteCore: "",
    producto: "",
    codigoProducto: "",
    precioUnitario: "",
    unidadBase: "",
    kgSolicitados: "",
    empaque: "" as Empaque | "",
    fechaPedido: new Date().toISOString().split("T")[0],
    fechaRequerida: "",
    observaciones: "",
    realizaRegistro: "",
  });

  const fetchPedidos = useCallback(async (estado?: string) => {
    setLoading(true);
    try {
      const url =
        estado && estado !== "Todos"
          ? `/api/pirolisis/blend/pedidos?estado=${encodeURIComponent(estado)}`
          : "/api/pirolisis/blend/pedidos";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && Array.isArray(data.records)) {
        setPedidos(data.records);
      } else {
        console.error("Error al cargar pedidos:", res.status, data?.error ?? data);
        setPedidos([]);
      }
    } catch (err) {
      console.error(err);
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPedidos(filtroEstado);
  }, [fetchPedidos, filtroEstado]);

  // Cargar estado de producción para pedidos en producción o listos para despacho
  useEffect(() => {
    const candidatos = pedidos.filter(p => {
      const e = String(p.fields["Estado"] ?? "");
      return e === "En Producción" || e === "Listo Despacho";
    });
    candidatos.forEach(p => {
      if (!produccionStatus[p.id]) verificarProduccionStatus(p.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos]);

  // ── Cargar clientes y productos al montar ───────────────────────────────
  const fetchClientes = useCallback(async () => {
    setLoadingClientes(true);
    try {
      const res = await fetch("/api/pirolisis/blend/clientes");
      const data = await res.json();
      setClientes(Array.isArray(data.clientes) ? data.clientes : []);
    } catch (e) {
      console.error("Error cargando clientes:", e);
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  const fetchProductos = useCallback(async () => {
    setLoadingProductos(true);
    try {
      const res = await fetch("/api/pirolisis/blend/productos");
      const data = await res.json();
      setProductos(Array.isArray(data.productos) ? data.productos : []);
    } catch (e) {
      console.error("Error cargando productos:", e);
    } finally {
      setLoadingProductos(false);
    }
  }, []);

  useEffect(() => { fetchClientes(); fetchProductos(); }, [fetchClientes, fetchProductos]);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("userSession") || "{}");
      const nombre = s?.user?.Nombre || "";
      if (nombre) setFormData(prev => ({ ...prev, realizaRegistro: nombre }));
    } catch { /* sin sesión */ }
  }, []);

  const handleClienteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recordId = e.target.value;
    setSelectedClienteId(recordId);
    if (!recordId) { setFormData(prev => ({ ...prev, cliente: "", nitCcCliente: "" })); return; }
    const c = clientes.find(cl => cl.recordId === recordId);
    if (c) setFormData(prev => ({ ...prev, cliente: c.nombre, nitCcCliente: c.nit, idClienteCore: c.idClienteCore || '' }));
  };

  const handleProductoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recordId = e.target.value;
    setSelectedProductoId(recordId);
    if (!recordId) {
      setFormData(prev => ({ ...prev, producto: "", codigoProducto: "", precioUnitario: "", unidadBase: "" }));
      return;
    }
    const p = productos.find(pr => pr.recordId === recordId);
    if (p) setFormData(prev => ({
      ...prev,
      producto: p.nombre,
      codigoProducto: p.codigo,
      precioUnitario: String(p.precioUnitario),
      unidadBase: p.unidadBase,
    }));
  };

  const resetForm = () => {
    setFormData({
      cliente: "", nitCcCliente: "", idClienteCore: "", producto: "", codigoProducto: "", precioUnitario: "", unidadBase: "",
      kgSolicitados: "", empaque: "",
      fechaPedido: new Date().toISOString().split("T")[0], fechaRequerida: "",
      observaciones: "", realizaRegistro: "",
    });
    setSelectedClienteId("");
    setSelectedProductoId("");
    setSubmitError(null); setSubmitSuccess(null); setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setSubmitError(null); setSubmitSuccess(null);
    try {
      let realizaRegistro = formData.realizaRegistro;
      if (!realizaRegistro) {
        try { const s = JSON.parse(localStorage.getItem("userSession") || "{}"); realizaRegistro = s?.user?.Nombre || ""; } catch { /* noop */ }
      }
      let usuarioId = "";
      try { const s = JSON.parse(localStorage.getItem("userSession") || "{}"); usuarioId = s?.user?.idPersonalCore || s?.user?.id || ""; } catch { /* noop */ }
      const body = {
        cliente: formData.cliente,
        kg_solicitados: parseFloat(formData.kgSolicitados),
        empaque: formData.empaque,
        fecha_pedido: formData.fechaPedido || undefined,
        fecha_requerida: formData.fechaRequerida || undefined,
        nit_cc_cliente: formData.nitCcCliente || undefined,
        observaciones: formData.observaciones || undefined,
        realiza_registro: realizaRegistro || undefined,
        // Sirius Pedidos Core
        id_cliente_core: formData.idClienteCore || undefined,
        id_usuario_responsable: usuarioId || undefined,
        // Producto (Sirius Product Core)
        producto: formData.producto || undefined,
        codigo_producto: formData.codigoProducto || undefined,
        precio_unitario: formData.precioUnitario ? parseFloat(formData.precioUnitario) : undefined,
        unidad_base: formData.unidadBase || undefined,
      };
      const res = await fetch("/api/pirolisis/blend/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = typeof data.error === 'object' ? (data.error?.message ?? JSON.stringify(data.error)) : (data.error || data.details || "Error al crear el pedido");
        setSubmitError(errMsg);
        return;
      }
      mostrarMensaje("ok", `✅ Pedido agendado para ${formData.cliente}`);
      resetForm();
      fetchPedidos(filtroEstado);
    } catch (err) {
      setSubmitError("Error de red. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const mostrarMensaje = (tipo: "ok" | "err", texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 4000);
  };

  // ── Iniciar Producción (verifica stock LOCAL y, si OK, marca pedido en Core como "En Produccion") ──
  const iniciarProduccion = async (pedidoId: string) => {
    setAccionando(pedidoId);
    try {
      const res = await fetch(`/api/pirolisis/blend/pedidos/${pedidoId}/iniciar-produccion`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        mostrarMensaje("ok", `✅ Producción iniciada — ${data.kg_total ?? ""} kg`);
        fetchPedidos(filtroEstado);
        setModalPedido(null);
      } else if (res.status === 409 && data.insumos) {
        // insumos = stockData.proporciones: { abono_4g: { kg_necesario, stock_actual }, biologicos_datalab: { ... } }
        const p = data.insumos;
        const mkInsumo = (key: string) => {
          const d = p?.[key] ?? {};
          const necesario = Number(d.kg_necesario ?? 0);
          const stock    = Number(d.stock_actual  ?? 0);
          return { necesario, stock, faltante: Math.max(0, necesario - stock) };
        };
        const abono4g    = mkInsumo("abono_4g");
        const biologicos = mkInsumo("biologicos_datalab");
        setStockModal({ pedidoId, abono4g, biologicos });
        setEntradaKg4g(abono4g.faltante > 0    ? abono4g.faltante.toFixed(2)    : "");
        setEntradaKgBio(biologicos.faltante > 0 ? biologicos.faltante.toFixed(2) : "");
        setErrorEntradas(null);
        fetchPedidos(filtroEstado);
      } else {
        const errTxt = data.mensaje
          ?? (typeof data.error === 'string' ? data.error : data.error?.message ?? JSON.stringify(data.error))
          ?? "Error al iniciar producción";
        mostrarMensaje("err", errTxt);
      }
    } catch (err) {
      mostrarMensaje("err", err instanceof Error ? err.message : "Error de red");
    } finally {
      setAccionando(null);
    }
  };

  // ── Registrar entradas de insumos faltantes y reintentar producción ──────
  const registrarEntradas = async () => {
    if (!stockModal) return;
    setRegistrandoEntradas(true);
    setErrorEntradas(null);
    const errores: string[] = [];
    try {
      const kg4g = parseFloat(entradaKg4g);
      const kgBio = parseFloat(entradaKgBio);
      if (kg4g > 0) {
        const r = await fetch("/api/pirolisis/inventario/entrada-abono4g", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cantidad_kg: kg4g, realiza_registro: "Admin Blend" }),
        });
        if (!r.ok) { const d = await r.json(); errores.push(`Abono 4G: ${d.error ?? "Error"}`); }
      }
      if (kgBio > 0) {
        const r = await fetch("/api/pirolisis/inventario/entrada-biologicos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cantidad_kg: kgBio, realiza_registro: "Admin Blend" }),
        });
        if (!r.ok) { const d = await r.json(); errores.push(`Biológicos: ${d.error ?? "Error"}`); }
      }
      if (errores.length > 0) {
        setErrorEntradas(errores.join(" | "));
      } else {
        const pedidoId = stockModal.pedidoId;
        setStockModal(null);
        await iniciarProduccion(pedidoId);
      }
    } catch (err) {
      setErrorEntradas(err instanceof Error ? err.message : "Error de red");
    } finally {
      setRegistrandoEntradas(false);
    }
  };

  // ── Abrir modal de edición ──
  const abrirEditModal = (pedido: Pedido) => {
    setEditPedido(pedido);
    setEditFormData({
      kgSolicitados: String(pedido.fields["KG Solicitados"] ?? pedido.fields["KG Total Pedido"] ?? ""),
      empaque: String(pedido.fields["Empaque"] ?? "") as Empaque | "",
      fechaRequerida: String(pedido.fields["Fecha Requerida"] ?? "").slice(0, 10),
      observaciones: String(pedido.fields["Observaciones"] ?? ""),
    });
    setEditError(null);
  };

  // ── Guardar edición ──
  const guardarEdicion = async () => {
    if (!editPedido) return;
    setSubmittingEdit(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {
        kg_solicitados: editFormData.kgSolicitados ? parseFloat(editFormData.kgSolicitados) : undefined,
        empaque: editFormData.empaque || undefined,
        fecha_requerida: editFormData.fechaRequerida || undefined,
        observaciones: editFormData.observaciones || undefined,
      };
      const res = await fetch(`/api/pirolisis/blend/pedidos/${editPedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(typeof data.error === "string" ? data.error : data.details || "Error al actualizar");
        return;
      }
      mostrarMensaje("ok", "✅ Pedido actualizado");
      setEditPedido(null);
      fetchPedidos(filtroEstado);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmittingEdit(false);
    }
  };

  // ── Verificar si la producción para un pedido está completa ──
  const verificarProduccionStatus = useCallback(async (pedidoId: string) => {
    try {
      const res = await fetch(`/api/pirolisis/blend/pedidos/${pedidoId}/produccion-status`);
      const data = await res.json();
      if (res.ok) {
        setProduccionStatus(prev => ({ ...prev, [pedidoId]: data }));
      }
    } catch {
      /* noop */
    }
  }, []);

  const pedidosFiltrados = pedidos.filter((p) => {
    const cliente = String(p.fields["Cliente"] ?? "").toLowerCase();
    const nit = String(p.fields["NIT Cliente"] ?? "").toLowerCase();
    const q = busqueda.toLowerCase();
    return cliente.includes(q) || nit.includes(q);
  });

  const conteoEstados = pedidos.reduce<Record<string, number>>((acc, p) => {
    const e = String(p.fields["Estado"] ?? "Recibido");
    acc[e] = (acc[e] ?? 0) + 1;
    return acc;
  }, {});

  // ── Funciones Remisiones ──────────────────────────────────────────────────

  const fetchRemisiones = useCallback(async () => {
    setLoadingRemisiones(true);
    try {
      const res = await fetch("/api/pirolisis/blend/remisiones");
      const data = await res.json();
      setRemisiones(Array.isArray(data.records) ? data.records : []);
    } catch (e) {
      console.error("Error cargando remisiones:", e);
    } finally {
      setLoadingRemisiones(false);
    }
  }, []);

  const fetchBaches = useCallback(async () => {
    try {
      const res = await fetch("/api/baches/disponibles");
      const data = await res.json();
      setBaches(Array.isArray(data.records) ? data.records : []);
    } catch (e) {
      console.error("Error cargando baches:", e);
    }
  }, []);

  useEffect(() => {
    fetchRemisiones();
    fetchBaches();
  }, [fetchRemisiones, fetchBaches]);

  // Sincronizar pedidosValidos cuando cambia la lista de pedidos
  useEffect(() => {
    setPedidosValidos(
      pedidos.filter(p => ESTADO_PEDIDO_VALIDOS_REM.includes(String(p.fields["Estado"] ?? "")))
    );
  }, [pedidos]);

  // Auto-rellenar realizaRegistro en form remision
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("userSession") || "{}");
      const nombre = s?.user?.Nombre || "";
      if (nombre) setRemisionFormData(prev => ({ ...prev, realizaRegistro: nombre }));
    } catch { /* sin sesión */ }
  }, []);

  // Cargar personal al cambiar cliente en form remision
  useEffect(() => {
    setPersonal([]);
    setSelectedPersonaRecibeId("");
    setRemisionFormData(prev => ({ ...prev, responsableRecibe: "", numDocRecibe: "", telefonoRecibe: "", emailRecibe: "" }));
    if (!selectedClienteIdRem) return;
    setLoadingPersonal(true);
    fetch(`/api/pirolisis/blend/clientes/${selectedClienteIdRem}/personal`)
      .then(r => r.json())
      .then(data => setPersonal(Array.isArray(data.personal) ? data.personal : []))
      .catch(e => console.error("Error cargando personal:", e))
      .finally(() => setLoadingPersonal(false));
  }, [selectedClienteIdRem]);

  const handlePedidoRemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pedidoId = e.target.value;
    setSelectedPedidoIdRem(pedidoId);
    setSelectedClienteIdRem("");
    setRemisionFormData(prev => ({ ...prev, produccionId: "", cliente: "", nitCcCliente: "" }));
    if (!pedidoId) return;
    const pedido = pedidosValidos.find(p => p.id === pedidoId);
    if (pedido) {
      const produccionOrigen = pedido.fields["Produccion Origen"];
      setRemisionFormData(prev => ({
        ...prev,
        produccionId: Array.isArray(produccionOrigen) ? (produccionOrigen[0] as string) : "",
        cliente: String(pedido.fields["Cliente"] ?? ""),
        nitCcCliente: String(pedido.fields["NIT/CC Cliente"] ?? pedido.fields["Nit"] ?? ""),
      }));
    }
  };

  const handleClienteRemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recordId = e.target.value;
    setSelectedClienteIdRem(recordId);
    if (!recordId) {
      const pedido = pedidosValidos.find(p => p.id === selectedPedidoIdRem);
      if (pedido) setRemisionFormData(prev => ({ ...prev, cliente: String(pedido.fields["Cliente"] ?? ""), nitCcCliente: String(pedido.fields["NIT/CC Cliente"] ?? "") }));
      return;
    }
    const c = clientes.find(cl => cl.recordId === recordId);
    if (c) setRemisionFormData(prev => ({ ...prev, cliente: c.nombre, nitCcCliente: c.nit }));
  };

  const handlePersonaRecibeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recordId = e.target.value;
    setSelectedPersonaRecibeId(recordId);
    if (!recordId) { setRemisionFormData(prev => ({ ...prev, responsableRecibe: "", numDocRecibe: "", telefonoRecibe: "", emailRecibe: "" })); return; }
    const p = personal.find(per => per.recordId === recordId);
    if (p) setRemisionFormData(prev => ({ ...prev, responsableRecibe: p.nombre, numDocRecibe: p.cedula, telefonoRecibe: p.telefono, emailRecibe: p.emailNotificacion || p.email }));
  };

  const toggleBache = (id: string) => {
    setSelectedBachesIds(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  const resetRemisionForm = () => {
    setRemisionFormData({
      produccionId: "", cliente: "", nitCcCliente: "",
      fechaEvento: new Date().toISOString().split("T")[0],
      realizaRegistro: remisionFormData.realizaRegistro,
      responsableEntrega: "", numDocEntrega: "", telefonoEntrega: "", emailEntrega: "",
      responsableRecibe: "", numDocRecibe: "", telefonoRecibe: "", emailRecibe: "",
      kgBiocharPuro: "", kgAbono4g: "", kgAgua: "", kgBiologicos: "", observaciones: "",
    });
    setSelectedPedidoIdRem(""); setSelectedClienteIdRem(""); setSelectedPersonaRecibeId(""); setSelectedBachesIds([]); setPersonal([]); setShowRemisionForm(false);
  };

  const handleRemisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRemision(true); setSubmitRemisionError(null); setSubmitRemisionSuccess(null);
    try {
      const postBody = {
        pedido_id: selectedPedidoIdRem,
        produccion_id: remisionFormData.produccionId,
        cliente: remisionFormData.cliente || undefined,
        nit_cc_cliente: remisionFormData.nitCcCliente || undefined,
        fecha_evento: remisionFormData.fechaEvento || undefined,
        realiza_registro: remisionFormData.realizaRegistro,
        kg_biochar_puro: parseFloat(remisionFormData.kgBiocharPuro),
        kg_abono_4g: parseFloat(remisionFormData.kgAbono4g),
        kg_agua: parseFloat(remisionFormData.kgAgua),
        kg_biologicos: parseFloat(remisionFormData.kgBiologicos),
        baches_ids: selectedBachesIds,
        responsable_entrega: remisionFormData.responsableEntrega,
        num_doc_entrega: remisionFormData.numDocEntrega,
        telefono_entrega: remisionFormData.telefonoEntrega || undefined,
        email_entrega: remisionFormData.emailEntrega || undefined,
        observaciones: remisionFormData.observaciones || undefined,
      };
      const createRes = await fetch("/api/pirolisis/blend/remisiones", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(postBody),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setSubmitRemisionError(createData.error || createData.details || "Error al crear la remisión"); return; }

      const remisionId: string = createData.record?.id;
      if (remisionId && remisionFormData.responsableRecibe && remisionFormData.numDocRecibe) {
        const patchRes = await fetch(`/api/pirolisis/blend/remisiones/${remisionId}/receptor`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responsable_recibe: remisionFormData.responsableRecibe, num_doc_recibe: remisionFormData.numDocRecibe, telefono_recibe: remisionFormData.telefonoRecibe || undefined, email_recibe: remisionFormData.emailRecibe || undefined }),
        });
        if (!patchRes.ok) {
          const pd = await patchRes.json();
          setSubmitRemisionSuccess(`Remisión creada. ⚠️ Datos receptor no guardados: ${pd.error ?? "error"}`);
          resetRemisionForm(); fetchRemisiones(); return;
        }
      }
      const co2 = (parseFloat(remisionFormData.kgBiocharPuro) * FACTOR_CO2).toFixed(2);
      setSubmitRemisionSuccess(`✅ Remisión creada. CO₂ secuestrado: ${co2} kg`);
      resetRemisionForm(); fetchRemisiones();
    } catch { setSubmitRemisionError("Error de red. Intenta de nuevo."); }
    finally { setSubmittingRemision(false); }
  };

  const co2Preview = parseFloat(remisionFormData.kgBiocharPuro || "0") * FACTOR_CO2;

  return (
    <TurnoProtection requiresTurno={false}>
      <div
        className="min-h-screen bg-cover bg-center bg-no-repeat relative"
        style={{ backgroundImage: `url('${BG_IMAGE}')` }}
      >
        <div className="absolute inset-0 bg-black/60 z-0" />
        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar />

          <main className="flex-1 px-4 py-8 max-w-7xl mx-auto w-full">
            {/* Encabezado */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white drop-shadow">
                  🌱 Biochar Blend
                </h1>
                <p className="text-white/70 mt-1 text-sm">
                  Gestión de pedidos y remisiones
                </p>
              </div>
              {activeTab === "pedidos" ? (
                <button
                  onClick={() => { setShowForm(v => !v); setSubmitError(null); setSubmitSuccess(null); }}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-sm shadow transition-all ${
                    showForm
                      ? "bg-white/20 hover:bg-white/30 text-white border border-white/30"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  }`}
                >
                  {showForm ? "✕ Cancelar" : "📋 Agendar Pedido"}
                </button>
              ) : (
                <button
                  onClick={() => { setShowRemisionForm(v => !v); setSubmitRemisionError(null); setSubmitRemisionSuccess(null); }}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-sm shadow transition-all ${
                    showRemisionForm
                      ? "bg-white/20 hover:bg-white/30 text-white border border-white/30"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  }`}
                >
                  {showRemisionForm ? "✕ Cancelar" : "+ Nueva Remisión"}
                </button>
              )}
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────── */}
            <div className="flex gap-2 mb-6 border-b border-white/20">
              <button
                onClick={() => setActiveTab("pedidos")}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-all border-b-2 -mb-px ${
                  activeTab === "pedidos"
                    ? "border-green-400 text-white bg-white/10"
                    : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                📋 Pedidos
              </button>
              <button
                onClick={() => setActiveTab("remisiones")}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-all border-b-2 -mb-px ${
                  activeTab === "remisiones"
                    ? "border-green-400 text-white bg-white/10"
                    : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                📦 Remisiones
              </button>
            </div>

            {/* ══════════════ TAB PEDIDOS ══════════════ */}
            {activeTab === "pedidos" && (<>

            {/* ── Formulario Agendar Pedido ─────────────────────────────── */}
            {showForm && (
              <div className="bg-black/40 backdrop-blur-md rounded-xl shadow-lg p-8 border border-white/10 mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white drop-shadow-lg">📋 Nuevo Pedido de Biochar Blend</h2>
                  <button onClick={resetForm} className="text-white/70 hover:text-white text-2xl font-bold transition-colors">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">

                  {/* Cliente */}
                  <div className="bg-black/30 backdrop-blur-sm p-6 rounded-xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">👤 Cliente</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">
                          Cliente <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={selectedClienteId}
                          onChange={handleClienteChange}
                          required
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/40"
                          style={{ colorScheme: "dark" }}
                        >
                          <option value="" className="bg-gray-900">{loadingClientes ? "Cargando clientes..." : "— Seleccionar cliente —"}</option>
                          {clientes.map(c => (
                            <option key={c.recordId} value={c.recordId} className="bg-gray-900">
                              {c.nombre}{c.ciudad ? ` — ${c.ciudad}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">NIT / CC Cliente</label>
                        <input
                          type="text"
                          value={formData.nitCcCliente}
                          onChange={e => setFormData(prev => ({ ...prev, nitCcCliente: e.target.value }))}
                          placeholder="Auto-rellena al seleccionar cliente"
                          readOnly={!!selectedClienteId}
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40"
                        />
                        {selectedClienteId && formData.nitCcCliente && (
                          <p className="text-xs text-green-400 mt-1">✓ Auto-rellenado desde Sirius Clients Core</p>
                        )}
                      </div>


                    </div>
                  </div>

                  {/* Producto */}
                  <div className="bg-black/30 backdrop-blur-sm p-6 rounded-xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">🌿 Producto</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">
                          Producto{loadingProductos && <span className="text-white/40 ml-2 text-xs">cargando...</span>}
                        </label>
                        <select
                          value={selectedProductoId}
                          onChange={handleProductoChange}
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40"
                          style={{ colorScheme: "dark" }}
                        >
                          <option value="" className="bg-gray-900">{loadingProductos ? "Cargando productos..." : "— Seleccionar producto (opcional) —"}</option>
                          {productos.map(p => (
                            <option key={p.recordId} value={p.recordId} className="bg-gray-900">
                              {p.nombre}{p.abreviatura ? ` [${p.abreviatura}]` : ""} — {p.unidadBase}
                            </option>
                          ))}
                        </select>
                        {selectedProductoId && formData.codigoProducto && (
                          <p className="text-xs text-green-400 mt-1">✓ {formData.codigoProducto}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Precio Unitario</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 text-sm">$</span>
                          <input
                            type="number" min="0" step="100"
                            value={formData.precioUnitario}
                            onChange={e => setFormData(prev => ({ ...prev, precioUnitario: e.target.value }))}
                            placeholder="Auto-rellena al seleccionar"
                            className="w-full pl-7 pr-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detalles del Pedido */}
                  <div className="bg-black/30 backdrop-blur-sm p-6 rounded-xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">📦 Detalles del Pedido</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">
                          KG Solicitados <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="number" min="0.1" step="0.1"
                          value={formData.kgSolicitados}
                          onChange={e => setFormData(prev => ({ ...prev, kgSolicitados: e.target.value }))}
                          required placeholder="0.00"
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">
                          Empaque <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={formData.empaque}
                          onChange={e => setFormData(prev => ({ ...prev, empaque: e.target.value as Empaque }))}
                          required
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40"
                          style={{ colorScheme: "dark" }}
                        >
                          <option value="" className="bg-gray-900">— Seleccionar —</option>
                          {EMPAQUE_OPTIONS.map(op => <option key={op} value={op} className="bg-gray-900">{op}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Fecha Pedido</label>
                        <input
                          type="date" value={formData.fechaPedido}
                          onChange={e => setFormData(prev => ({ ...prev, fechaPedido: e.target.value }))}
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Fecha Requerida</label>
                        <input
                          type="date" value={formData.fechaRequerida}
                          onChange={e => setFormData(prev => ({ ...prev, fechaRequerida: e.target.value }))}
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Realiza Registro</label>
                        <input
                          type="text" value={formData.realizaRegistro}
                          readOnly
                          className="w-full px-3 py-2 bg-black/25 border border-white/10 rounded-lg text-white/70 cursor-not-allowed"
                        />
                        <p className="text-xs text-white/40 mt-1">🔒 Desde sesión activa</p>
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Observaciones</label>
                        <textarea
                          value={formData.observaciones}
                          onChange={e => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                          rows={2} placeholder="Notas adicionales..."
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40 resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {submitError && (
                    <div className="bg-red-900/50 border border-red-500/40 rounded-xl p-4 text-red-300 text-sm">⚠️ {submitError}</div>
                  )}
                  {submitSuccess && (
                    <div className="bg-green-900/50 border border-green-500/40 rounded-xl p-4 text-green-300 text-sm">✓ {submitSuccess}</div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={submitting || !formData.cliente || !formData.kgSolicitados || !formData.empaque}
                      className="flex-1 bg-gradient-to-r from-[#5A7836] to-[#4a6429] hover:from-[#4a6429] hover:to-[#3d5422] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all text-sm shadow"
                    >
                      {submitting ? "Agendando..." : "📋 Agendar Pedido"}
                    </button>
                    <button
                      type="button" onClick={resetForm}
                      className="px-5 py-3 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-white/80 text-sm font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}


            {/* Toast */}
            {mensaje && (
              <div
                className={`mb-4 px-5 py-3 rounded-lg border text-sm font-medium shadow-lg transition-all ${
                  mensaje.tipo === "ok"
                    ? "bg-green-900/80 border-green-500/50 text-green-200"
                    : "bg-red-900/80 border-red-500/50 text-red-200"
                }`}
              >
                {mensaje.texto}
              </div>
            )}

            {/* Tarjetas resumen de estados */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-8">
              {ESTADOS.slice(1).map((e) => (
                <button
                  key={e}
                  onClick={() => setFiltroEstado(e)}
                  className={`rounded-lg border p-3 text-center transition-all hover:scale-105 ${
                    filtroEstado === e
                      ? (ESTADO_COLORS[e] ?? "bg-white/20 text-white border-white/40") + " ring-2 ring-white/50"
                      : "bg-white/10 text-white/70 border-white/20 hover:bg-white/15"
                  }`}
                >
                  <div className="text-2xl font-bold">{conteoEstados[e] ?? 0}</div>
                  <div className="text-xs mt-1 leading-tight">{e}</div>
                </button>
              ))}
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="flex gap-2 flex-wrap">
                {ESTADOS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setFiltroEstado(e)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      filtroEstado === e
                        ? "bg-white/25 text-white border-white/50"
                        : "bg-white/10 text-white/60 border-white/20 hover:bg-white/15"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por cliente o NIT…"
                className="sm:ml-auto w-full sm:w-64 px-4 py-2 rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            {/* Tabla */}
            {loading ? (
              <div className="text-center text-white/60 py-20">
                <div className="animate-spin inline-block w-8 h-8 border-2 border-white/20 border-t-white rounded-full mb-3" />
                <p>Cargando pedidos…</p>
              </div>
            ) : pedidosFiltrados.length === 0 ? (
              <div className="text-center text-white/50 py-20">
                <div className="text-4xl mb-3">📭</div>
                <p>No hay pedidos para mostrar</p>
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/20 text-white/70 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">Fecha</th>
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-left">NIT</th>
                        <th className="px-4 py-3 text-right">KG Pedido</th>
                        <th className="px-4 py-3 text-left">Empaque</th>
                        <th className="px-4 py-3 text-left">Estado</th>
                        <th className="px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosFiltrados.map((pedido) => {
                        const estado = String(pedido.fields["Estado"] ?? "Recibido");
                        const isActualizando = accionando === pedido.id;
                        const puedeEditar = estado === "Recibido" || estado === "Pendiente Stock";
                        const puedeIniciar = estado === "Recibido" || estado === "Pendiente Stock";
                        const mostrarRemision = estado === "En Producción" || estado === "Listo Despacho";
                        const prodStatus = produccionStatus[pedido.id];
                        const remisionHabilitada = mostrarRemision;
                        return (
                          <tr
                            key={pedido.id}
                            className="border-b border-white/10 hover:bg-white/5 transition-colors"
                          >
                            <td className="px-4 py-3 text-white/80">
                              {pedido.fields["Fecha Pedido"]
                                ? new Date(String(pedido.fields["Fecha Pedido"])).toLocaleDateString("es-CO")
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-white font-medium">
                              {String(pedido.fields["Cliente"] ?? "—")}
                            </td>
                            <td className="px-4 py-3 text-white/70">
                              {String(pedido.fields["NIT Cliente"] ?? "—")}
                            </td>
                            <td className="px-4 py-3 text-white text-right font-mono">
                              {pedido.fields["KG Total Pedido"]
                                ? Number(pedido.fields["KG Total Pedido"]).toLocaleString("es-CO")
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-white/70">
                              {String(pedido.fields["Empaque"] ?? "—")}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block px-2 py-1 rounded-full text-xs font-medium border ${
                                  ESTADO_COLORS[estado] ?? "bg-white/10 text-white border-white/20"
                                }`}
                              >
                                {estado}
                              </span>
                              {mostrarRemision && prodStatus && (
                                <div className="mt-1 text-[10px] text-white/50 font-mono">
                                  {Number(prodStatus.kg_producido).toFixed(1)} / {Number(prodStatus.kg_solicitado).toFixed(1)} kg
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 justify-center flex-wrap">
                                {/* Ver Detalle */}
                                <button
                                  onClick={() => setModalPedido(pedido)}
                                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs border border-white/20 transition-all"
                                >
                                  Ver
                                </button>

                                {/* Editar */}
                                {puedeEditar && (
                                  <button
                                    disabled={isActualizando}
                                    onClick={() => abrirEditModal(pedido)}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600/60 hover:bg-blue-600/80 text-blue-100 text-xs border border-blue-500/40 transition-all disabled:opacity-50"
                                  >
                                    Editar
                                  </button>
                                )}

                                {/* Iniciar Producción */}
                                {puedeIniciar && (
                                  <button
                                    disabled={isActualizando}
                                    onClick={() => iniciarProduccion(pedido.id)}
                                    className="px-3 py-1.5 rounded-lg bg-green-600/80 hover:bg-green-600 text-white text-xs border border-green-500/50 transition-all disabled:opacity-50"
                                  >
                                    {isActualizando ? "…" : "Iniciar Producción"}
                                  </button>
                                )}

                                {/* Remisión (habilitado cuando producción está completa) */}
                                {mostrarRemision && (
                                  <button
                                    disabled={!remisionHabilitada}
                                    onClick={() => {
                                      setActiveTab("remisiones");
                                      setModalPedido(null);
                                    }}
                                    title={remisionHabilitada ? "Generar remisión" : "La producción aún no está completa"}
                                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                      remisionHabilitada
                                        ? "bg-cyan-600/80 hover:bg-cyan-600 text-white border-cyan-500/50"
                                        : "bg-white/5 text-white/30 border-white/10 cursor-not-allowed"
                                    }`}
                                  >
                                    Remisión
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-white/10 text-white/50 text-xs">
                  {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? "s" : ""} mostrado
                  {pedidosFiltrados.length !== 1 ? "s" : ""}
                </div>
              </div>
            )}

            </>) /* fin TAB PEDIDOS */}

            {/* ══════════════ TAB REMISIONES ══════════════ */}
            {activeTab === "remisiones" && (<>

              {/* Formulario nueva remisión */}
              {showRemisionForm && (
                <div className="bg-black/40 backdrop-blur-md rounded-xl shadow-lg p-8 border border-white/10 mb-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white drop-shadow-lg">📦 Nueva Remisión de Biochar Blend</h2>
                    <button onClick={resetRemisionForm} className="text-white/70 hover:text-white text-2xl font-bold transition-colors">✕</button>
                  </div>
                  <form onSubmit={handleRemisionSubmit} className="space-y-5">

                    {/* Pedido origen */}
                    <div className="bg-black/30 backdrop-blur-sm p-5 rounded-xl border border-white/10">
                      <h3 className="text-base font-semibold text-white mb-3">📋 Pedido origen</h3>
                      <select
                        value={selectedPedidoIdRem}
                        onChange={handlePedidoRemChange}
                        required
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40"
                        style={{ colorScheme: "dark" }}
                      >
                        <option value="" className="bg-gray-900">
                          {pedidosValidos.length === 0 ? "Sin pedidos disponibles (Aprobado / En Producción / Listo Despacho)" : "— Seleccionar pedido —"}
                        </option>
                        {pedidosValidos.map(p => (
                          <option key={p.id} value={p.id} className="bg-gray-900">
                            {String(p.fields["ID"] ?? p.id.slice(-6))} — {String(p.fields["Cliente"] ?? "?")} — {String(p.fields["Estado"] ?? "")} ({String(p.fields["KG Solicitados"] ?? "?")} kg)
                          </option>
                        ))}
                      </select>
                      {selectedPedidoIdRem && !remisionFormData.produccionId && (
                        <p className="text-xs text-amber-400 mt-1">⚠️ Este pedido no tiene producción vinculada.</p>
                      )}
                    </div>

                    {/* Cliente receptor */}
                    <div className="bg-black/30 backdrop-blur-sm p-5 rounded-xl border border-white/10">
                      <h3 className="text-base font-semibold text-white mb-3">👤 Cliente receptor</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Confirmar / cambiar cliente</label>
                          <select value={selectedClienteIdRem} onChange={handleClienteRemChange} className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40" style={{ colorScheme: "dark" }}>
                            <option value="" className="bg-gray-900">{remisionFormData.cliente ? `(Del pedido: ${remisionFormData.cliente})` : "— Seleccionar cliente —"}</option>
                            {clientes.map(c => <option key={c.recordId} value={c.recordId} className="bg-gray-900">{c.nombre}{c.ciudad ? ` — ${c.ciudad}` : ""}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Nombre cliente</label>
                          <input type="text" value={remisionFormData.cliente} onChange={e => setRemisionFormData(prev => ({ ...prev, cliente: e.target.value }))} placeholder="Auto-rellena desde pedido" className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">NIT / CC Cliente</label>
                          <input type="text" value={remisionFormData.nitCcCliente} onChange={e => setRemisionFormData(prev => ({ ...prev, nitCcCliente: e.target.value }))} placeholder="Auto-rellena al seleccionar cliente" className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">
                            Responsable Recibe
                            {loadingPersonal && <span className="text-white/40 ml-2 text-xs">cargando...</span>}
                          </label>
                          <select value={selectedPersonaRecibeId} onChange={handlePersonaRecibeChange} disabled={!selectedClienteIdRem || loadingPersonal} className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40 disabled:opacity-50" style={{ colorScheme: "dark" }}>
                            <option value="" className="bg-gray-900">{!selectedClienteIdRem ? "— Selecciona un cliente primero —" : personal.length === 0 && !loadingPersonal ? "Sin personal registrado" : "— Seleccionar quien recibe —"}</option>
                            {personal.map(p => <option key={p.recordId} value={p.recordId} className="bg-gray-900">{p.nombre}{p.cargo ? ` (${p.cargo})` : ""}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Num Doc Recibe</label>
                          <input type="text" value={remisionFormData.numDocRecibe} onChange={e => setRemisionFormData(prev => ({ ...prev, numDocRecibe: e.target.value }))} placeholder="Auto-rellena al seleccionar persona" className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Teléfono Recibe</label>
                          <input type="text" value={remisionFormData.telefonoRecibe} onChange={e => setRemisionFormData(prev => ({ ...prev, telefonoRecibe: e.target.value }))} className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                      </div>
                    </div>

                    {/* Responsable entrega (Sirius) */}
                    <div className="bg-black/30 backdrop-blur-sm p-5 rounded-xl border border-white/10">
                      <h3 className="text-base font-semibold text-white mb-3">🚚 Responsable de entrega (Sirius)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Nombre <span className="text-red-400">*</span></label>
                          <input type="text" value={remisionFormData.responsableEntrega} onChange={e => setRemisionFormData(prev => ({ ...prev, responsableEntrega: e.target.value }))} required placeholder="Nombre del operador que entrega" className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Num Doc (Cédula) <span className="text-red-400">*</span></label>
                          <input type="text" value={remisionFormData.numDocEntrega} onChange={e => setRemisionFormData(prev => ({ ...prev, numDocEntrega: e.target.value }))} required placeholder="Cédula del responsable" className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Teléfono Entrega</label>
                          <input type="text" value={remisionFormData.telefonoEntrega} onChange={e => setRemisionFormData(prev => ({ ...prev, telefonoEntrega: e.target.value }))} className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white/90 mb-1">Email Entrega</label>
                          <input type="email" value={remisionFormData.emailEntrega} onChange={e => setRemisionFormData(prev => ({ ...prev, emailEntrega: e.target.value }))} className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                        </div>
                      </div>
                    </div>

                    {/* Composición (KG) */}
                    <div className="bg-black/30 backdrop-blur-sm p-5 rounded-xl border border-white/10">
                      <h3 className="text-base font-semibold text-white mb-3">⚖️ Composición del despacho (kg)</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(["kgBiocharPuro", "kgAbono4g", "kgAgua", "kgBiologicos"] as const).map((field, i) => (
                          <div key={field}>
                            <label className="block text-sm font-medium text-white/90 mb-1">{["Biochar Puro *", "Abono 4G *", "Agua *", "Biológicos *"][i]}</label>
                            <input type="number" min="0" step="0.01" required placeholder="0.00" value={remisionFormData[field]} onChange={e => setRemisionFormData(prev => ({ ...prev, [field]: e.target.value }))} className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                          </div>
                        ))}
                      </div>
                      {co2Preview > 0 && (
                        <div className="mt-3 bg-green-900/30 border border-green-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
                          <span className="text-green-300 text-sm font-medium">🌿 CO₂ secuestrado estimado:</span>
                          <span className="text-green-200 font-bold">{co2Preview.toFixed(2)} kg CO₂eq</span>
                        </div>
                      )}
                    </div>

                    {/* Baches */}
                    <div className="bg-black/30 backdrop-blur-sm p-5 rounded-xl border border-white/10">
                      <h3 className="text-base font-semibold text-white mb-3">🗂️ Baches utilizados <span className="text-red-400">*</span></h3>
                      {baches.length === 0 ? (
                        <p className="text-sm text-white/40">Sin baches disponibles</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                          {baches.map(bache => {
                            const codigo = String(bache.fields["Codigo Bache"] ?? bache.id.slice(-6));
                            const kg = bache.fields["Total Cantidad Actual Biochar Seco"];
                            const checked = selectedBachesIds.includes(bache.id);
                            return (
                              <label key={bache.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${checked ? "border-green-400 bg-green-900/20" : "border-white/20 hover:bg-white/5"}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleBache(bache.id)} className="rounded text-green-600 focus:ring-green-500" />
                                <span className="font-medium text-white">{codigo}</span>
                                {kg != null && <span className="text-white/50 text-xs ml-auto">{String(kg)} kg</span>}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {selectedBachesIds.length > 0 && <p className="text-xs text-green-400 mt-2">✓ {selectedBachesIds.length} bache(s) seleccionado(s)</p>}
                    </div>

                    {/* Campos adicionales */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-1">Fecha Evento</label>
                        <input type="date" value={remisionFormData.fechaEvento} onChange={e => setRemisionFormData(prev => ({ ...prev, fechaEvento: e.target.value }))} className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/40" style={{ colorScheme: "dark" }} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-1">Realiza Registro</label>
                        <input type="text" value={remisionFormData.realizaRegistro} readOnly className="w-full px-3 py-2 bg-black/25 border border-white/10 rounded-lg text-white/70 cursor-not-allowed" />
                        <p className="text-xs text-white/40 mt-1">🔒 Desde sesión activa</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-1">Observaciones</label>
                        <input type="text" value={remisionFormData.observaciones} onChange={e => setRemisionFormData(prev => ({ ...prev, observaciones: e.target.value }))} placeholder="Notas adicionales..." className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                      </div>
                    </div>

                    {submitRemisionError && <div className="bg-red-900/50 border border-red-500/40 rounded-xl p-4 text-red-300 text-sm">⚠️ {submitRemisionError}</div>}
                    {submitRemisionSuccess && <div className="bg-green-900/50 border border-green-500/40 rounded-xl p-4 text-green-300 text-sm">{submitRemisionSuccess}</div>}

                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={submittingRemision || !selectedPedidoIdRem || !remisionFormData.responsableEntrega || !remisionFormData.numDocEntrega || !remisionFormData.realizaRegistro || selectedBachesIds.length === 0 || !remisionFormData.kgBiocharPuro || !remisionFormData.kgAbono4g || !remisionFormData.kgAgua || !remisionFormData.kgBiologicos}
                        className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all text-sm shadow"
                      >
                        {submittingRemision ? "Creando..." : "📦 Crear Remisión"}
                      </button>
                      <button type="button" onClick={resetRemisionForm} className="px-5 py-3 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-white/80 text-sm font-medium transition-colors">Cancelar</button>
                    </div>
                  </form>
                </div>
              )}

              {/* Lista de remisiones */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 overflow-hidden">
                <div className="p-4 border-b border-white/20 flex items-center justify-between">
                  <h2 className="text-white font-semibold">Remisiones registradas</h2>
                  <button onClick={fetchRemisiones} className="text-white/50 hover:text-white text-xs border border-white/20 px-3 py-1 rounded-lg transition-colors">🔄 Actualizar</button>
                </div>
                {loadingRemisiones ? (
                  <div className="p-8 text-center text-white/70">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3" />
                    Cargando remisiones...
                  </div>
                ) : remisiones.length === 0 ? (
                  <div className="p-8 text-center text-white/60 text-sm">Sin remisiones registradas</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/20 text-white/70 text-xs uppercase tracking-wider">
                          <th className="px-4 py-3 text-left">Fecha</th>
                          <th className="px-4 py-3 text-left">Cliente</th>
                          <th className="px-4 py-3 text-right">KG Total</th>
                          <th className="px-4 py-3 text-right">CO₂ (kg)</th>
                          <th className="px-4 py-3 text-left">Estado</th>
                          <th className="px-4 py-3 text-left">Responsable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remisiones.map(rem => (
                          <tr key={rem.id} className="border-b border-white/10 hover:bg-white/5 transition-colors text-white">
                            <td className="px-4 py-3 text-white/70 text-xs">
                              {rem.fields["Fecha Evento"] ? new Date(String(rem.fields["Fecha Evento"])).toLocaleDateString("es-CO") : "—"}
                            </td>
                            <td className="px-4 py-3 font-medium">{String(rem.fields["Cliente"] ?? "—")}</td>
                            <td className="px-4 py-3 text-right font-mono">{String(rem.fields["KG Total Despachados"] ?? "—")}</td>
                            <td className="px-4 py-3 text-right text-green-300 font-mono">{String(rem.fields["CO2 Secuestrado KG"] ?? "—")}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ESTADO_BADGE_REM[String(rem.fields["Estado"] ?? "")] ?? "bg-white/10 text-white border-white/20"}`}>
                                {String(rem.fields["Estado"] ?? "—")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white/70 text-xs">{String(rem.fields["Responsable Entrega"] ?? "—")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-4 py-3 border-t border-white/10 text-white/50 text-xs">
                      {remisiones.length} remisión{remisiones.length !== 1 ? "es" : ""} registrada{remisiones.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                )}
              </div>

            </>) /* fin TAB REMISIONES */}

          </main>

          <Footer />
        </div>
      </div>

      {/* Modal de detalle */}
      {modalPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setModalPedido(null)} />
          <div className="relative bg-gray-900 border border-white/20 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-start mb-5">
              <h2 className="text-lg font-bold text-white">Detalle del Pedido</h2>
              <button
                onClick={() => setModalPedido(null)}
                className="text-white/40 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {[
                ["Cliente", "Cliente"],
                ["NIT", "NIT Cliente"],
                ["Estado", "Estado"],
                ["Fecha Pedido", "Fecha Pedido"],
                ["KG Total", "KG Total Pedido"],
                ["Empaque", "Empaque"],
                ["Contacto", "Contacto Nombre"],
                ["Teléfono", "Contacto Telefono"],
                ["Email", "Contacto Email"],
                ["Observaciones", "Observaciones"],
              ].map(([label, field]) => {
                const val = modalPedido.fields[field];
                if (!val) return null;
                return (
                  <div key={field} className="flex gap-3">
                    <span className="text-white/50 w-32 shrink-0">{label}:</span>
                    <span className="text-white break-all">{String(val)}</span>
                  </div>
                );
              })}
            </div>

            {/* Acciones en modal */}
            {(() => {
              const estado = String(modalPedido.fields["Estado"] ?? "Recibido");
              const isActualizando = accionando === modalPedido.id;
              const puedeEditar = estado === "Recibido" || estado === "Pendiente Stock";
              const puedeIniciar = estado === "Recibido" || estado === "Pendiente Stock";
              const mostrarRemision = estado === "En Producción" || estado === "Listo Despacho";
              const prodStatus = produccionStatus[modalPedido.id];
              const remisionHabilitada = mostrarRemision;

              if (!puedeEditar && !puedeIniciar && !mostrarRemision) return null;
              return (
                <div className="mt-6 border-t border-white/10 pt-4">
                  <p className="text-white/50 text-xs mb-3">Acciones:</p>
                  <div className="flex gap-2 flex-wrap">
                    {puedeEditar && (
                      <button
                        disabled={isActualizando}
                        onClick={() => { abrirEditModal(modalPedido); setModalPedido(null); }}
                        className="px-4 py-2 rounded-lg bg-blue-600/70 hover:bg-blue-600 text-white text-sm border border-blue-500/50 transition-all disabled:opacity-50"
                      >
                        ✏️ Editar
                      </button>
                    )}
                    {puedeIniciar && (
                      <button
                        disabled={isActualizando}
                        onClick={() => iniciarProduccion(modalPedido.id)}
                        className="px-4 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 text-white text-sm border border-green-500/50 transition-all disabled:opacity-50"
                      >
                        {isActualizando ? "Procesando…" : "🚀 Iniciar Producción"}
                      </button>
                    )}
                    {mostrarRemision && (
                      <button
                        disabled={!remisionHabilitada}
                        onClick={() => { setActiveTab("remisiones"); setModalPedido(null); }}
                        title={remisionHabilitada ? "Generar remisión" : `Producción incompleta: faltan ${prodStatus?.falta ?? "?"} kg`}
                        className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                          remisionHabilitada
                            ? "bg-cyan-600/80 hover:bg-cyan-600 text-white border-cyan-500/50"
                            : "bg-white/5 text-white/30 border-white/10 cursor-not-allowed"
                        }`}
                      >
                        📋 Remisión
                      </button>
                    )}
                  </div>
                  {mostrarRemision && prodStatus && (
                    <p className="mt-3 text-xs text-white/50 font-mono">
                      Producción: {Number(prodStatus.kg_producido).toFixed(2)} / {Number(prodStatus.kg_solicitado).toFixed(2)} kg
                      {!prodStatus.completa && ` (faltan ${Number(prodStatus.falta).toFixed(2)} kg)`}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal de Edición */}
      {editPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setEditPedido(null)} />
          <div className="relative bg-gray-900 border border-white/20 rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-start mb-5">
              <h2 className="text-lg font-bold text-white">Editar Pedido</h2>
              <button onClick={() => setEditPedido(null)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
            </div>

            <p className="text-white/60 text-xs mb-4">
              Cliente: <span className="text-white">{String(editPedido.fields["Cliente"] ?? "—")}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-xs mb-1">KG Solicitados</label>
                <input
                  type="number" step="0.01" min="0"
                  value={editFormData.kgSolicitados}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, kgSolicitados: e.target.value }))}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-white/70 text-xs mb-1">Empaque</label>
                <select
                  value={editFormData.empaque}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, empaque: e.target.value as Empaque | "" }))}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="">— Seleccionar —</option>
                  {EMPAQUE_OPTIONS.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white/70 text-xs mb-1">Fecha Requerida</label>
                <input
                  type="date"
                  value={editFormData.fechaRequerida}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, fechaRequerida: e.target.value }))}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-white/70 text-xs mb-1">Observaciones</label>
                <textarea
                  rows={3}
                  value={editFormData.observaciones}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {editError && (
              <div className="mt-4 p-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
                {editError}
              </div>
            )}

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setEditPedido(null)}
                disabled={submittingEdit}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-sm border border-white/20 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={submittingEdit}
                className="px-4 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white text-sm border border-blue-500/50 disabled:opacity-50"
              >
                {submittingEdit ? "Guardando…" : "💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal stock insuficiente */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setStockModal(null)} />
          <div className="relative bg-gray-900 border border-yellow-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold text-yellow-300">⚠️ Insumos insuficientes</h2>
              <button onClick={() => setStockModal(null)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
            </div>
            <p className="text-white/60 text-sm mb-5">
              El pedido quedó en <span className="text-yellow-300 font-medium">Pendiente Stock</span>. Ingresa las
              cantidades a registrar como entrada y se reintentará iniciar la producción automáticamente.
            </p>

            <div className="space-y-4">
              {/* Abono 4G */}
              <div className={`rounded-xl p-4 border ${
                stockModal.abono4g.faltante > 0
                  ? "bg-red-900/20 border-red-500/30"
                  : "bg-green-900/10 border-green-500/20"
              }`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white text-sm font-medium">Abono 4G</span>
                  {stockModal.abono4g.faltante > 0
                    ? <span className="text-red-400 text-xs font-mono">❌ Faltan {stockModal.abono4g.faltante.toFixed(2)} kg</span>
                    : <span className="text-green-400 text-xs">✅ Stock suficiente</span>
                  }
                </div>
                <div className="flex gap-4 text-xs text-white/50 mb-3">
                  <span>Necesario: <span className="text-white/80">{stockModal.abono4g.necesario.toFixed(2)} kg</span></span>
                  <span>Stock: <span className="text-white/80">{stockModal.abono4g.stock.toFixed(2)} kg</span></span>
                </div>
                {stockModal.abono4g.faltante > 0 && (
                  <input
                    type="number" step="0.01" min="0"
                    value={entradaKg4g}
                    onChange={(e) => setEntradaKg4g(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
                    placeholder="kg a registrar como entrada"
                  />
                )}
              </div>

              {/* Biológicos */}
              <div className={`rounded-xl p-4 border ${
                stockModal.biologicos.faltante > 0
                  ? "bg-red-900/20 border-red-500/30"
                  : "bg-green-900/10 border-green-500/20"
              }`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white text-sm font-medium">Biológicos DataLab</span>
                  {stockModal.biologicos.faltante > 0
                    ? <span className="text-red-400 text-xs font-mono">❌ Faltan {stockModal.biologicos.faltante.toFixed(2)} kg</span>
                    : <span className="text-green-400 text-xs">✅ Stock suficiente</span>
                  }
                </div>
                <div className="flex gap-4 text-xs text-white/50 mb-3">
                  <span>Necesario: <span className="text-white/80">{stockModal.biologicos.necesario.toFixed(2)} kg</span></span>
                  <span>Stock: <span className="text-white/80">{stockModal.biologicos.stock.toFixed(2)} kg</span></span>
                </div>
                {stockModal.biologicos.faltante > 0 && (
                  <input
                    type="number" step="0.01" min="0"
                    value={entradaKgBio}
                    onChange={(e) => setEntradaKgBio(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
                    placeholder="kg a registrar como entrada"
                  />
                )}
              </div>
            </div>

            {errorEntradas && (
              <p className="mt-3 text-red-400 text-xs">{errorEntradas}</p>
            )}

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setStockModal(null)}
                disabled={registrandoEntradas}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-sm border border-white/20 disabled:opacity-50"
              >
                Cerrar
              </button>
              <button
                onClick={registrarEntradas}
                disabled={registrandoEntradas || (!(parseFloat(entradaKg4g) > 0) && !(parseFloat(entradaKgBio) > 0))}
                className="px-4 py-2 rounded-lg bg-yellow-600/80 hover:bg-yellow-600 text-white text-sm border border-yellow-500/50 disabled:opacity-50"
              >
                {registrandoEntradas ? "Registrando…" : "📥 Registrar y reintentar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </TurnoProtection>
  );
}
