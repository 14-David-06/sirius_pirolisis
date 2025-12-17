"use client";

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useBaches } from '@/lib/useBaches';

export default function DashboardProduccion() {
  return (
    <DashboardProduccionContent />
  );
}

function DashboardProduccionContent() {
  const [bachesPirolisis, setBachesPirolisis] = useState<any[]>([]);
  const [loadingBaches, setLoadingBaches] = useState(false);
  const [turnoData, setTurnoData] = useState<any[]>([]);
  const [balanceMasaData, setBalanceMasaData] = useState<any[]>([]);
  const [viajesBiomasa, setViajesBiomasa] = useState<any[]>([]);
  const [loadingPromedios, setLoadingPromedios] = useState(false);
  
  // Usar el hook de baches para obtener datos reales
  const { 
    data: bachesData, 
    loading: bachesLoading, 
    getTotalBiomasaHumeda,
    getBiomasaSecaActual,
    getBacheStatus
  } = useBaches();

  // Calcular métricas totalizadoras basadas en datos reales
  const calculateMetrics = () => {
    if (!bachesData?.records || bachesData.records.length === 0) {
      return {
        totalBaches: 0,
        bachesActivos: 0,
        biocharHumedoTotal: 0,
        biocharSecoTotal: 0,
        lonasUsadasTotal: 0,
        bachesCompletos: 0,
        bachesEnProceso: 0,
        porcentajeProgreso: 0
      };
    }

    const records = bachesData.records;
    let biocharHumedoTotal = 0;
    let biocharSecoTotal = 0;
    let lonasUsadasTotal = 0;
    let bachesCompletos = 0;
    let bachesEnProceso = 0;

    records.forEach(bache => {
      // Sumar biochar húmedo
      biocharHumedoTotal += getTotalBiomasaHumeda(bache);
      
      // Sumar biochar seco actual
      biocharSecoTotal += getBiomasaSecaActual(bache);
      
      // Sumar lonas usadas
      lonasUsadasTotal += bache.fields['Recuento Lonas'] || 0;
      
      // Contar estados
      const estado = getBacheStatus(bache);
      if (estado?.includes('Completo')) {
        bachesCompletos++;
      } else if (estado?.includes('proceso')) {
        bachesEnProceso++;
      }
    });

    const totalBaches = records.length;
    const bachesActivos = bachesEnProceso + bachesCompletos;
    const porcentajeProgreso = totalBaches > 0 ? ((bachesCompletos / totalBaches) * 100) : 0;

    return {
      totalBaches,
      bachesActivos,
      biocharHumedoTotal,
      biocharSecoTotal,
      lonasUsadasTotal,
      bachesCompletos,
      bachesEnProceso,
      porcentajeProgreso
    };
  };

  const metrics = calculateMetrics();

  // Calcular promedios de producción
  const calculatePromedios = () => {
    let promedioBiomasaPorHora = 0;
    let promedioBiocharPorHora = 0;

    console.log('Calculando promedios...');
    console.log('Turnos disponibles:', turnoData?.length || 0);
    console.log('Balances disponibles:', balanceMasaData?.length || 0);

    // Promedio de ingreso de biomasa por hora (desde Turno Pirolisis)
    if (turnoData && turnoData.length > 0) {
      console.log('🔵 PROCESANDO BIOMASA - Total turnos:', turnoData.length);
      
      // Debug: mostrar todos los campos disponibles del primer turno
      if (turnoData[0]?.fields) {
        console.log('Campos disponibles en turno:', Object.keys(turnoData[0].fields));
        // Mostrar valores de campos que podrían ser biomasa
        Object.keys(turnoData[0].fields).forEach(key => {
          if (key.toLowerCase().includes('biomasa') || key.toLowerCase().includes('alimentac')) {
            console.log(`Campo potencial: "${key}" = ${turnoData[0].fields[key]}`);
          }
        });
      }
      
      const biomasaRates = turnoData
        .filter(turno => {
          // Probar diferentes variaciones del nombre del campo
          const rate = turno.fields?.['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields?.['Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields?.['🎙️ Alimentacion Biomasa Humeda Por Minuto (Kg)'] ||
                       turno.fields?.['Alimentacion Biomasa Humeda Por Minuto (Kg)'];
          
          console.log(`Turno ${turno.id}: rate = ${rate} (válido: ${rate && rate > 0})`);
          if (rate) {
            const fieldName = Object.keys(turno.fields).find(key => turno.fields[key] === rate);
            console.log(`  Campo usado: "${fieldName}"`);
          }
          
          return rate && rate > 0;
        })
        .map(turno => {
          const rate = turno.fields['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields['Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields['🎙️ Alimentacion Biomasa Humeda Por Minuto (Kg)'] ||
                       turno.fields['Alimentacion Biomasa Humeda Por Minuto (Kg)'];
          const ratePerHour = (rate || 0) * 60;
          console.log(`  ${rate}/min → ${ratePerHour}/hora`);
          return ratePerHour;
        }); // convertir a por hora
      
      console.log('Rates de biomasa válidos:', biomasaRates);
      
      if (biomasaRates.length > 0) {
        promedioBiomasaPorHora = biomasaRates.reduce((sum, rate) => sum + rate, 0) / biomasaRates.length;
        console.log(`✅ Promedio biomasa: ${promedioBiomasaPorHora.toFixed(2)} kg/h`);
      } else {
        console.log('❌ No hay datos válidos de biomasa');
      }
    }

    // Promedio de producción de biochar por hora (desde Balances Masa)
    if (balanceMasaData && balanceMasaData.length > 0) {
      console.log('🟢 PROCESANDO BIOCHAR - Total balances:', balanceMasaData.length);
      
      // Agrupar balances por turno para calcular producción por hora más precisa
      const biocharPorTurno = new Map();
      let balancesConPeso = 0;
      
      balanceMasaData.forEach((balance, index) => {
        const peso = balance.fields?.['Peso Biochar (KG)'];
        const turnoIds = balance.fields?.['Turno Pirolisis'] || [];
        
        if (peso && peso > 0) {
          balancesConPeso++;
          console.log(`Balance ${index}: ${peso}kg, turnos: ${turnoIds.length}`);
          
          if (turnoIds.length > 0) {
            turnoIds.forEach((turnoId: string) => {
              if (!biocharPorTurno.has(turnoId)) {
                biocharPorTurno.set(turnoId, []);
              }
              biocharPorTurno.get(turnoId)!.push(peso);
            });
          }
        }
      });

      console.log(`Balances con peso válido: ${balancesConPeso}`);
      console.log('Biochar por turno:', biocharPorTurno);

      if (biocharPorTurno.size > 0) {
        // Calcular promedio de biochar por turno y luego promedio general
        let totalPromedios = 0;
        let contadorTurnos = 0;

        biocharPorTurno.forEach((pesos: number[], turnoId: string) => {
          // Buscar la duración del turno correspondiente
          const turno = turnoData?.find(t => t.id === turnoId);
          let horasTurno = 8; // Valor por defecto

          if (turno && turno.fields?.['Cálculo']) {
            horasTurno = turno.fields['Cálculo'] || 8;
          }

          const totalBiocharTurno = pesos.reduce((sum, peso) => sum + peso, 0);
          const biocharPorHora = totalBiocharTurno / horasTurno;
          
          console.log(`Turno ${turnoId}: ${totalBiocharTurno}kg / ${horasTurno}h = ${biocharPorHora.toFixed(2)}kg/h`);
          
          totalPromedios += biocharPorHora;
          contadorTurnos++;
        });

        if (contadorTurnos > 0) {
          promedioBiocharPorHora = totalPromedios / contadorTurnos;
          console.log(`✅ Promedio biochar: ${promedioBiocharPorHora.toFixed(2)} kg/h`);
        }
      } else {
        console.log('⚠️ Usando fallback para biochar...');
        // Fallback: calcular basado en peso promedio por balance
        const biocharWeights = balanceMasaData
          .filter(balance => balance.fields?.['Peso Biochar (KG)'] && balance.fields['Peso Biochar (KG)'] > 0)
          .map(balance => balance.fields['Peso Biochar (KG)']);
        
        if (biocharWeights.length > 0) {
          // Asumiendo que cada balance representa aproximadamente 1 hora de producción
          promedioBiocharPorHora = biocharWeights.reduce((sum, weight) => sum + weight, 0) / biocharWeights.length;
          console.log(`✅ Promedio biochar (fallback): ${promedioBiocharPorHora.toFixed(2)} kg/h`);
        } else {
          console.log('❌ No hay datos válidos de biochar');
        }
      }
    }

    console.log('=== RESULTADO FINAL DE PROMEDIOS ===');
    console.log('promedioBiomasaPorHora (ingreso):', promedioBiomasaPorHora, 'kg/h');
    console.log('promedioBiocharPorHora (producción):', promedioBiocharPorHora, 'kg/h');
    console.log('=====================================');

    return {
      promedioBiomasaPorHora,
      promedioBiocharPorHora
    };
  };

  const promedios = calculatePromedios();

  // Calcular métricas avanzadas de turnos
  const calculateTurnoMetrics = () => {
    if (!turnoData || turnoData.length === 0) {
      return {
        totalTurnos: 0,
        horasTotales: 0,
        promedioHorasPorTurno: 0,
        energiaTotal: 0,
        biogasTotal: 0,
        aguaTotal: 0,
        energiaPorHora: 0,
        biogasPorHora: 0,
        biomasaTotalIngresada: 0,
        operadores: [],
        turnosRecientes: [],
        consumoPorOperador: {}
      };
    }

    let horasTotales = 0;
    let energiaTotal = 0;
    let biogasTotal = 0;
    let aguaTotal = 0;
    let biomasaTotalIngresada = 0;
    const operadoresSet = new Set();
    const consumoPorOperador: any = {};

    turnoData.forEach(turno => {
      const horas = turno.fields?.['Cálculo'] || 0;
      const energia = turno.fields?.['Total Energia Consumida'] || 0;
      const biogas = turno.fields?.['Total Biogas Consumido'] || 0;
      const aguaInicio = turno.fields?.['Consumo Agua Inicio'] || 0;
      const aguaFin = turno.fields?.['Consumo Agua Fin'] || 0;
      const alimentacionPorMin = turno.fields?.['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'] || 0;
      const operador = turno.fields?.['Operador'] || 'Sin asignar';

      horasTotales += horas;
      energiaTotal += energia;
      biogasTotal += biogas;
      aguaTotal += (aguaFin - aguaInicio);
      biomasaTotalIngresada += (alimentacionPorMin * horas * 60);

      operadoresSet.add(operador);

      if (!consumoPorOperador[operador]) {
        consumoPorOperador[operador] = {
          turnos: 0,
          horas: 0,
          energia: 0,
          biogas: 0,
          biomasa: 0
        };
      }

      consumoPorOperador[operador].turnos += 1;
      consumoPorOperador[operador].horas += horas;
      consumoPorOperador[operador].energia += energia;
      consumoPorOperador[operador].biogas += biogas;
      consumoPorOperador[operador].biomasa += (alimentacionPorMin * horas * 60);
    });

    const totalTurnos = turnoData.length;
    const promedioHorasPorTurno = totalTurnos > 0 ? horasTotales / totalTurnos : 0;
    const energiaPorHora = horasTotales > 0 ? energiaTotal / horasTotales : 0;
    const biogasPorHora = horasTotales > 0 ? biogasTotal / horasTotales : 0;

    // Obtener los 5 turnos más recientes
    const turnosRecientes = [...turnoData]
      .sort((a, b) => {
        const dateA = new Date(a.fields?.['Fecha Inicio Turno'] || 0);
        const dateB = new Date(b.fields?.['Fecha Inicio Turno'] || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5);

    return {
      totalTurnos,
      horasTotales,
      promedioHorasPorTurno,
      energiaTotal,
      biogasTotal,
      aguaTotal,
      energiaPorHora,
      biogasPorHora,
      biomasaTotalIngresada,
      operadores: Array.from(operadoresSet),
      turnosRecientes,
      consumoPorOperador
    };
  };

  const turnoMetrics = calculateTurnoMetrics();

  // Calcular métricas de temperaturas desde Balances Masa - TODOS LOS REGISTROS
  const calculateTemperatureMetrics = () => {
    if (!balanceMasaData || balanceMasaData.length === 0) {
      return {
        totalRegistros: 0,
        pesoTotalBiochar: 0,
        temperaturas: {
          reactor: { r1: { avg: 0, min: 0, max: 0 }, r2: { avg: 0, min: 0, max: 0 }, r3: { avg: 0, min: 0, max: 0 } },
          horno: { h1: { avg: 0, min: 0, max: 0 }, h2: { avg: 0, min: 0, max: 0 }, h3: { avg: 0, min: 0, max: 0 }, h4: { avg: 0, min: 0, max: 0 } },
          ducto: { g9: { avg: 0, min: 0, max: 0 } }
        },
        promedioGeneral: 0,
        todosLosRegistros: [],
        registrosParaGrafica: [],
        alertas: []
      };
    }

    console.log('📊 CALCULANDO MÉTRICAS DE TEMPERATURA');
    console.log('Total de registros en balanceMasaData:', balanceMasaData.length);

    let pesoTotalBiochar = 0;
    const temps = {
      r1: [] as number[],
      r2: [] as number[],
      r3: [] as number[],
      h1: [] as number[],
      h2: [] as number[],
      h3: [] as number[],
      h4: [] as number[],
      g9: [] as number[]
    };

    // Procesar TODOS los registros
    balanceMasaData.forEach((balance, index) => {
      const peso = balance.fields?.['Peso Biochar (KG)'];
      pesoTotalBiochar += peso || 0;
      
      const r1 = balance.fields?.['Temperatura Reactor (R1)'];
      const r2 = balance.fields?.['Temperatura Reactor (R2)'];
      const r3 = balance.fields?.['Temperatura Reactor (R3)'];
      const h1 = balance.fields?.['Temperatura Horno (H1)'];
      const h2 = balance.fields?.['Temperatura Horno (H2)'];
      const h3 = balance.fields?.['Temperatura Horno (H3)'];
      const h4 = balance.fields?.['Temperatura Horno (H4)'];
      const g9 = balance.fields?.['Temperatura Ducto (G9)'];

      if (index < 5) {
        console.log(`Registro ${index}:`, { r1, r2, r3, h1, h2, h3, h4, g9, peso });
      }

      if (r1 !== undefined && r1 !== null && r1 > 0) temps.r1.push(r1);
      if (r2 !== undefined && r2 !== null && r2 > 0) temps.r2.push(r2);
      if (r3 !== undefined && r3 !== null && r3 > 0) temps.r3.push(r3);
      if (h1 !== undefined && h1 !== null && h1 > 0) temps.h1.push(h1);
      if (h2 !== undefined && h2 !== null && h2 > 0) temps.h2.push(h2);
      if (h3 !== undefined && h3 !== null && h3 > 0) temps.h3.push(h3);
      if (h4 !== undefined && h4 !== null && h4 > 0) temps.h4.push(h4);
      if (g9 !== undefined && g9 !== null && g9 > 0) temps.g9.push(g9);
    });

    console.log('Temperaturas recolectadas:', {
      r1: temps.r1.length,
      r2: temps.r2.length,
      r3: temps.r3.length,
      h1: temps.h1.length,
      h2: temps.h2.length,
      h3: temps.h3.length,
      h4: temps.h4.length,
      g9: temps.g9.length
    });

    const calcStats = (arr: number[]) => {
      if (arr.length === 0) return { avg: 0, min: 0, max: 0 };
      return {
        avg: arr.reduce((sum, val) => sum + val, 0) / arr.length,
        min: Math.min(...arr),
        max: Math.max(...arr)
      };
    };

    const temperaturas = {
      reactor: {
        r1: calcStats(temps.r1),
        r2: calcStats(temps.r2),
        r3: calcStats(temps.r3)
      },
      horno: {
        h1: calcStats(temps.h1),
        h2: calcStats(temps.h2),
        h3: calcStats(temps.h3),
        h4: calcStats(temps.h4)
      },
      ducto: {
        g9: calcStats(temps.g9)
      }
    };

    console.log('Estadísticas calculadas:', temperaturas);

    // Calcular promedio general de todas las temperaturas
    const allTemps = [...temps.r1, ...temps.r2, ...temps.r3, ...temps.h1, ...temps.h3, ...temps.h4, ...temps.g9];
    const promedioGeneral = allTemps.length > 0 ? allTemps.reduce((sum, val) => sum + val, 0) / allTemps.length : 0;

    console.log('Promedio general:', promedioGeneral);

    // Ordenar TODOS los registros por fecha para la gráfica
    const todosLosRegistros = [...balanceMasaData]
      .sort((a, b) => {
        const dateA = new Date(a.fields?.['Fecha Creacion'] || 0);
        const dateB = new Date(b.fields?.['Fecha Creacion'] || 0);
        return dateA.getTime() - dateB.getTime();
      });

    // Tomar máximo 50 registros más recientes para la gráfica (para no saturar visualmente)
    const registrosParaGrafica = todosLosRegistros.slice(-50);

    console.log('Registros para gráfica:', registrosParaGrafica.length);

    // Generar alertas de temperaturas fuera de rango
    const alertas: any[] = [];
    const rangosOptimos = {
      reactor: { min: 400, max: 750 },
      horno: { min: 300, max: 700 },
      ducto: { min: 200, max: 300 }
    };

    if (temperaturas.reactor.r1.avg > 0 && (temperaturas.reactor.r1.avg < rangosOptimos.reactor.min || temperaturas.reactor.r1.avg > rangosOptimos.reactor.max)) {
      alertas.push({ zona: 'Reactor R1', promedio: temperaturas.reactor.r1.avg, tipo: 'warning' });
    }
    if (temperaturas.reactor.r2.avg > 0 && (temperaturas.reactor.r2.avg < rangosOptimos.reactor.min || temperaturas.reactor.r2.avg > rangosOptimos.reactor.max)) {
      alertas.push({ zona: 'Reactor R2', promedio: temperaturas.reactor.r2.avg, tipo: 'warning' });
    }
    if (temperaturas.reactor.r3.avg > 0 && (temperaturas.reactor.r3.avg < rangosOptimos.reactor.min || temperaturas.reactor.r3.avg > rangosOptimos.reactor.max)) {
      alertas.push({ zona: 'Reactor R3', promedio: temperaturas.reactor.r3.avg, tipo: 'warning' });
    }

    const result = {
      totalRegistros: balanceMasaData.length,
      pesoTotalBiochar,
      temperaturas,
      promedioGeneral,
      todosLosRegistros,
      registrosParaGrafica: todosLosRegistros.slice(-20), // Solo últimos 20 registros para la gráfica
      alertas
    };

    console.log('Resultado final de métricas de temperatura:', {
      totalRegistros: result.totalRegistros,
      pesoTotal: result.pesoTotalBiochar,
      promedioGeneral: result.promedioGeneral,
      registrosGrafica: result.registrosParaGrafica.length
    });

    return result;
  };

  const tempMetrics = calculateTemperatureMetrics();

  // Calcular métricas de Viajes Biomasa
  const calculateViajesBiomasa = () => {
    console.log('📊 CALCULANDO MÉTRICAS DE VIAJES BIOMASA');
    console.log('Total de viajes disponibles:', viajesBiomasa.length);
    console.log('Datos de viajes:', viajesBiomasa.slice(0, 2));

    if (!viajesBiomasa || viajesBiomasa.length === 0) {
      console.warn('⚠️ No hay datos de viajes biomasa disponibles');
      return {
        totalViajes: 0,
        pesoTotalFresco: 0,
        pesoPromedio: 0,
        viajesRecientes: [],
        porTipoBiomasa: {},
        porVehiculo: {},
        porOperador: {},
        humedadPromedio: 0
      };
    }

    let pesoTotal = 0;
    let humedadTotal = 0;
    let countHumedad = 0;
    const porTipoBiomasa: any = {};
    const porVehiculo: any = {};
    const porOperador: any = {};

    viajesBiomasa.forEach((viaje) => {
      const peso = viaje.fields?.['Peso entregado de masa fresca'] || 0;
      const tipoBiomasa = viaje.fields?.['Tipo Biomasa'] || 'Sin especificar';
      const tipoVehiculo = viaje.fields?.['Tipo Vehículo'] || 'Sin especificar';
      const operador = viaje.fields?.['Nombre Quien Entrega'] || 'Sin especificar';
      const humedad = viaje.fields?.['Porcentaje Humedad (from Monitoreo Viajes Biomasa)'];

      pesoTotal += peso;

      // Acumular por tipo de biomasa
      if (!porTipoBiomasa[tipoBiomasa]) {
        porTipoBiomasa[tipoBiomasa] = { viajes: 0, peso: 0 };
      }
      porTipoBiomasa[tipoBiomasa].viajes += 1;
      porTipoBiomasa[tipoBiomasa].peso += peso;

      // Acumular por vehículo
      if (!porVehiculo[tipoVehiculo]) {
        porVehiculo[tipoVehiculo] = { viajes: 0, peso: 0 };
      }
      porVehiculo[tipoVehiculo].viajes += 1;
      porVehiculo[tipoVehiculo].peso += peso;

      // Acumular por operador
      if (!porOperador[operador]) {
        porOperador[operador] = { viajes: 0, peso: 0 };
      }
      porOperador[operador].viajes += 1;
      porOperador[operador].peso += peso;

      // Humedad
      if (humedad && Array.isArray(humedad) && humedad.length > 0) {
        humedadTotal += humedad[0];
        countHumedad += 1;
      }
    });

    // Obtener los 10 viajes más recientes
    const viajesRecientes = [...viajesBiomasa]
      .sort((a, b) => {
        const dateA = new Date(a.fields?.['Fecha Entrega'] || a.createdTime);
        const dateB = new Date(b.fields?.['Fecha Entrega'] || b.createdTime);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 10);

    const result = {
      totalViajes: viajesBiomasa.length,
      pesoTotalFresco: pesoTotal,
      pesoPromedio: viajesBiomasa.length > 0 ? pesoTotal / viajesBiomasa.length : 0,
      viajesRecientes,
      porTipoBiomasa,
      porVehiculo,
      porOperador,
      humedadPromedio: countHumedad > 0 ? humedadTotal / countHumedad : 0
    };

    console.log('Resultado de métricas de viajes biomasa:', result);
    return result;
  };

  const viajesMetrics = calculateViajesBiomasa();

  // Cargar datos de Baches Pirolisis para la tabla detallada
  const loadBachesPirolisis = async () => {
    try {
      setLoadingBaches(true);
      const response = await fetch('/api/baches/list');
      
      if (response.ok) {
        const data = await response.json();
        setBachesPirolisis(data.records || []);
      } else {
        console.error('Error al cargar baches:', await response.text());
      }
    } catch (error) {
      console.error('Error al cargar baches:', error);
    } finally {
      setLoadingBaches(false);
    }
  };

  // Cargar datos de turnos y balances para promedios
  const loadPromediosData = async () => {
    try {
      setLoadingPromedios(true);
      
      console.log('🔄 Iniciando carga de datos de turnos, balances y viajes biomasa...');
      
      const [turnoResponse, balanceResponse, viajesResponse] = await Promise.all([
        fetch('/api/turno/list'),
        fetch('/api/balance-masa/list?maxRecords=1000'), // Cargar hasta 1000 registros
        fetch('/api/viajes-biomasa/list?maxRecords=1000') // Cargar viajes de biomasa
      ]);
      
      if (turnoResponse.ok) {
        const turnoResult = await turnoResponse.json();
        const turnos = turnoResult.records || [];
        setTurnoData(turnos);
        console.log('✅ Turnos cargados:', turnos.length);
      } else {
        console.error('❌ Error al cargar turnos:', await turnoResponse.text());
      }
      
      if (balanceResponse.ok) {
        const balanceResult = await balanceResponse.json();
        console.log('📦 Respuesta de balance-masa:', balanceResult);
        
        // El endpoint devuelve los datos transformados en 'data', pero necesitamos el formato original
        // Vamos a hacer una petición directa a Airtable si es necesario
        if (balanceResult.success && balanceResult.data) {
          // Convertir los datos transformados de vuelta al formato esperado
          const records = balanceResult.data.map((item: any) => ({
            id: item.id,
            createdTime: item.createdTime,
            fields: {
              'ID': item.id,
              'Fecha Creacion': item.fechaCreacion,
              'Peso Biochar (KG)': item.pesoBiochar,
              'Temperatura Reactor (R1)': item.temperaturas?.reactorR1,
              'Temperatura Reactor (R2)': item.temperaturas?.reactorR2,
              'Temperatura Reactor (R3)': item.temperaturas?.reactorR3,
              'Temperatura Horno (H1)': item.temperaturas?.hornoH1,
              'Temperatura Horno (H2)': item.temperaturas?.hornoH2,
              'Temperatura Horno (H3)': item.temperaturas?.hornoH3,
              'Temperatura Horno (H4)': item.temperaturas?.hornoH4,
              'Temperatura Ducto (G9)': item.temperaturas?.ductoG9,
              'Realiza Registro': item.realizaRegistro,
              'Turno Pirolisis': item.turnoPirolisis
            }
          }));
          
          setBalanceMasaData(records);
          console.log('✅ Balances de masa cargados y transformados:', records.length);
          console.log('📊 Primer registro de ejemplo:', records[0]);
        } else {
          console.warn('⚠️ No se encontraron datos de balance en el formato esperado');
          setBalanceMasaData([]);
        }
      } else {
        const errorText = await balanceResponse.text();
        console.error('❌ Error al cargar balances de masa:', balanceResponse.status, errorText);
        setBalanceMasaData([]);
      }

      if (viajesResponse.ok) {
        const viajesResult = await viajesResponse.json();
        console.log('🚛 Respuesta de viajes-biomasa:', viajesResult);
        console.log('🚛 Success:', viajesResult.success);
        console.log('🚛 Records:', viajesResult.records?.length);
        
        if (viajesResult.success && viajesResult.records) {
          setViajesBiomasa(viajesResult.records);
          console.log('✅ Viajes de biomasa cargados:', viajesResult.records.length);
          console.log('📊 Primer viaje de ejemplo:', viajesResult.records[0]);
          console.log('📊 Campos del primer viaje:', viajesResult.records[0]?.fields);
        } else if (viajesResult.records) {
          // Caso donde success no está definido pero hay records
          setViajesBiomasa(viajesResult.records);
          console.log('✅ Viajes de biomasa cargados (sin success flag):', viajesResult.records.length);
        } else {
          console.warn('⚠️ No se encontraron datos de viajes biomasa');
          setViajesBiomasa([]);
        }
      } else {
        const errorText = await viajesResponse.text();
        console.error('❌ Error al cargar viajes de biomasa:', viajesResponse.status, errorText);
        setViajesBiomasa([]);
      }
    } catch (error) {
      console.error('❌ Error al cargar datos de promedios:', error);
      setBalanceMasaData([]);
      setViajesBiomasa([]);
      setTurnoData([]);
    } finally {
      setLoadingPromedios(false);
    }
  };

  useEffect(() => {
    loadBachesPirolisis();
    loadPromediosData();
  }, []);



  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('/textura-biochar.jpg')"
      }}
    >
      {/* Overlay translúcido */}
      <div className="absolute inset-0 bg-black/30"></div>
      
      <div className="relative z-10">
        <Navbar />
        
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">Dashboard de Producción</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow text-lg">
              Monitoreo en tiempo real de las operaciones de producción y métricas clave de rendimiento
            </p>

            {/* Métricas Principales */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Métricas de Producción</h2>
              
              {/* Primera fila de métricas principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-white mb-6">
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      metrics.totalBaches
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Total Baches</div>
                </div>
                
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {metrics.biocharHumedoTotal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        <span className="text-lg ml-1 text-white/90">kg</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Biochar Húmedo Total</div>
                </div>
                
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {metrics.biocharSecoTotal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        <span className="text-lg ml-1 text-white/90">kg</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Biochar Seco Actual</div>
                </div>
                
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      metrics.lonasUsadasTotal
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Lonas Utilizadas</div>
                </div>
              </div>

              {/* Mensaje informativo si no hay datos */}
              {!bachesLoading && metrics.totalBaches === 0 && (
                <div className="mt-4 p-3 bg-amber-500/20 border border-amber-400/30 rounded-lg">
                  <div className="text-amber-200 text-sm">
                    <strong>Aviso:</strong> No hay baches registrados en el sistema. Las métricas se actualizarán automáticamente cuando se agreguen baches.
                  </div>
                </div>
              )}
            </div>

            {/* Métricas de Turnos */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Estadísticas de Turnos</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="text-center bg-gradient-to-br from-blue-500/20 to-blue-600/10 p-4 rounded-lg border border-blue-400/30">
                  <div className="text-3xl font-bold text-blue-200 mb-2">
                    {loadingPromedios ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      turnoMetrics.totalTurnos
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Total Turnos</div>
                </div>
                
                <div className="text-center bg-gradient-to-br from-purple-500/20 to-purple-600/10 p-4 rounded-lg border border-purple-400/30">
                  <div className="text-3xl font-bold text-purple-200 mb-2">
                    {loadingPromedios ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {turnoMetrics.horasTotales.toFixed(1)}
                        <span className="text-lg ml-1 text-white/90">h</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Horas Totales</div>
                </div>
                
                <div className="text-center bg-gradient-to-br from-green-500/20 to-green-600/10 p-4 rounded-lg border border-green-400/30">
                  <div className="text-3xl font-bold text-green-200 mb-2">
                    {loadingPromedios ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {turnoMetrics.promedioHorasPorTurno.toFixed(1)}
                        <span className="text-lg ml-1 text-white/90">h</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Promedio por Turno</div>
                </div>
                
                <div className="text-center bg-gradient-to-br from-orange-500/20 to-orange-600/10 p-4 rounded-lg border border-orange-400/30">
                  <div className="text-3xl font-bold text-orange-200 mb-2">
                    {loadingPromedios ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      turnoMetrics.operadores.length
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Operadores Activos</div>
                </div>
              </div>

              {/* Consumos Totales */}
              <div className="border-t border-white/20 pt-4">
                <h3 className="text-lg font-medium text-white mb-4">Consumos Acumulados</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white/10 p-4 rounded-lg border border-white/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/70">Energía Total</span>
                      <span className="text-xs bg-yellow-500/30 text-yellow-200 px-2 py-1 rounded">kWh</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-200">
                      {loadingPromedios ? '...' : turnoMetrics.energiaTotal.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {loadingPromedios ? '...' : `${turnoMetrics.energiaPorHora.toFixed(1)} kWh/hora`}
                    </div>
                  </div>
                  
                  <div className="bg-white/10 p-4 rounded-lg border border-white/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/70">Biogas Total</span>
                      <span className="text-xs bg-green-500/30 text-green-200 px-2 py-1 rounded">m³</span>
                    </div>
                    <div className="text-2xl font-bold text-green-200">
                      {loadingPromedios ? '...' : turnoMetrics.biogasTotal.toLocaleString('es-CO')}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {loadingPromedios ? '...' : `${turnoMetrics.biogasPorHora.toFixed(1)} m³/hora`}
                    </div>
                  </div>
                  
                  <div className="bg-white/10 p-4 rounded-lg border border-white/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/70">Biomasa Ingresada</span>
                      <span className="text-xs bg-blue-500/30 text-blue-200 px-2 py-1 rounded">kg</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-200">
                      {loadingPromedios ? '...' : turnoMetrics.biomasaTotalIngresada.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      Total procesada
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rendimiento por Operador */}
            {turnoMetrics.operadores.length > 0 && (
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Rendimiento por Operador</h2>
                
                <div className="space-y-4">
                  {Object.entries(turnoMetrics.consumoPorOperador).map(([operador, datos]: [string, any]) => (
                    <div key={operador} className="bg-white/10 p-4 rounded-lg border border-white/20">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-semibold text-white">{operador}</h3>
                        <span className="text-sm bg-blue-500/30 text-blue-200 px-3 py-1 rounded-full">
                          {datos.turnos} {datos.turnos === 1 ? 'turno' : 'turnos'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs text-white/60 mb-1">Horas Trabajadas</div>
                          <div className="text-lg font-bold text-white">{datos.horas.toFixed(1)} h</div>
                        </div>
                        <div>
                          <div className="text-xs text-white/60 mb-1">Energía</div>
                          <div className="text-lg font-bold text-yellow-200">{datos.energia.toFixed(1)} kWh</div>
                        </div>
                        <div>
                          <div className="text-xs text-white/60 mb-1">Biogas</div>
                          <div className="text-lg font-bold text-green-200">{datos.biogas.toLocaleString('es-CO')} m³</div>
                        </div>
                        <div>
                          <div className="text-xs text-white/60 mb-1">Biomasa</div>
                          <div className="text-lg font-bold text-blue-200">{datos.biomasa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg</div>
                        </div>
                      </div>
                      
                      {/* Eficiencia promedio */}
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <span className="text-white/60">Energía/hora: </span>
                            <span className="text-white font-semibold">{(datos.energia / datos.horas).toFixed(1)} kWh</span>
                          </div>
                          <div>
                            <span className="text-white/60">Biogas/hora: </span>
                            <span className="text-white font-semibold">{(datos.biogas / datos.horas).toFixed(1)} m³</span>
                          </div>
                          <div>
                            <span className="text-white/60">Biomasa/hora: </span>
                            <span className="text-white font-semibold">{(datos.biomasa / datos.horas).toFixed(0)} kg</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Turnos Recientes */}
            {turnoMetrics.turnosRecientes.length > 0 && (
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Turnos Recientes</h2>
                
                <div className="space-y-3">
                  {turnoMetrics.turnosRecientes.map((turno, index) => {
                    const fechaInicio = turno.fields?.['Fecha Inicio Turno'] ? new Date(turno.fields['Fecha Inicio Turno']) : null;
                    const fechaFin = turno.fields?.['Fecha Fin Turno'] ? new Date(turno.fields['Fecha Fin Turno']) : null;
                    const operador = turno.fields?.['Operador'] || 'Sin asignar';
                    const horas = turno.fields?.['Cálculo'] || 0;
                    const energia = turno.fields?.['Total Energia Consumida'] || 0;
                    const biogas = turno.fields?.['Total Biogas Consumido'] || 0;
                    const alimentacion = turno.fields?.['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'] || 0;

                    return (
                      <div key={turno.id} className="bg-white/10 p-4 rounded-lg border border-white/20 hover:bg-white/15 transition-all">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="text-lg font-semibold text-white">{operador}</div>
                            <div className="text-sm text-white/70">
                              {fechaInicio ? fechaInicio.toLocaleDateString('es-CO', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Fecha no disponible'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm bg-purple-500/30 text-purple-200 px-3 py-1 rounded-full">
                              {horas.toFixed(1)} horas
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white/5 p-2 rounded">
                            <div className="text-xs text-white/60">Energía</div>
                            <div className="text-sm font-bold text-yellow-200">{energia.toFixed(1)} kWh</div>
                          </div>
                          <div className="bg-white/5 p-2 rounded">
                            <div className="text-xs text-white/60">Biogas</div>
                            <div className="text-sm font-bold text-green-200">{biogas} m³</div>
                          </div>
                          <div className="bg-white/5 p-2 rounded">
                            <div className="text-xs text-white/60">Alimentación</div>
                            <div className="text-sm font-bold text-blue-200">{alimentacion} kg/min</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Análisis de Eficiencia */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Eficiencia Energética */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Eficiencia Energética
                </h3>
                <div className="space-y-4">
                  <div className="bg-white/10 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-white/70">Consumo Promedio por Hora</span>
                      <span className="text-lg font-bold text-yellow-200">
                        {loadingPromedios ? '...' : `${turnoMetrics.energiaPorHora.toFixed(2)} kWh`}
                      </span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((turnoMetrics.energiaPorHora / 10) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="bg-white/10 p-4 rounded-lg">
                    <div className="text-sm text-white/70 mb-2">Energía vs Biomasa</div>
                    <div className="text-lg font-bold text-white">
                      {loadingPromedios ? '...' : 
                        turnoMetrics.biomasaTotalIngresada > 0 
                          ? `${(turnoMetrics.energiaTotal / turnoMetrics.biomasaTotalIngresada * 1000).toFixed(2)} kWh/ton`
                          : '0 kWh/ton'
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Eficiencia de Biogas */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Consumo de Biogas
                </h3>
                <div className="space-y-4">
                  <div className="bg-white/10 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-white/70">Consumo Promedio por Hora</span>
                      <span className="text-lg font-bold text-green-200">
                        {loadingPromedios ? '...' : `${turnoMetrics.biogasPorHora.toFixed(2)} m³`}
                      </span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((turnoMetrics.biogasPorHora / 100) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="bg-white/10 p-4 rounded-lg">
                    <div className="text-sm text-white/70 mb-2">Biogas vs Biomasa</div>
                    <div className="text-lg font-bold text-white">
                      {loadingPromedios ? '...' : 
                        turnoMetrics.biomasaTotalIngresada > 0 
                          ? `${(turnoMetrics.biogasTotal / turnoMetrics.biomasaTotalIngresada * 1000).toFixed(2)} m³/ton`
                          : '0 m³/ton'
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Monitoreo de Temperaturas */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Monitoreo de Temperaturas</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center bg-gradient-to-br from-red-500/20 to-red-600/10 p-4 rounded-lg border border-red-400/30">
                  <div className="text-3xl font-bold text-red-200 mb-2">
                    {loadingPromedios ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      tempMetrics.totalRegistros
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Registros de Temperatura</div>
                </div>
                
                <div className="text-center bg-gradient-to-br from-orange-500/20 to-orange-600/10 p-4 rounded-lg border border-orange-400/30">
                  <div className="text-3xl font-bold text-orange-200 mb-2">
                    {loadingPromedios ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {tempMetrics.promedioGeneral.toFixed(0)}
                        <span className="text-lg ml-1 text-white/90">°C</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Temperatura Promedio</div>
                </div>
                
                <div className="text-center bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 p-4 rounded-lg border border-yellow-400/30">
                  <div className="text-3xl font-bold text-yellow-200 mb-2">
                    {loadingPromedios ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {tempMetrics.pesoTotalBiochar.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                        <span className="text-lg ml-1 text-white/90">kg</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Biochar Registrado</div>
                </div>
              </div>

              {/* Alertas de Temperatura */}
              {tempMetrics.alertas.length > 0 && (
                <div className="mb-4 p-4 bg-amber-500/20 border border-amber-400/30 rounded-lg">
                  <h3 className="text-sm font-semibold text-amber-200 mb-2">⚠️ Alertas de Temperatura</h3>
                  <div className="space-y-2">
                    {tempMetrics.alertas.map((alerta, index) => (
                      <div key={index} className="text-sm text-amber-100">
                        <strong>{alerta.zona}</strong>: Promedio {alerta.promedio.toFixed(0)}°C - Fuera de rango óptimo
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Temperaturas por Zona */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Reactores */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg flex items-center">
                  <span className="mr-2">🔥</span> Reactores
                </h3>
                <div className="space-y-4">
                  {['r1', 'r2', 'r3'].map((reactor, index) => {
                    const data = tempMetrics.temperaturas.reactor[reactor as keyof typeof tempMetrics.temperaturas.reactor];
                    return (
                      <div key={reactor} className="bg-white/10 p-4 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-semibold text-white">Reactor R{index + 1}</span>
                          <span className="text-lg font-bold text-red-200">{data.avg.toFixed(0)}°C</span>
                        </div>
                        <div className="w-full bg-white/20 rounded-full h-2 mb-2">
                          <div 
                            className="bg-gradient-to-r from-red-400 to-red-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((data.avg / 800) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-white/60">
                          <span>Min: {data.min.toFixed(0)}°C</span>
                          <span>Max: {data.max.toFixed(0)}°C</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hornos */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg flex items-center">
                  <span className="mr-2">🌡️</span> Hornos
                </h3>
                <div className="space-y-4">
                  {['h1', 'h3', 'h4'].map((horno, index) => {
                    const data = tempMetrics.temperaturas.horno[horno as keyof typeof tempMetrics.temperaturas.horno];
                    const hornoNum = horno === 'h1' ? 1 : horno === 'h3' ? 3 : 4;
                    return (
                      <div key={horno} className="bg-white/10 p-4 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-semibold text-white">Horno H{hornoNum}</span>
                          <span className="text-lg font-bold text-orange-200">{data.avg.toFixed(0)}°C</span>
                        </div>
                        <div className="w-full bg-white/20 rounded-full h-2 mb-2">
                          <div 
                            className="bg-gradient-to-r from-orange-400 to-orange-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((data.avg / 800) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-white/60">
                          <span>Min: {data.min.toFixed(0)}°C</span>
                          <span>Max: {data.max.toFixed(0)}°C</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ducto */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg flex items-center">
                  <span className="mr-2">💨</span> Ducto
                </h3>
                <div className="space-y-4">
                  <div className="bg-white/10 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-white">Ducto G9</span>
                      <span className="text-lg font-bold text-blue-200">{tempMetrics.temperaturas.ducto.g9.avg.toFixed(0)}°C</span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-2 mb-2">
                      <div 
                        className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((tempMetrics.temperaturas.ducto.g9.avg / 400) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-white/60">
                      <span>Min: {tempMetrics.temperaturas.ducto.g9.min.toFixed(0)}°C</span>
                      <span>Max: {tempMetrics.temperaturas.ducto.g9.max.toFixed(0)}°C</span>
                    </div>
                  </div>
                  
                  {/* Información adicional */}
                  <div className="bg-white/10 p-4 rounded-lg">
                    <div className="text-xs text-white/70 mb-2">Rango Óptimo</div>
                    <div className="text-sm text-white font-semibold">200°C - 300°C</div>
                    <div className="mt-2 text-xs text-white/60">
                      Estado: {tempMetrics.temperaturas.ducto.g9.avg >= 200 && tempMetrics.temperaturas.ducto.g9.avg <= 300 
                        ? '✅ Normal' 
                        : '⚠️ Revisar'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Flujo de Temperaturas (Últimos Registros) */}
            {tempMetrics.registrosParaGrafica.length > 0 && (
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Flujo de Temperaturas - Últimos {tempMetrics.registrosParaGrafica.length} Registros</h2>
                
                {/* Gráfica profesional de líneas múltiples */}
                <div className="bg-gradient-to-br from-gray-900/40 to-gray-800/40 p-8 rounded-lg mb-6 border border-white/10">
                  <div className="relative" style={{ height: '450px' }}>
                    {/* Título del gráfico */}
                    <div className="text-center mb-4">
                      <h3 className="text-sm font-semibold text-white/90">Evolución de Temperaturas en el Sistema de Pirólisis</h3>
                      <p className="text-xs text-white/60 mt-1">Monitoreo continuo de zonas críticas</p>
                    </div>

                    {/* Eje Y con etiquetas mejoradas */}
                    <div className="absolute left-0 top-12 bottom-20 flex flex-col justify-between text-xs font-medium text-white/70 pr-3 pt-2">
                      <span className="text-right">800°C</span>
                      <span className="text-right">700°C</span>
                      <span className="text-right">600°C</span>
                      <span className="text-right">500°C</span>
                      <span className="text-right">400°C</span>
                      <span className="text-right">300°C</span>
                      <span className="text-right">200°C</span>
                      <span className="text-right">100°C</span>
                      <span className="text-right">0°C</span>
                    </div>
                    
                    {/* Área del gráfico con grid mejorado */}
                    <div className="absolute left-16 right-8 top-12 bottom-20">
                      {/* Grid horizontal */}
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <div 
                          key={`grid-h-${i}`}
                          className="absolute w-full border-t border-white/5"
                          style={{ top: `${(i / 8) * 100}%` }}
                        ></div>
                      ))}
                      
                      {/* Grid vertical */}
                      {Array.from({ length: Math.min(tempMetrics.registrosParaGrafica.length, 10) }).map((_, i) => (
                        <div 
                          key={`grid-v-${i}`}
                          className="absolute h-full border-l border-white/5"
                          style={{ left: `${(i / Math.max(1, Math.min(tempMetrics.registrosParaGrafica.length, 10) - 1)) * 100}%` }}
                        ></div>
                      ))}

                      {/* SVG para las líneas */}
                      <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <defs>
                          {/* Gradientes para las líneas */}
                          <linearGradient id="gradientR1" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9"/>
                            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.7"/>
                          </linearGradient>
                          <linearGradient id="gradientR2" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#f97316" stopOpacity="0.9"/>
                            <stop offset="100%" stopColor="#ea580c" stopOpacity="0.7"/>
                          </linearGradient>
                          <linearGradient id="gradientR3" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9"/>
                            <stop offset="100%" stopColor="#d97706" stopOpacity="0.7"/>
                          </linearGradient>
                          <linearGradient id="gradientH1" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.9"/>
                            <stop offset="100%" stopColor="#059669" stopOpacity="0.7"/>
                          </linearGradient>
                          <linearGradient id="gradientH3" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9"/>
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.7"/>
                          </linearGradient>
                          <linearGradient id="gradientH4" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.9"/>
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.7"/>
                          </linearGradient>
                        </defs>

                        {/* Renderizar las líneas */}
                        {(() => {
                          const numPoints = tempMetrics.registrosParaGrafica.length;
                          if (numPoints === 0) return null;
                          
                          // Crear líneas para cada sensor
                          const createPath = (sensorKey: string, color: string, strokeWidth: number = 0.4) => {
                            const points = tempMetrics.registrosParaGrafica.map((registro, index) => {
                              const temp = registro.fields?.[sensorKey] || 0;
                              const x = (index / Math.max(1, numPoints - 1)) * 100;
                              const y = 100 - ((temp / 800) * 100);
                              const fecha = registro.fields?.['Fecha'] || registro.createdTime;
                              return { x, y, temp, fecha };
                            });

                            // Crear path con curvas suaves (catmull-rom spline)
                            const createSmoothPath = (points: any[]) => {
                              if (points.length < 2) return '';
                              
                              let path = `M ${points[0].x} ${points[0].y}`;
                              
                              for (let i = 0; i < points.length - 1; i++) {
                                const current = points[i];
                                const next = points[i + 1];
                                const controlX = (current.x + next.x) / 2;
                                
                                path += ` Q ${controlX} ${current.y}, ${controlX} ${(current.y + next.y) / 2}`;
                                path += ` Q ${controlX} ${next.y}, ${next.x} ${next.y}`;
                              }
                              
                              return path;
                            };

                            const pathData = createSmoothPath(points);

                            return (
                              <g key={sensorKey}>
                                {/* Área de relleno sutil */}
                                <path
                                  d={`${pathData} L 100 100 L 0 100 Z`}
                                  fill={color}
                                  fillOpacity="0.05"
                                />
                                {/* Línea principal */}
                                <path
                                  d={pathData}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth={strokeWidth}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
                                />
                                {/* Puntos de datos */}
                                {points.map((point, i) => {
                                  const fechaFormat = point.fecha ? new Date(point.fecha).toLocaleString('es-MX', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  }) : `Punto ${i + 1}`;
                                  
                                  return (
                                    <g key={`point-${i}`}>
                                      <circle
                                        cx={point.x}
                                        cy={point.y}
                                        r="0.6"
                                        fill={color}
                                        stroke="white"
                                        strokeWidth="0.2"
                                        vectorEffect="non-scaling-stroke"
                                        className="transition-all duration-200 cursor-pointer"
                                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                                      >
                                        <title>{`${fechaFormat}\n${sensorKey}: ${point.temp.toFixed(1)}°C`}</title>
                                      </circle>
                                    </g>
                                  );
                                })}
                              </g>
                            );
                          };

                          return (
                            <>
                              {createPath('Temperatura Reactor (R1)', 'url(#gradientR1)', 0.5)}
                              {createPath('Temperatura Reactor (R2)', 'url(#gradientR2)', 0.5)}
                              {createPath('Temperatura Reactor (R3)', 'url(#gradientR3)', 0.5)}
                              {createPath('Temperatura Horno (H1)', 'url(#gradientH1)', 0.5)}
                              {createPath('Temperatura Horno (H3)', 'url(#gradientH3)', 0.5)}
                              {createPath('Temperatura Horno (H4)', 'url(#gradientH4)', 0.5)}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                    
                    {/* Eje X - Fechas */}
                    <div className="absolute bottom-12 left-16 right-8 flex justify-between text-xs text-white/60">
                      {tempMetrics.registrosParaGrafica.length > 0 && (
                        <>
                          <span className="text-left">
                            {new Date(tempMetrics.registrosParaGrafica[0].fields?.['Fecha'] || tempMetrics.registrosParaGrafica[0].createdTime).toLocaleString('es-MX', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {tempMetrics.registrosParaGrafica.length > 2 && (
                            <span className="text-center">
                              {new Date(tempMetrics.registrosParaGrafica[Math.floor(tempMetrics.registrosParaGrafica.length / 2)].fields?.['Fecha'] || 
                                tempMetrics.registrosParaGrafica[Math.floor(tempMetrics.registrosParaGrafica.length / 2)].createdTime).toLocaleString('es-MX', { 
                                month: 'short', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                          <span className="text-right">
                            {new Date(tempMetrics.registrosParaGrafica[tempMetrics.registrosParaGrafica.length - 1].fields?.['Fecha'] || 
                              tempMetrics.registrosParaGrafica[tempMetrics.registrosParaGrafica.length - 1].createdTime).toLocaleString('es-MX', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </>
                      )}
                    </div>
                    
                    {/* Leyenda profesional */}
                    <div className="absolute bottom-0 left-16 right-8 flex flex-wrap justify-center gap-4 text-xs pt-4 border-t border-white/10">
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full">
                        <div className="w-8 h-0.5 bg-gradient-to-r from-red-500 to-red-600 rounded-full"></div>
                        <span className="text-white/90 font-medium">Reactor R1</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full">
                        <div className="w-8 h-0.5 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full"></div>
                        <span className="text-white/90 font-medium">Reactor R2</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full">
                        <div className="w-8 h-0.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"></div>
                        <span className="text-white/90 font-medium">Reactor R3</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full">
                        <div className="w-8 h-0.5 bg-gradient-to-r from-green-500 to-green-600 rounded-full"></div>
                        <span className="text-white/90 font-medium">Horno H1</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full">
                        <div className="w-8 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"></div>
                        <span className="text-white/90 font-medium">Horno H3</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full">
                        <div className="w-8 h-0.5 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full"></div>
                        <span className="text-white/90 font-medium">Horno H4</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabla de registros */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left text-white/80 pb-2 px-2">Fecha</th>
                        <th className="text-center text-white/80 pb-2 px-2">R1</th>
                        <th className="text-center text-white/80 pb-2 px-2">R2</th>
                        <th className="text-center text-white/80 pb-2 px-2">R3</th>
                        <th className="text-center text-white/80 pb-2 px-2">H1</th>
                        <th className="text-center text-white/80 pb-2 px-2">H3</th>
                        <th className="text-center text-white/80 pb-2 px-2">H4</th>
                        <th className="text-center text-white/80 pb-2 px-2">G9</th>
                        <th className="text-center text-white/80 pb-2 px-2">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tempMetrics.registrosParaGrafica.map((registro, index) => {
                        const fecha = registro.fields?.['Fecha Creacion'] ? new Date(registro.fields['Fecha Creacion']) : null;
                        return (
                          <tr key={registro.id} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-2 px-2 text-white/90 text-xs">
                              {fecha ? fecha.toLocaleString('es-CO', { 
                                day: '2-digit', 
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'N/A'}
                            </td>
                            <td className="text-center py-2 px-2 text-red-200 font-semibold">{registro.fields?.['Temperatura Reactor (R1)'] || '-'}</td>
                            <td className="text-center py-2 px-2 text-red-200 font-semibold">{registro.fields?.['Temperatura Reactor (R2)'] || '-'}</td>
                            <td className="text-center py-2 px-2 text-red-200 font-semibold">{registro.fields?.['Temperatura Reactor (R3)'] || '-'}</td>
                            <td className="text-center py-2 px-2 text-orange-200 font-semibold">{registro.fields?.['Temperatura Horno (H1)'] || '-'}</td>
                            <td className="text-center py-2 px-2 text-orange-200 font-semibold">{registro.fields?.['Temperatura Horno (H3)'] || '-'}</td>
                            <td className="text-center py-2 px-2 text-orange-200 font-semibold">{registro.fields?.['Temperatura Horno (H4)'] || '-'}</td>
                            <td className="text-center py-2 px-2 text-blue-200 font-semibold">{registro.fields?.['Temperatura Ducto (G9)'] || '-'}</td>
                            <td className="text-center py-2 px-2 text-yellow-200 font-semibold">{registro.fields?.['Peso Biochar (KG)'] || '-'} kg</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Análisis Comparativo de Zonas */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Análisis Comparativo por Zonas</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Promedio Reactores */}
                <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 p-6 rounded-lg border border-red-400/30">
                  <h3 className="text-lg font-bold text-red-200 mb-4">Zona Reactores</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-white/70">Temperatura Promedio</div>
                      <div className="text-3xl font-bold text-white">
                        {(
                          (tempMetrics.temperaturas.reactor.r1.avg + 
                           tempMetrics.temperaturas.reactor.r2.avg + 
                           tempMetrics.temperaturas.reactor.r3.avg) / 3
                        ).toFixed(0)}°C
                      </div>
                    </div>
                    <div className="pt-3 border-t border-white/20">
                      <div className="text-xs text-white/60">Rango Operativo</div>
                      <div className="text-sm text-white font-semibold">400°C - 750°C</div>
                    </div>
                  </div>
                </div>

                {/* Promedio Hornos */}
                <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 p-6 rounded-lg border border-orange-400/30">
                  <h3 className="text-lg font-bold text-orange-200 mb-4">Zona Hornos</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-white/70">Temperatura Promedio</div>
                      <div className="text-3xl font-bold text-white">
                        {(
                          (tempMetrics.temperaturas.horno.h1.avg + 
                           tempMetrics.temperaturas.horno.h3.avg + 
                           tempMetrics.temperaturas.horno.h4.avg) / 3
                        ).toFixed(0)}°C
                      </div>
                    </div>
                    <div className="pt-3 border-t border-white/20">
                      <div className="text-xs text-white/60">Rango Operativo</div>
                      <div className="text-sm text-white font-semibold">300°C - 700°C</div>
                    </div>
                  </div>
                </div>

                {/* Ducto */}
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 p-6 rounded-lg border border-blue-400/30">
                  <h3 className="text-lg font-bold text-blue-200 mb-4">Sistema Ducto</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-white/70">Temperatura Actual</div>
                      <div className="text-3xl font-bold text-white">
                        {tempMetrics.temperaturas.ducto.g9.avg.toFixed(0)}°C
                      </div>
                    </div>
                    <div className="pt-3 border-t border-white/20">
                      <div className="text-xs text-white/60">Rango Operativo</div>
                      <div className="text-sm text-white font-semibold">200°C - 300°C</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════ */}
            {/* SECCIÓN: VIAJES DE BIOMASA */}
            {/* ═══════════════════════════════════════════════════════════════════ */}

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-6 drop-shadow-lg flex items-center gap-3">
                <span className="text-3xl">🚛</span>
                Logística de Biomasa - Viajes y Entregas
              </h2>

              {/* Indicador de carga o sin datos */}
              {loadingPromedios && viajesBiomasa.length === 0 && (
                <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-12 border border-white/30 text-center mb-6">
                  <div className="text-white/70 text-lg">⏳ Cargando datos de viajes...</div>
                </div>
              )}

              {!loadingPromedios && viajesBiomasa.length === 0 && (
                <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-12 border border-white/30 text-center mb-6">
                  <div className="text-white/70 text-lg mb-2">📭 No hay viajes registrados</div>
                  <div className="text-white/50 text-sm">Los datos aparecerán aquí cuando se registren viajes de biomasa</div>
                </div>
              )}

              {/* Métricas Principales de Viajes */}
              {viajesBiomasa.length > 0 && (
              <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-green-400/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-200 text-sm font-medium">Total Viajes</p>
                      <h3 className="text-4xl font-bold text-white mt-2">{viajesMetrics.totalViajes}</h3>
                      <p className="text-green-300 text-xs mt-1">Entregas registradas</p>
                    </div>
                    <div className="text-5xl text-green-300/30">🚛</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-amber-400/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-amber-200 text-sm font-medium">Biomasa Total</p>
                      <h3 className="text-4xl font-bold text-white mt-2">
                        {(viajesMetrics.pesoTotalFresco / 1000).toFixed(1)}
                      </h3>
                      <p className="text-amber-300 text-xs mt-1">Toneladas húmedas</p>
                    </div>
                    <div className="text-5xl text-amber-300/30">⚖️</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-blue-400/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-200 text-sm font-medium">Peso Promedio</p>
                      <h3 className="text-4xl font-bold text-white mt-2">
                        {viajesMetrics.pesoPromedio.toFixed(0)}
                      </h3>
                      <p className="text-blue-300 text-xs mt-1">Kg por viaje</p>
                    </div>
                    <div className="text-5xl text-blue-300/30">📊</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-cyan-400/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-cyan-200 text-sm font-medium">Humedad Promedio</p>
                      <h3 className="text-4xl font-bold text-white mt-2">
                        {viajesMetrics.humedadPromedio.toFixed(1)}%
                      </h3>
                      <p className="text-cyan-300 text-xs mt-1">Contenido de agua</p>
                    </div>
                    <div className="text-5xl text-cyan-300/30">💧</div>
                  </div>
                </div>
              </div>

              {/* Distribución por Tipo de Biomasa y Vehículos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Por Tipo de Biomasa */}
                <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="text-xl">🌾</span>
                    Distribución por Tipo de Biomasa
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(viajesMetrics.porTipoBiomasa).map(([tipo, data]: [string, any]) => (
                      <div key={tipo} className="bg-white/10 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-white/90 font-medium text-sm">{tipo}</span>
                          <span className="text-white/70 text-xs">{data.viajes} viajes</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-white/10 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-green-400 to-green-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${(data.peso / viajesMetrics.pesoTotalFresco) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-white font-bold text-sm min-w-[80px] text-right">
                            {(data.peso / 1000).toFixed(1)} ton
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Por Tipo de Vehículo */}
                <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="text-xl">🚜</span>
                    Distribución por Tipo de Vehículo
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(viajesMetrics.porVehiculo).map(([vehiculo, data]: [string, any]) => (
                      <div key={vehiculo} className="bg-white/10 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-white/90 font-medium text-sm">{vehiculo}</span>
                          <span className="text-white/70 text-xs">{data.viajes} viajes</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-white/10 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-400 to-blue-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${(data.viajes / viajesMetrics.totalViajes) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-white font-bold text-sm min-w-[80px] text-right">
                            {((data.viajes / viajesMetrics.totalViajes) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rendimiento por Operador */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">👷</span>
                  Rendimiento por Operador
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(viajesMetrics.porOperador)
                    .sort(([, a]: [string, any], [, b]: [string, any]) => b.viajes - a.viajes)
                    .slice(0, 6)
                    .map(([operador, data]: [string, any]) => (
                      <div key={operador} className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-lg p-4 border border-purple-400/20">
                        <div className="text-white/90 font-medium mb-2 text-sm truncate">{operador}</div>
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-2xl font-bold text-white">{data.viajes}</div>
                            <div className="text-xs text-white/60">viajes</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-purple-300">
                              {(data.peso / 1000).toFixed(1)}
                            </div>
                            <div className="text-xs text-white/60">toneladas</div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Viajes Recientes */}
              {viajesMetrics.viajesRecientes.length > 0 && (
                <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="text-xl">📋</span>
                    Últimos {viajesMetrics.viajesRecientes.length} Viajes Registrados
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left text-white/80 pb-3 px-3">Fecha</th>
                          <th className="text-left text-white/80 pb-3 px-3">Operador</th>
                          <th className="text-left text-white/80 pb-3 px-3">Tipo Biomasa</th>
                          <th className="text-center text-white/80 pb-3 px-3">Peso (kg)</th>
                          <th className="text-center text-white/80 pb-3 px-3">Vehículo</th>
                          <th className="text-center text-white/80 pb-3 px-3">Humedad %</th>
                          <th className="text-left text-white/80 pb-3 px-3">Registrado por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viajesMetrics.viajesRecientes.map((viaje, index) => {
                          const fecha = new Date(viaje.fields?.['Fecha Entrega'] || viaje.createdTime);
                          const humedad = viaje.fields?.['Porcentaje Humedad (from Monitoreo Viajes Biomasa)'];
                          
                          return (
                            <tr key={viaje.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                              <td className="py-3 px-3 text-white/90 text-xs">
                                {fecha.toLocaleString('es-MX', { 
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="py-3 px-3 text-white/90 font-medium">
                                {viaje.fields?.['Nombre Quien Entrega'] || 'N/A'}
                              </td>
                              <td className="py-3 px-3 text-green-300">
                                {viaje.fields?.['Tipo Biomasa'] || 'N/A'}
                              </td>
                              <td className="text-center py-3 px-3 text-amber-300 font-bold">
                                {viaje.fields?.['Peso entregado de masa fresca']?.toFixed(0) || 0}
                              </td>
                              <td className="text-center py-3 px-3 text-blue-300 text-xs">
                                {viaje.fields?.['Tipo Vehículo'] || 'N/A'}
                              </td>
                              <td className="text-center py-3 px-3 text-cyan-300 font-semibold">
                                {humedad && Array.isArray(humedad) ? humedad[0].toFixed(1) : '-'}%
                              </td>
                              <td className="py-3 px-3 text-white/70 text-xs">
                                {viaje.fields?.['Realiza Registro'] || 'N/A'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </>
            )}
            </div>

          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}