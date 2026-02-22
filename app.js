const STORAGE_KEY = "gs_use_supabase";
const SUPABASE_URL = "https://pxpujmdlobwopqqbudwi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cHVqbWRsb2J3b3BxcWJ1ZHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTE4NjYsImV4cCI6MjA4Njc2Nzg2Nn0.f1R38JNM09UkI-2hzng5iYNUbCHq4cyjZXfngr1q64E";
const DELETED_SUST_KEY = "gs_deleted_sustituciones_ids";

const storageKeys = {
  profesores: "gs_profesores",
  materias: "gs_materias",
  tabla: "gs_tabla_sust",
  sustituciones: "gs_sustituciones",
  bajas: "gs_bajas",
};

// Devuelve el Set de IDs de sustituciones borradas en este dispositivo
const getDeletedSustitutionIds = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELETED_SUST_KEY) || "[]"));
  } catch { return new Set(); }
};

// Añade IDs al registro de sustituciones borradas (máx. 500 entradas)
const addDeletedSustitutionIds = (ids) => {
  const existing = getDeletedSustitutionIds();
  ids.forEach(id => existing.add(id));
  let arr = [...existing];
  if (arr.length > 500) arr = arr.slice(arr.length - 500);
  localStorage.setItem(DELETED_SUST_KEY, JSON.stringify(arr));
};



const useSupabase = () => {
  const val = localStorage.getItem(STORAGE_KEY);
  // Por defecto, Supabase está activado. Solo se desactiva si el usuario lo desactiva explícitamente
  return val !== "false";
};

const supabaseFetch = async (table) => {
  try {
    // Usar paginación para traer todos los registros (el servidor limita a 1000 por petición)
    const allData = [];
    const limit = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });

      if (!res.ok) {
        console.error(`[Supabase] Error fetching ${table}:`, res.status);
        break;
      }

      const data = await res.json();
      allData.push(...data);

      // Si recibimos menos de `limit` registros, hemos llegado al final
      if (data.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    console.log(`[DEBUG] Supabase fetch ${table}: ${allData.length} registros totales`);

    // Renombrar columnas de Supabase al formato de la app
    return allData.map(item => {
      const normalized = { ...item };
      if (table === 'tabla_horario' || table === 'materias') {
        normalized.diaSemana = normalized.diasemana;
        normalized.horaInicio = normalized.horainicio;
        normalized.horaFin = normalized.horafin;
        normalized.profesorId = normalized.profesorid;
        normalized.profesorNombre = normalized.profesornombre;
        normalized.cursoGrupo = normalized.cursogrupo;
        // Keep "asignatura" for tabla_horario, rename for materias
        if (table === 'materias') {
          normalized.materia = normalized.asignatura;
          delete normalized.asignatura;
        }
        delete normalized.diasemana;
        delete normalized.horainicio;
        delete normalized.horafin;
        delete normalized.profesorid;
        delete normalized.profesornombre;
        delete normalized.cursogrupo;
      }
      if (table === 'sustituciones') {
        // Convertir de minúsculas (Supabase) a camelCase (app)
        normalized.diaSemana = normalized.diasemana;
        normalized.horaInicio = normalized.horainicio;
        normalized.horaFin = normalized.horafin;
        normalized.profesorAusenteId = normalized.profesorausenteid;
        normalized.profesorSustitutoId = normalized.profesorsustitutoid;
        normalized.profesorExtraId = normalized.profesorextraid;
        normalized.cursoGrupoMateria = normalized.cursogrupomateria;
        delete normalized.diasemana;
        delete normalized.horainicio;
        delete normalized.horafin;
        delete normalized.profesorausenteid;
        delete normalized.profesorsustitutoid;
        delete normalized.profesorextraid;
        delete normalized.cursogrupomateria;
      }

      if (table === 'bajas') {
        // Convertir de minúsculas (Supabase) a camelCase (app)
        normalized.profesorBajaId = normalized.profesorbajaid;
        normalized.profesorBajaNombre = normalized.profesorbajanombre;
        normalized.profesorRelevistaId = normalized.profesorrelevistaid;
        normalized.profesorRelevistaNombre = normalized.profesorrelevistanombre;
        normalized.fechaInicio = normalized.fechainicio;
        normalized.fechaFin = normalized.fechafin;
        delete normalized.profesorbajaid;
        delete normalized.profesorbajanombre;
        delete normalized.profesorrelevistaid;
        delete normalized.profesorrelevistanombre;
        delete normalized.fechainicio;
        delete normalized.fechafin;
      }

      return normalized;
    });
  } catch (e) {
    console.error("Supabase fetch error:", e);
    return [];
  }
};

let isSyncing = false;

const supabaseSync = async () => {
  if (!useSupabase() || isSyncing) return;
  isSyncing = true;
  console.log("[Supabase] Starting sync...");
  const tables = {
    profesores: await supabaseFetch("profesores"),
    materias: await supabaseFetch("materias"),
    tabla_horario: await supabaseFetch("tabla_horario"),
    sustituciones: await supabaseFetch("sustituciones"),
    bajas: await supabaseFetch("bajas"),
  };
  console.log("[Supabase] Fetched:", tables);
  console.log("[Supabase] Bajas count:", tables.bajas?.length || 0);

  // Si la tabla de bajas está vacía pero hay datos locales, guardarlos a Supabase
  if (tables.bajas.length === 0) {
    const localBajas = JSON.parse(localStorage.getItem(storageKeys.bajas) || "[]");
    if (localBajas.length > 0) {
      console.log("[Supabase] Recuperando bajas desde localStorage:", localBajas.length);
      await supabaseSave("bajas", localBajas);
    }
  }

  // Obtener datos locales
  const localProfesores = JSON.parse(localStorage.getItem(storageKeys.profesores) || "[]");
  const localMaterias = JSON.parse(localStorage.getItem(storageKeys.materias) || "[]");
  const localTabla = JSON.parse(localStorage.getItem(storageKeys.tabla) || "[]");
  const localSustituciones = JSON.parse(localStorage.getItem(storageKeys.sustituciones) || "[]");
  const localBajas = JSON.parse(localStorage.getItem(storageKeys.bajas) || "[]");

  // Función para combinar datos: preferir datos locales más recientes, agregar nuevos registros
  const mergeData = (localData, remoteData) => {
    const merged = [...remoteData];
    const remoteIds = new Set(remoteData.map(r => r.id));

    // Agregar registros locales que no están en remoto
    localData.forEach(localItem => {
      if (!remoteIds.has(localItem.id)) {
        merged.push(localItem);
      }
    });

    return merged;
  };

  // Combinar datos de profesores
  if (tables.profesores.length > 0 || localProfesores.length > 0) {
    const mergedProfesores = mergeData(localProfesores, tables.profesores);
    setProfesores(mergedProfesores);
    // Subir registros locales nuevos a Supabase
    const newLocalProfesores = localProfesores.filter(p => !tables.profesores.some(rp => rp.id === p.id));
    if (newLocalProfesores.length > 0) {
      await supabaseSave("profesores", newLocalProfesores);
    }
  }

  // Combinar datos de materias
  if (tables.materias.length > 0 || localMaterias.length > 0) {
    const mergedMaterias = mergeData(localMaterias, tables.materias);
    setMaterias(mergedMaterias);
    const newLocalMaterias = localMaterias.filter(m => !tables.materias.some(rm => rm.id === m.id));
    if (newLocalMaterias.length > 0) {
      await supabaseSave("materias", newLocalMaterias);
    }
  }

  // Combinar datos de tabla_horario
  if (tables.tabla_horario.length > 0 || localTabla.length > 0) {
    const mergedTabla = mergeData(localTabla, tables.tabla_horario);
    setTabla(mergedTabla);
    const newLocalTabla = localTabla.filter(t => !tables.tabla_horario.some(rt => rt.id === t.id));
    if (newLocalTabla.length > 0) {
      await supabaseSave("tabla_horario", newLocalTabla);
    }
  }

  // Sincronizar sustituciones con soporte multi-dispositivo usando tombstones.
  // - ID en deletedIds + en Supabase → borrar de Supabase (fue eliminado intencionalmente)
  // - ID en Supabase, no en local, no en deletedIds → vino de otro dispositivo → añadir al local
  // - ID en local, no en Supabase → nuevo local → subir a Supabase
  {
    const deletedIds = getDeletedSustitutionIds();

    // Registros remotos marcados como borrados → eliminar de Supabase si aún están ahí
    const remoteToDelete = tables.sustituciones.filter(rs => deletedIds.has(rs.id));
    if (remoteToDelete.length > 0) {
      console.log(`[Supabase] Borrando ${remoteToDelete.length} sustituciones eliminadas en este dispositivo`);
      await Promise.all(remoteToDelete.map(rs => supabaseDelete("sustituciones", rs.id)));
    }

    // Registros remotos nuevos (no en local, no borrados) → añadir al local (vinieron de otro dispositivo)
    const remoteNew = tables.sustituciones.filter(
      rs => !deletedIds.has(rs.id) && !localSustituciones.some(ls => ls.id === rs.id)
    );

    // Estado final del local = local actual + nuevos de remoto
    const merged = [...localSustituciones, ...remoteNew];
    cachedData.sustituciones = merged;
    localStorage.setItem(storageKeys.sustituciones, JSON.stringify(merged));

    // Registros locales que no están en Supabase → subir
    const localOnly = localSustituciones.filter(
      ls => !tables.sustituciones.some(rs => rs.id === ls.id)
    );
    if (localOnly.length > 0) {
      await supabaseSave("sustituciones", localOnly);
    }
  }

  // Combinar datos de bajas
  if (tables.bajas.length > 0 || localBajas.length > 0) {
    const mergedBajas = mergeData(localBajas, tables.bajas);
    setBajas(mergedBajas);
    const newLocalBajas = localBajas.filter(b => !tables.bajas.some(rb => rb.id === b.id));
    if (newLocalBajas.length > 0) {
      await supabaseSave("bajas", newLocalBajas);
    }
  }

  console.log("[Supabase] Sync complete");
  isSyncing = false;
};

const supabaseDelete = async (table, id) => {
  if (!useSupabase()) return;
  if (!id) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[Supabase] Error deleting:", res.status, err);
    } else {
      console.log("[Supabase] Deleted:", id);
    }
  } catch (e) {
    console.error("[Supabase] Delete error:", e);
  }
};

const supabaseSave = async (table, data) => {
  if (!useSupabase()) return;
  if (!data || data.length === 0) return;
  try {
    for (const item of data) {
      // Clona el objeto para evitar modificar el estado local
      let payload = { ...item };

      // Renombrar columnas para coincidir con Supabase
      if (table === 'materias' || table === 'tabla_horario') {
        payload.diasemana = payload.diaSemana;
        payload.horainicio = payload.horaInicio;
        payload.horafin = payload.horaFin;
        payload.profesorid = payload.profesorId;
        payload.profesornombre = payload.profesorNombre;
        payload.cursogrupo = payload.cursoGrupo;
        // asignatura ya tiene el nombre correcto, no se renombra
        delete payload.diaSemana;
        delete payload.horaInicio;
        delete payload.horaFin;
        delete payload.profesorId;
        delete payload.profesorNombre;
        delete payload.cursoGrupo;
        delete payload.materia;
      }
      if (table === 'sustituciones') {
        // Convertir de camelCase (localStorage) a minúsculas (Supabase)
        delete payload.createdAt;
        delete payload.updatedAt;

        payload.diasemana = payload.diaSemana;
        payload.horainicio = payload.horaInicio;
        payload.horafin = payload.horaFin;
        payload.profesorausenteid = payload.profesorAusenteId;
        payload.profesorsustitutoid = payload.profesorSustitutoId;
        payload.profesorextraid = payload.profesorExtraId;
        payload.cursogrupomateria = payload.cursoGrupoMateria;

        delete payload.diaSemana;
        delete payload.horaInicio;
        delete payload.horaFin;
        delete payload.profesorAusenteId;
        delete payload.profesorSustitutoId;
        delete payload.profesorExtraId;
        delete payload.cursoGrupoMateria;

        console.log("[DEBUG] Saving sustitucion payload:", payload);

        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("[Supabase] Error saving sustitucion:", res.status, err);
        } else {
          console.log("[Supabase] Saved sustitucion OK:", payload.id);
        }
        continue;
      }
      if (table === 'profesores') {
        delete payload.displayName;
        delete payload.puesto;
        delete payload.movilAvisos;
        delete payload.cuenta;
      }

      if (table === 'bajas') {
        // Convertir de camelCase a minúsculas para Supabase
        payload.profesorbajaid = payload.profesorBajaId;
        payload.profesorbajanombre = payload.profesorBajaNombre;
        payload.profesorrelevistaid = payload.profesorRelevistaId;
        payload.profesorrelevistanombre = payload.profesorRelevistaNombre;
        payload.fechainicio = payload.fechaInicio;
        payload.fechafin = payload.fechaFin;

        delete payload.profesorBajaId;
        delete payload.profesorBajaNombre;
        delete payload.profesorRelevistaId;
        delete payload.profesorRelevistaNombre;
        delete payload.fechaInicio;
        delete payload.fechaFin;
        delete payload.createdAt;
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`[Supabase] Error saving to ${table}:`, res.status, err);
      } else {
        console.log(`[Supabase] Saved ${table}:`, payload);
      }
    }
  } catch (e) {
    console.error("[Supabase] Save error:", e);
  }
};

let cachedData = { profesores: [], materias: [], tabla: [], sustituciones: [], bajas: [] };

const getProfesores = () => cachedData.profesores;
const getMaterias = () => cachedData.materias;
const getTabla = () => cachedData.tabla;
const getSustituciones = () => cachedData.sustituciones;
const getBajas = () => cachedData.bajas;

const setBajas = (data) => {
  const oldData = cachedData.bajas;
  cachedData.bajas = data;
  localStorage.setItem(storageKeys.bajas, JSON.stringify(data));
  if (useSupabase()) {
    const idsToDelete = oldData.filter(b => !data.find(d => d.id === b.id)).map(b => b.id);
    idsToDelete.forEach(id => supabaseDelete("bajas", id));
    supabaseSave("bajas", data);
  }
};

const getBajaActiva = () => {
  return cachedData.bajas.find(b => !b.fechaFin);
};

const getBajasActivas = () => {
  return cachedData.bajas.filter(b => !b.fechaFin);
};

const getBajaEnFecha = (profesorId, fecha) => {
  const fechaStr = typeof fecha === 'string' ? fecha : toIso(fecha);
  const fechaSust = new Date(fechaStr).setHours(12, 0, 0, 0);
  
  const todasBajas = cachedData.bajas;
  
  const baja = todasBajas.find(b => {
    if (b.profesorBajaId !== profesorId) return false;
    
    const inicio = new Date(b.fechaInicio).setHours(12, 0, 0, 0);
    const fin = b.fechaFin ? new Date(b.fechaFin).setHours(12, 0, 0, 0) : null;
    
    if (fechaSust < inicio) return false;
    if (fin && fechaSust > fin) return false;
    
    return true;
  });
  
  return baja || null;
};

const getDisplayNameForProfesor = (profesorId, profesorNombre, fechaSustitucion = null) => {
  if (!fechaSustitucion) {
    const bajasActivas = getBajasActivas();
    const bajaActiva = bajasActivas.find(b => b.profesorBajaId === profesorId);
    if (bajaActiva) {
      return `${bajaActiva.profesorRelevistaNombre} <span class="baja-original">(${bajaActiva.profesorBajaNombre})</span>`;
    }
    return profesorNombre;
  }
  
  const baja = getBajaEnFecha(profesorId, fechaSustitucion);
  if (baja) {
    return `${baja.profesorRelevistaNombre} <span class="baja-original">(${baja.profesorBajaNombre})</span>`;
  }
  return profesorNombre;
};

const formatNombreApellidos = (nombreCompleto) => {
  if (!nombreCompleto) return '-';
  const parts = nombreCompleto.trim().split(',');
  if (parts.length >= 2) {
    return `${parts[0].trim()}<br><small>${parts[1].trim()}</small>`;
  }
  return nombreCompleto;
};

const setProfesores = (data) => {
  const oldData = cachedData.profesores;
  cachedData.profesores = data;
  localStorage.setItem(storageKeys.profesores, JSON.stringify(data));
  if (useSupabase()) {
    const idsToDelete = oldData.filter(s => !data.find(d => d.id === s.id)).map(s => s.id);
    idsToDelete.forEach(id => supabaseDelete("profesores", id));
    supabaseSave("profesores", data);
  }
};
const setMaterias = (data) => {
  const oldData = cachedData.materias;
  cachedData.materias = data;
  localStorage.setItem(storageKeys.materias, JSON.stringify(data));
  if (useSupabase()) {
    const idsToDelete = oldData.filter(s => !data.find(d => d.id === s.id)).map(s => s.id);
    idsToDelete.forEach(id => supabaseDelete("materias", id));
    supabaseSave("materias", data);
  }
};
const setTabla = (data) => {
  const oldData = cachedData.tabla;
  cachedData.tabla = data;
  localStorage.setItem(storageKeys.tabla, JSON.stringify(data));
  if (useSupabase()) {
    const idsToDelete = oldData.filter(s => !data.find(d => d.id === s.id)).map(s => s.id);
    idsToDelete.forEach(id => supabaseDelete("tabla_horario", id));
    supabaseSave("tabla_horario", data);
  }
};
const setSustituciones = async (data) => {
  const oldData = cachedData.sustituciones;
  cachedData.sustituciones = data;
  localStorage.setItem(storageKeys.sustituciones, JSON.stringify(data));

  if (useSupabase()) {
    const idsToDelete = oldData.filter(s => !data.find(d => d.id === s.id)).map(s => s.id);
    if (idsToDelete.length > 0) {
      // Registrar como borrados para que otros navegadores no los restauren en el sync
      addDeletedSustitutionIds(idsToDelete);
      await Promise.all(idsToDelete.map(id => supabaseDelete("sustituciones", id)));
    }
    // Guardar las nuevas/actualizadas
    supabaseSave("sustituciones", data);
  }
};

const loadCachedData = () => {
  cachedData.profesores = JSON.parse(localStorage.getItem(storageKeys.profesores) || "[]");
  cachedData.materias = JSON.parse(localStorage.getItem(storageKeys.materias) || "[]");
  cachedData.tabla = JSON.parse(localStorage.getItem(storageKeys.tabla) || "[]");
  cachedData.sustituciones = JSON.parse(localStorage.getItem(storageKeys.sustituciones) || "[]");
  cachedData.bajas = JSON.parse(localStorage.getItem(storageKeys.bajas) || "[]");
};

const dayNames = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

const dayDisplay = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
  domingo: "domingo",
};

const dayLabels = ["L", "M", "X", "J", "V", "S", "D"];

const tramos = [
  { start: "09:00", end: "09:30" },
  { start: "09:30", end: "10:00" },
  { start: "10:00", end: "10:30" },
  { start: "10:30", end: "11:00" },
  { start: "11:00", end: "11:30" },
  { start: "11:30", end: "12:00" },
  { start: "12:00", end: "12:30", blocked: true },
  { start: "12:30", end: "13:00" },
  { start: "13:00", end: "13:30" },
  { start: "13:30", end: "14:00" },
];

const state = {
  activeDate: new Date(),
  calendarDate: new Date(),
  editingId: null,
  importType: null,
  importRows: [],
  importColumns: [],
  importMapping: {},
  datasetViewType: null,
  datasetViewSearch: "",
  selectedProfesorFilter: "",
  selectedRows: new Set(),
};

const el = {
  hamburgerBtn: document.getElementById("hamburgerBtn"),
  miniCalendar: document.getElementById("miniCalendar"),
  ctaNueva: document.getElementById("ctaNueva"),
  substitutionGrid: document.getElementById("substitutionGrid"),
  modal: document.getElementById("substitutionModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalClose: document.getElementById("modalClose"),
  modalCancel: document.getElementById("modalCancel"),
  substitutionForm: document.getElementById("substitutionForm"),
  formFecha: document.getElementById("formFecha"),
  formDiaSemana: document.getElementById("formDiaSemana"),
  formHoraInicio: document.getElementById("formHoraInicio"),
  formHoraFin: document.getElementById("formHoraFin"),
  formProfesorAusente: document.getElementById("formProfesorAusente"),
  formProfesorSustituto: document.getElementById("formProfesorSustituto"),
  formProfesorExtra: document.getElementById("formProfesorExtra"),
  formCursoGrupo: document.getElementById("formCursoGrupo"),
  materiaInfo: document.getElementById("materiaInfo"),
  formError: document.getElementById("formError"),
  importModal: document.getElementById("importModal"),
  importTitle: document.getElementById("importTitle"),
  importClose: document.getElementById("importClose"),
  importCancel: document.getElementById("importCancel"),
  importFile: document.getElementById("importFile"),
  importMeta: document.getElementById("importMeta"),
  mappingGrid: document.getElementById("mappingGrid"),
  previewTable: document.getElementById("previewTable"),
  importConfirm: document.getElementById("importConfirm"),
  importError: document.getElementById("importError"),
  datasetTable: document.getElementById("datasetTable"),
  statsFrom: document.getElementById("statsFrom"),
  statsTo: document.getElementById("statsTo"),
  statsProfesor: document.getElementById("statsProfesor"),
  statsApply: document.getElementById("statsApply"),
  statTotal: document.getElementById("statTotal"),
  statByDay: document.getElementById("statByDay"),
  statTopAbsent: document.getElementById("statTopAbsent"),
  statTopSub: document.getElementById("statTopSub"),
  statRankingSub: document.getElementById("statRankingSub"),
  printDate: document.getElementById("printDate"),
  printFrom: document.getElementById("printFrom"),
  printTo: document.getElementById("printTo"),
  printGenerate: document.getElementById("printGenerate"),
  printBtn: document.getElementById("printBtn"),
  exportPdf: document.getElementById("exportPdf"),
  printTable: document.getElementById("printTable"),
  bajaProfesorBaja: document.getElementById("bajaProfesorBaja"),
  bajaProfesorRelevista: document.getElementById("bajaProfesorRelevista"),
  bajaFechaInicio: document.getElementById("bajaFechaInicio"),
  btnCrearBaja: document.getElementById("btnCrearBaja"),
  btnRevertirBaja: document.getElementById("btnRevertirBaja"),
  bajaActive: document.getElementById("bajaActive"),
  bajaActiveProfesor: document.getElementById("bajaActiveProfesor"),
  bajaActiveRelevista: document.getElementById("bajaActiveRelevista"),
  bajaActiveFecha: document.getElementById("bajaActiveFecha"),
  btnVerHistorico: document.getElementById("btnVerHistorico"),
  historicoBajasModal: document.getElementById("historicoBajasModal"),
  historicoBajasClose: document.getElementById("historicoBajasClose"),
  historicoBajasBody: document.getElementById("historicoBajasBody"),
};

const datasetConfig = {
  profesores: {
    label: "Profesores",
    required: ["profesor", "puesto", "movilAvisos", "cuenta"],
    fields: [
      { key: "profesor", label: "Nombre y apellidos (CSV col 1)" },
      { key: "puesto", label: "Puesto (CSV col 2)" },
      { key: "movilAvisos", label: "Móvil avisos emergencia (CSV col 3)" },
      { key: "cuenta", label: "Cuenta Google/Microsoft (CSV col 4)" },
    ],
  },
  materias: {
    label: "Materias de horario",
    required: ["profesor", "diaSemana", "horaInicio", "horaFin", "materia", "cursoGrupo"],
    fields: [
      { key: "profesor", label: "Profesor (CSV col 1)" },
      { key: "diaSemana", label: "Día semana (CSV col 2)" },
      { key: "horaInicio", label: "Hora inicio (CSV col 3)" },
      { key: "horaFin", label: "Hora fin (CSV col 4)" },
      { key: "materia", label: "Asignatura (CSV col 5)" },
      { key: "cursoGrupo", label: "Curso/Grupo (CSV col 6)" },
    ],
  },
  tabla: {
    label: "Tabla de datos",
    required: ["profesor", "diaSemana", "horaInicio", "horaFin", "asignatura", "cursoGrupo"],
    fields: [
      { key: "profesor", label: "Profesor (CSV col 1)" },
      { key: "diaSemana", label: "Día (CSV col 2)" },
      { key: "horaInicio", label: "Hora_Inicio (CSV col 3)" },
      { key: "horaFin", label: "Hora_Fin (CSV col 4)" },
      { key: "asignatura", label: "Asignatura (CSV col 5)" },
      { key: "cursoGrupo", label: "Curso/Grupo (CSV col 6)" },
    ],
  },
};



const toIso = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const fromIso = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const formatDate = (date) =>
  date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const getDayKey = (date) => {
  const day = date.getDay();
  // Convertir de domingo=0 a lunes=1, ... , sábado=6, domingo=7
  const adjustedDay = day === 0 ? 6 : day - 1;
  return dayNames[adjustedDay];
};
const getDayLabel = (dayKey) => dayDisplay[dayKey] || dayKey;
const getDayName = (date) => getDayLabel(getDayKey(date));
const normalizeDay = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeTime = (value) => {
  if (!value) return "";
  const cleaned = String(value).trim();
  if (cleaned.includes(":")) {
    const [h, m] = cleaned.split(":");
    return `${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
  }
  if (cleaned.length === 4) {
    return `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
  }
  return cleaned;
};

const addMinutes = (time, minutes) => {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = String(Math.floor(total / 60)).padStart(2, "0");
  const nm = String(total % 60).padStart(2, "0");
  return `${nh}:${nm}`;
};

const getTramoByStart = (start) => tramos.find((t) => t.start === start);

const generateId = () => `id_${Math.random().toString(36).slice(2, 10)}`;

// Generar ID determinístico basado en el contenido del registro
// Esto permite importar el mismo archivo múltiples veces sin crear duplicados
const generateDeterministicId = (profesorId, diaSemana, horaInicio, horaFin, asignatura = "", cursoGrupo = "") => {
  const str = `${profesorId}|${normalizeDay(diaSemana)}|${horaInicio}|${horaFin}|${asignatura}|${cursoGrupo}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `id_${Math.abs(hash).toString(36)}`;
};

const buildDisplayName = (prof) => {
  return prof.profesor || "";
};

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const resolveProfesorId = (value) => {
  if (!value) return "";
  const profesores = getProfesores();
  const normalized = String(value).trim();
  const byId = profesores.find((p) => p.id === normalized);
  if (byId) return byId.id;
  const byName = profesores.find(
    (p) => normalizeText(p.profesor) === normalizeText(normalized)
  );
  if (byName) return byName.id;
  const newProf = {
    id: generateId(),
    profesor: normalized,
    puesto: "",
    movilAvisos: "",
    cuenta: "",

  };
  const updated = [...profesores, newProf];
  setProfesores(updated);
  return newProf.id;
};

const findProfesorMatch = (profesores, id, nombre) => {
  if (!Array.isArray(profesores)) return null;
  if (id) {
    const byId = profesores.find((p) => p.id === id);
    if (byId) return byId;
  }
  if (nombre) {
    const normalized = normalizeText(nombre);
    return profesores.find(
      (p) => normalizeText(p.profesor) === normalized
    );
  }
  return null;
};

const getFormDayNormalized = () => {
  const fecha = el.formFecha.value;
  if (fecha) {
    return normalizeDay(getDayKey(fromIso(fecha)));
  }
  return normalizeDay(el.formDiaSemana.textContent);
};

const setActiveDate = (date) => {
  state.activeDate = date;
  el.formFecha.value = toIso(date);
  el.printDate.value = toIso(date);
  renderDashboard();
  renderCalendar();
};

const openModal = (mode = "new", data = null) => {
  el.formError.textContent = "";
  el.modal.classList.add("is-open");
  el.modal.setAttribute("aria-hidden", "false");
  if (mode === "edit" && data) {
    state.editingId = data.id;
    el.modalTitle.textContent = "Editar sustitución";
    el.formFecha.value = data.fecha;
    // Asegurar que solo se muestre la hora de inicio, no el tramo completo
    const horaInicio = data.horaInicio.includes('-') ? data.horaInicio.split('-')[0] : data.horaInicio;
    const horaFin = data.horaFin.includes('-') ? data.horaFin.split('-')[1] : data.horaFin;
    el.formHoraInicio.value = horaInicio;
    el.formHoraFin.value = horaFin;
    // Guardar el ausenteId
    const ausenteId = data.profesorAusenteId || "";
    // Establecer el ausente ANTES de llamar a refreshProfesorOptions
    el.formProfesorAusente.value = ausenteId;
    // Actualizar el día
    updateFormDay();
    // Cargar las opciones de profesor (ya incluye el ausente porque se estableció antes)
    refreshProfesorOptions();
    // Otros valores
    el.formProfesorExtra.value = data.profesorExtraId || "";
    el.formCursoGrupo.value = data.cursoGrupoMateria || "";
    el.formCursoGrupo.readOnly = false;
    // Actualizar la información de materia después de establecer el ausente
    updateMateriaInfo();
    // Actualizar las opciones de sustituto
    refreshSustitutoOptions(ausenteId, data.profesorSustitutoId || "");
    // Establecer el valor del ausente AL FINAL para asegurar que se seleccione correctamente
    el.formProfesorAusente.value = ausenteId;
  } else {
    state.editingId = null;
    // Limpiar todos los campos del formulario
    el.formFecha.value = toIso(state.activeDate);
    el.formHoraInicio.value = "";
    el.formHoraFin.value = "";
    el.formProfesorAusente.value = "";
    el.formProfesorSustituto.value = "";
    el.formProfesorExtra.value = "";
    el.formCursoGrupo.value = "";
    el.formCursoGrupo.readOnly = false;
    el.materiaInfo.textContent = "--";
    el.materiaInfo.style.color = "#6b7280";
    // Cargar opciones
    refreshProfesorOptions();
    refreshSustitutoOptions("", "");
    updateFormDay();
  }
};

const closeModal = () => {
  (document.activeElement || document.body).blur();
  el.modal.classList.remove("is-open");
  el.modal.setAttribute("aria-hidden", "true");
};

const openImportModal = (type) => {
  state.importType = type;
  state.importRows = [];
  state.importColumns = [];
  state.importMapping = {};
  el.importTitle.textContent = `Importar ${datasetConfig[type].label}`;
  el.importMeta.textContent = "Sin archivo seleccionado";
  el.mappingGrid.innerHTML = "";
  el.previewTable.innerHTML = "";
  el.importConfirm.disabled = true;
  el.importError.textContent = "";
  el.importFile.value = "";
  el.importModal.classList.add("is-open");
  el.importModal.setAttribute("aria-hidden", "false");
};

const closeImportModal = () => {
  (document.activeElement || document.body).blur();
  el.importModal.classList.remove("is-open");
  el.importModal.setAttribute("aria-hidden", "true");
};

const updateFormDay = () => {
  const date = fromIso(el.formFecha.value);
  if (!isNaN(date)) {
    el.formDiaSemana.textContent = getDayName(date);
  }
};

const updateHoraFin = () => {
  const start = el.formHoraInicio.value;
  const tramo = getTramoByStart(start);
  const end = tramo ? tramo.end : addMinutes(start, 30);
  el.formHoraFin.value = end;
};

const updateMateriaInfo = () => {
  const dia = getFormDayNormalized();
  const start = el.formHoraInicio.value;
  const end = el.formHoraFin.value;
  const ausenteId = el.formProfesorAusente.value;
  const tabla = getTabla();

  // Buscar en la tabla importada el registro del profesor ausente en este tramo
  const materia = tabla.find((t) => {
    if (
      normalizeDay(t.diaSemana) !== dia ||
      t.horaInicio !== start ||
      t.horaFin !== end
    ) {
      return false;
    }
    if (t.profesorId && t.profesorId === ausenteId) {
      return true;
    }
    return false;
  });

  if (materia) {
    // Mostrar materia y curso/grupo debajo del desplegable en azul
    const label = materia.asignatura && materia.cursoGrupo
      ? `${materia.asignatura} - ${materia.cursoGrupo}`
      : materia.asignatura || materia.cursoGrupo || "Sin materia";
    el.materiaInfo.textContent = label;
    el.materiaInfo.style.color = "#2563eb";

    // Rellenar el campo Curso/Grupo con la información
    const cursoGrupoValue = materia.cursoGrupo && materia.asignatura
      ? `${materia.cursoGrupo} / ${materia.asignatura}`
      : materia.cursoGrupo || materia.asignatura || "";
    el.formCursoGrupo.value = cursoGrupoValue;
    el.formCursoGrupo.readOnly = true;
  } else {
    el.materiaInfo.textContent = "Sin materias asociadas";
    el.materiaInfo.style.color = "#6b7280";
    if (!el.formCursoGrupo.value) {
      el.formCursoGrupo.readOnly = false;
    }
  }
};

const isProfesorDeBajaActivaEnFecha = (profesorId, fecha) => {
  const bajasActivas = getBajasActivas();
  const fechaSust = fromIso(fecha);
  
  const baja = bajasActivas.find(b => b.profesorBajaId === profesorId);
  if (!baja) return null;
  
  const inicio = fromIso(baja.fechaInicio);
  const fin = baja.fechaFin ? fromIso(baja.fechaFin) : null;
  
  if (fechaSust < inicio) return null;
  if (fin && fechaSust > fin) return null;
  
  return baja;
};

const refreshProfesorOptions = () => {
  const tabla = getTabla();
  const dia = getFormDayNormalized();
  const start = el.formHoraInicio.value;
  const end = el.formHoraFin.value;
  const currentFecha = el.formFecha.value || toIso(new Date());
  const sustituciones = getSustituciones();
  const ausenteId = el.formProfesorAusente.value;

  el.formError.textContent = "";

  const sustitucionCount = {};
  sustituciones.forEach(s => {
    if (s.fecha <= currentFecha) {
      if (s.profesorSustitutoId) {
        sustitucionCount[s.profesorSustitutoId] = (sustitucionCount[s.profesorSustitutoId] || 0) + 1;
      }
    }
  });

  // Obtener profesores que tienen clase en este tramo desde la tabla importada
  let profesoresTramo = tabla.filter(t =>
    normalizeDay(t.diaSemana) === dia &&
    t.horaInicio === start &&
    t.horaFin === end
  );

  // SIEMPRE añadir el ausente si hay uno seleccionado, aunque no tenga clase en este tramo
  if (ausenteId) {
    const yaExiste = profesoresTramo.some(t => t.profesorId === ausenteId);
    if (!yaExiste) {
      // Buscar cualquier registro del profesor en la tabla para obtener su nombre
      const profesorAusenteRegistro = tabla.find(t => t.profesorId === ausenteId);
      if (profesorAusenteRegistro) {
        // Añadir el profesor ausente con su información original
        profesoresTramo = [{
          profesorId: ausenteId,
          profesorNombre: profesorAusenteRegistro.profesorNombre,
          diaSemana: dia,
          horaInicio: start,
          horaFin: end,
          asignatura: "",
          cursoGrupo: ""
        }, ...profesoresTramo];
      } else {
        // Si no está en la tabla, añadirlo de todas formas con el ID
        profesoresTramo = [{
          profesorId: ausenteId,
          profesorNombre: "Profesor (sin datos)",
          diaSemana: dia,
          horaInicio: start,
          horaFin: end,
          asignatura: "",
          cursoGrupo: ""
        }, ...profesoresTramo];
      }
    }
  }

  // Obtener todos los profesores de la tabla de profesores, ordenados alfabéticamente
  const profesores = getProfesores()
    .filter(p => p.id && p.profesor)
    .sort((a, b) => (a.profesor || '').localeCompare(b.profesor || ''));

  const options = ["<option value=\"\">Seleccionar</option>"];

  // Mostrar todos los profesores ordenados alfabéticamente
  profesores.forEach((p) => {
    const count = sustitucionCount[p.id] || 0;
    const countLabel = count > 0 ? ` <b style="color:#dc2626; font-weight:bold;">(${count})</b>` : '';
    options.push(`<option value="${p.id}">${p.profesor}${countLabel}</option>`);
  });

  const extraOptions = ["<option value=\"\"></option>"];

  // Profesores del centro (casos excepcionales)
  profesores.forEach((p) => {
    const count = sustitucionCount[p.id] || 0;
    const countLabel = count > 0 ? ` <b style="color:#dc2626; font-weight:bold;">(${count})</b>` : '';
    extraOptions.push(`<option value="${p.id}">${p.profesor}${countLabel}</option>`);
  });

  el.formProfesorAusente.innerHTML = options.join("");
  el.formProfesorExtra.innerHTML = extraOptions.join("");

  const statsOptions = ["<option value=\"\">Todos</option>"];
  profesores.forEach((p) => {
    statsOptions.push(`<option value="${p.id}">${p.profesor}</option>`);
  });
  el.statsProfesor.innerHTML = statsOptions.join("");
};

const refreshHoraInicioOptions = () => {
  el.formHoraInicio.innerHTML = tramos
    .map((t) => {
      const label = `${t.start}${t.blocked ? " (Recreo)" : ""}`;
      return `<option value="${t.start}" ${t.blocked ? "disabled" : ""}>${label}</option>`;
    })
    .join("");
};

const refreshSustitutoOptions = (ausenteId, selected = "") => {
  const dia = getFormDayNormalized();
  const start = el.formHoraInicio.value;
  const end = el.formHoraFin.value;
  const currentFecha = el.formFecha.value;
  const sustituciones = getSustituciones();
  const tabla = getTabla();

  if (!start || !end) {
    el.formProfesorSustituto.innerHTML = '<option value="">Selecciona una hora primero</option>';
    return;
  }

  // Contar sustituciones históricas (para mostrar el número)
  const sustitucionCount = {};
  sustituciones.forEach(s => {
    if (s.id !== state.editingId && s.fecha <= currentFecha) {
      if (s.profesorSustitutoId) {
        sustitucionCount[s.profesorSustitutoId] = (sustitucionCount[s.profesorSustitutoId] || 0) + 1;
      }
    }
  });

  // Obtener profesores de la tabla que en este tramo:
  const asignaturasSustituibles = ['refuerzo pedagógico', 'refuerzo educativo', 'coordinación', 'mayores', 'biblioteca', 'dirección', 'director', 'jefatura', 'función directiva'];

  let disponiblesTramo = tabla.filter(t => {
    const normalizedDia = normalizeDay(t.diaSemana);
    const matchDia = normalizedDia === dia;
    const matchHora = t.horaInicio === start && t.horaFin === end;
    return matchDia && matchHora;
  });

  // Filtrar por asignaturas especiales (si existen registros con asignatura)
  const conAsignatura = disponiblesTramo.filter(t => t.asignatura && t.asignatura.trim() !== '');
  if (conAsignatura.length > 0) {
    disponiblesTramo = disponiblesTramo.filter(t => {
      const asignaturaNormalizada = (t.asignatura || '').toLowerCase().trim();
      return asignaturasSustituibles.some(a => asignaturaNormalizada.includes(a));
    });
  }

  // Si el profesor ausente está de baja en la fecha de la sustitución, verificar el periodo
  const baja = ausenteId ? getBajaEnFecha(ausenteId, currentFecha) : null;
  const esDuranteBaja = baja !== null;

  // Durante la baja: solo el relevista puede sustituir
  // Antes o después de la baja: cualquier profesor disponible (no el relevista)
  if (esDuranteBaja) {
    disponiblesTramo = disponiblesTramo.filter(entry => entry.profesorId === baja.profesorRelevistaId);
  } else if (ausenteId) {
    // Obtener cualquier baja (activa o histórica) para excluir al relevista cuando no sea durante la baja
    const todasBajas = cachedData.bajas;
    const bajaDelAusente = todasBajas.find(b => b.profesorBajaId === ausenteId);
    if (bajaDelAusente && bajaDelAusente.profesorRelevistaId) {
      disponiblesTramo = disponiblesTramo.filter(entry => entry.profesorId !== bajaDelAusente.profesorRelevistaId);
    }
  }

  // Profesores que ya están ocupados en este día y tramo (como sustitutos o extras)
  const occupied = sustituciones
    .filter(
      (s) =>
        s.fecha === currentFecha &&
        s.horaInicio === start &&
        s.horaFin === end &&
        s.id !== state.editingId
    )
    .flatMap((s) => [s.profesorSustitutoId, s.profesorExtraId])
    .filter(Boolean);

  // Filtrar: excluir al profesor ausente Y los que ya están ocupados como sustitutos
  const filteredEntries = disponiblesTramo.filter(
    (entry) => entry.profesorId && entry.profesorId !== ausenteId && !occupied.includes(entry.profesorId)
  );

  // Eliminar duplicados: un profesor solo debe aparecer una vez
  const seenProfesorIds = new Set();
  const uniqueEntries = filteredEntries.filter((entry) => {
    if (seenProfesorIds.has(entry.profesorId)) {
      return false;
    }
    seenProfesorIds.add(entry.profesorId);
    return true;
  });

  const options = ["<option value=\"\">Sin asignar</option>"];

  // Mostrar candidatos disponibles de la tabla importada con su materia en azul
  if (uniqueEntries.length > 0) {
    uniqueEntries.forEach((entry) => {
      const count = sustitucionCount[entry.profesorId] || 0;
      const countLabel = count > 0 ? ` <b style="color:#dc2626; font-weight:bold;">(${count})</b>` : '';
      const materiaLabel = entry.asignatura ? ` <span style="color:#2563eb;">[${entry.asignatura}]</span>` : '';
      options.push(`<option value="${entry.profesorId}">${entry.profesorNombre || 'Sin nombre'}${countLabel}${materiaLabel}</option>`);
    });
  } else {
    // Si no hay nadie disponible, mostrar mensaje
    options.push(`<option value="" disabled>No hay profesores disponibles en este tramo</option>`);
  }

  el.formProfesorSustituto.innerHTML = options.join("");
  if (selected) {
    el.formProfesorSustituto.value = selected;
  }
};

const renderDashboard = () => {
  const dateKey = toIso(state.activeDate);
  const profesores = getProfesores();
  const dayName = getDayName(state.activeDate);

  // Obtener sustituciones del día
  const allSustituciones = getSustituciones();
  console.log(`[renderDashboard] Total sustituciones cargadas: ${allSustituciones.length}`);
  console.log(`[renderDashboard] Fecha actual (dateKey): ${dateKey}`);

  const daySubstitutions = allSustituciones.filter(s => s.fecha === dateKey);
  console.log(`[renderDashboard] Sustituciones para ${dateKey}: ${daySubstitutions.length}`);

  if (daySubstitutions.length === 0) {
    el.substitutionGrid.innerHTML = `
      <div class="empty-substitutions">
        <div class="empty-illustration">📅</div>
        <h4>No hay sustituciones programadas para hoy</h4>
        <p>Selecciona un día del calendario para ver o crear sustituciones.</p>
      </div>
    `;
    return;
  }

  // Agrupar sustituciones por profesor ausente (guardando también el ID)
  const substitutionsByTeacher = {};
  daySubstitutions.forEach(sub => {
    const ausente = profesores.find(p => p.id === sub.profesorAusenteId);
    const teacherName = ausente ? ausente.profesor : 'Desconocido';
    const displayName = getDisplayNameForProfesor(sub.profesorAusenteId, teacherName);

    if (!substitutionsByTeacher[displayName]) {
      substitutionsByTeacher[displayName] = {
        ausenteId: sub.profesorAusenteId,
        teacherName: teacherName,
        substitutions: []
      };
    }
    substitutionsByTeacher[displayName].substitutions.push(sub);
  });

  let dashboardHTML = '';

  Object.entries(substitutionsByTeacher).forEach(([displayName, data]) => {
    const ausenteId = data.ausenteId;
    const substitutions = data.substitutions;
    const teacherName = data.teacherName;
    dashboardHTML += `
      <div class="substitution-card">
        <div class="card-header" data-ausente-id="${ausenteId}">
          <div class="teacher-info">
            <div class="teacher-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="8" r="4"></circle>
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6"></path>
              </svg>
            </div>
            <div>
              <h3 class="teacher-name">${displayName}</h3>
              <span class="substitution-count">${substitutions.length} ${substitutions.length === 1 ? 'tramo' : 'tramos'}</span>
            </div>
          </div>
          <button class="btn-delete-all" data-ausente-id="${ausenteId}" data-teacher="${teacherName}" title="Eliminar todas las sustituciones de este profesor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            Eliminar todos
          </button>
        </div>
        
        <table class="tramo-table">
          <thead>
            <tr>
              <th>Tramo</th>
              <th>Sustituto</th>
              <th>Grupo/Materia</th>
            </tr>
          </thead>
          <tbody>
            ${tramos.map(tramo => {
      const substitution = substitutions.find(s => s.horaInicio === tramo.start && s.horaFin === tramo.end);
      const isRecreo = tramo.blocked;

      if (substitution) {
        const ausente = profesores.find(p => p.id === substitution.profesorAusenteId);
        const sustituto = profesores.find(p => p.id === substitution.profesorSustitutoId);
        const extra = profesores.find(p => p.id === substitution.profesorExtraId);

        const sustitutoNombre = sustituto ? getDisplayNameForProfesor(sustituto.id, sustituto.profesor || sustituto.profesorNombre, substitution.fecha) : '-';
        const extraNombre = extra ? getDisplayNameForProfesor(extra.id, extra.profesor || extra.profesorNombre, substitution.fecha) : null;

        return `
                  <tr class="${isRecreo ? 'tramo-recreo' : ''}" data-id="${substitution.id}">
                    <td class="tramo-time">
                      ${tramo.start}<br>${tramo.end}${isRecreo ? ' · Recreo' : ''}
                    </td>
                    <td class="tramo-sustituto">
                      <div class="tramo-sustituto-inner">
                        <span class="tramo-sustituto-content">
                          ${sustitutoNombre}
                          ${extraNombre ? `<br>+${extraNombre}` : ''}
                        </span>
                        <button class="btn-delete-tramo" data-id="${substitution.id}" title="Eliminar tramo">🗑️</button>
                      </div>
                    </td>
                    <td class="tramo-grupo">
                      ${substitution.cursoGrupoMateria || '-'}
                    </td>
                  </tr>
                `;
      } else {
        return `
                  <tr class="${isRecreo ? 'tramo-recreo' : ''}" data-tramo="${tramo.start}-${tramo.end}" data-ausente-id="${ausenteId}">
                    <td class="tramo-time">
                      ${tramo.start}<br>${tramo.end}${isRecreo ? ' · Recreo' : ''}
                    </td>
                    <td class="tramo-sustituto">-</td>
                    <td class="tramo-grupo">-</td>
                  </tr>
                `;
      }
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  });

  el.substitutionGrid.innerHTML = dashboardHTML;

  // Event listeners para botones de eliminar todos
  el.substitutionGrid.querySelectorAll('.btn-delete-all').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ausenteId = btn.dataset.ausenteId;
      const displayName = btn.dataset.teacher;
      const plainName = displayName.replace(/<[^>]*>/g, '');
      if (confirm(`¿Estás seguro de eliminar todas las sustituciones de ${plainName}?`)) {
        const teacherSubstitutions = daySubstitutions.filter(sub => {
          return sub.profesorAusenteId === ausenteId;
        });

        const allSubstitutions = getSustituciones();
        const updated = allSubstitutions.filter(sub =>
          !teacherSubstitutions.some(teacherSub => teacherSub.id === sub.id)
        );

        await setSustituciones(updated);
        renderDashboard();
        updateStats();
        renderPrintTable();
      }
    });
  });

  // Event listeners para botones de eliminar tramo (papelera junto al nombre)
  el.substitutionGrid.querySelectorAll('.btn-delete-tramo').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('¿Estás seguro de eliminar esta sustitución?')) {
        const allSubstitutions = getSustituciones();
        const updated = allSubstitutions.filter(s => s.id !== id);
        await setSustituciones(updated);
        renderDashboard();
        updateStats();
        renderPrintTable();
      }
    });
  });

  // Event listeners para celdas editables
  el.substitutionGrid.querySelectorAll('.tramo-sustituto, .tramo-grupo').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      const ausenteId = row.dataset.ausenteId;
      const tramoData = row.dataset.tramo;

      // Verificar si es el recreo
      if (tramoData) {
        const [start, end] = tramoData.split('-');
        const tramoRecreo = tramos.find(t => t.start === start && t.blocked);
        if (tramoRecreo) {
          return; // No permitir editar el recreo
        }
      }

      const substitution = getSustituciones().find(s => s.id === id);

      if (substitution) {
        openModal('edit', substitution);
      } else {
        // Si no hay sustitución, crear una nueva
        const tramo = row.dataset.tramo;
        if (tramo) {
          const [start, end] = tramo.split('-');
          setActiveDate(state.activeDate);
          openModal('new');
          el.formHoraInicio.value = start;
          el.formHoraFin.value = end;
          updateHoraFin();
          refreshProfesorOptions();
          el.formProfesorAusente.value = ausenteId || "";
          updateFormDay();
          updateMateriaInfo();
          refreshSustitutoOptions(ausenteId || "");
        }
      }
    });
  });
};

const renderCalendar = () => {
  const date = state.calendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const sustituciones = getSustituciones();
  const datesWithSubs = new Set(sustituciones.map(s => s.fecha));

  // Convertir a sistema de semana empezando en lunes (lunes=0, domingo=6)
  const firstDayOfWeek = firstDay.getDay();
  const startDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const totalDays = lastDay.getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const header = `
    <div class="calendar-header">
      <button class="icon-btn" data-cal="prev">◀</button>
      <span>${date.toLocaleDateString("es-ES", { month: "long" })} ${year}</span>
      <button class="icon-btn" data-cal="next">▶</button>
    </div>
  `;

  const daysRow = dayLabels
    .map((d, index) => {
      const isWeekend = index >= 5; // Sábado (5) y Domingo (6)
      return `<div class="calendar-day ${isWeekend ? 'is-weekend' : ''}">${d}</div>`;
    })
    .join("");

  let cells = "";
  for (let i = 0; i < startDay; i += 1) {
    const num = prevMonthDays - startDay + i + 1;
    cells += `<div class="calendar-cell is-muted">${num}</div>`;
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const cellDate = new Date(year, month, day);
    const dayOfWeek = cellDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Domingo o Sábado
    const isActive = toIso(cellDate) === toIso(state.activeDate);
    const dateKey = toIso(cellDate);
    const hasSubstitution = datesWithSubs.has(dateKey);
    const dotClass = hasSubstitution ? ' has-substitution' : '';
    cells += `<div class="calendar-cell ${isActive ? "is-active" : ""} ${isWeekend ? "is-weekend" : ""}${dotClass}" data-date="${toIso(
      cellDate
    )}">${day}${hasSubstitution ? '<span class="sub-dot"></span>' : ''}</div>`;
  }

  el.miniCalendar.innerHTML = `
    ${header}
    <div class="calendar-grid">${daysRow}${cells}</div>
  `;

  el.miniCalendar.querySelectorAll("[data-cal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = btn.dataset.cal;
      state.calendarDate = new Date(year, month + (dir === "next" ? 1 : -1), 1);
      renderCalendar();
    });
  });

  el.miniCalendar.querySelectorAll("[data-date]").forEach((cell) => {
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const selected = fromIso(cell.dataset.date);
      setActiveDate(selected);
      return false;
    });
  });
};

const validateForm = () => {
  const fecha = el.formFecha.value;
  const horaInicio = el.formHoraInicio.value;
  const horaFin = el.formHoraFin.value;
  const ausenteId = el.formProfesorAusente.value;
  const sustitutoId = el.formProfesorSustituto.value;
  const extraId = el.formProfesorExtra.value;

  const tramo = getTramoByStart(horaInicio);
  if (tramo && tramo.blocked) {
    return { error: "No se permite guardar en el tramo de recreo (12:00-12:30)." };
  }
  if (ausenteId && sustitutoId && ausenteId === sustitutoId) {
    return { error: "El profesor ausente no puede ser el sustituto." };
  }
  const conflict = getSustituciones().find(
    (s) =>
      s.fecha === fecha &&
      s.horaInicio === horaInicio &&
      s.horaFin === horaFin &&
      s.profesorSustitutoId === sustitutoId &&
      s.id !== state.editingId
  );
  if (conflict) {
    return { error: "El profesor sustituto ya está asignado en este tramo." };
  }
  if (extraId && extraId === ausenteId) {
    const ok = window.confirm(
      "El profesor extra coincide con el ausente. ¿Deseas continuar?"
    );
    if (!ok) return { cancel: true };
  }
  return null;
};

const handleSubmit = (event) => {
  event.preventDefault();
  const validation = validateForm();
  if (validation?.error) {
    el.formError.textContent = validation.error;
    return;
  }
  if (validation?.cancel) {
    return;
  }
  const fecha = el.formFecha.value;
  const diaSemana = normalizeDay(el.formDiaSemana.textContent);
  const horaInicio = el.formHoraInicio.value;
  const horaFin = el.formHoraFin.value;
  const ausenteId = el.formProfesorAusente.value;
  const sustitutoId = el.formProfesorSustituto.value || null;
  const extraId = el.formProfesorExtra.value || null;
  const cursoGrupoMateria = el.formCursoGrupo.value || "";

  const sustituciones = getSustituciones();
  if (state.editingId) {
    const updated = sustituciones.map((s) =>
      s.id === state.editingId
        ? {
          ...s,
          fecha,
          diaSemana,
          horaInicio,
          horaFin,
          profesorAusenteId: ausenteId,
          profesorSustitutoId: sustitutoId,
          profesorExtraId: extraId,
          cursoGrupoMateria,
          updatedAt: new Date().toISOString(),
        }
        : s
    );
    setSustituciones(updated);
  } else {
    const newSub = {
      id: generateId(),
      fecha,
      diaSemana,
      horaInicio,
      horaFin,
      profesorAusenteId: ausenteId,
      profesorSustitutoId: sustitutoId,
      profesorExtraId: extraId,
      cursoGrupoMateria,
      notas: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSustituciones([...sustituciones, newSub]);
  }
  closeModal();
  renderDashboard();
  updateStats();
  renderPrintTable();
};

const parseCsv = (file) =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",
      complete: (results) => resolve(results),
      error: (err) => reject(err),
    });
  });

const parseXlsx = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  const columns = json.length ? Object.keys(json[0]) : [];
  return { data: json, meta: { fields: columns } };
};

const parsePdf = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let allLines = [];

    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join("\n");
      allLines = allLines.concat(pageText.split("\n"));
    }

    const rows = allLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s{2,}|\t|\|/).map((cell) => cell.trim()).filter(Boolean));

    const validRows = rows.filter((row) => row.length > 1);

    const columns = validRows.length
      ? validRows[0].map((_, idx) => `Col ${idx + 1}`)
      : [];

    const data = validRows.map((row) => {
      const record = {};
      columns.forEach((col, idx) => {
        record[col] = row[idx] || "";
      });
      return record;
    });

    return { data, meta: { fields: columns }, isPdf: true };
  } catch (error) {
    console.error("PDF parsing error:", error);
    return { data: [], meta: { fields: [] }, isPdf: true, error: error.message };
  }
};

const loadImportFile = async (file) => {
  if (!file) return;
  const name = file.name.toLowerCase();
  el.importError.textContent = "";
  try {
    let results;
    if (name.endsWith(".csv")) {
      results = await parseCsv(file);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      results = await parseXlsx(file);
    } else if (name.endsWith(".pdf")) {
      results = await parsePdf(file);
      if (results.data.length === 0) {
        el.importMeta.textContent = `${file.name} · No se pudieron extraer datos del PDF`;
        el.importError.textContent = "El PDF no tiene un formato reconocible. Asegúrate de que sea un PDF con texto seleccionable.";
        return;
      }
      if (results.isPdf) {
        el.importMeta.textContent = `${file.name} · ${results.data.length} filas · PDF detectado`;
      }
    } else {
      throw new Error("Formato no soportado. Usa CSV, Excel (.xlsx/.xls) o PDF.");
    }

    state.importRows = results.data || [];
    state.importColumns = results.meta?.fields || [];

    if (state.importRows.length === 0) {
      el.importMeta.textContent = `${file.name} · Sin datos`;
      el.importError.textContent = "No se encontraron datos en el archivo. Verifica el formato.";
      return;
    }

    el.importMeta.textContent = `${file.name} · ${state.importRows.length} filas`;
    buildMappingUI();
    renderPreview();
  } catch (error) {
    el.importError.textContent = error.message || "No se pudo leer el archivo. Revisa el formato.";
  }
};

const buildMappingUI = () => {
  const config = datasetConfig[state.importType];
  el.mappingGrid.innerHTML = config.fields
    .map(
      (field) => `
      <label>
        ${field.label}
        <select data-map="${field.key}">
          <option value="">Sin asignar</option>
          ${state.importColumns
          .map((col) => `<option value="${col}">${col}</option>`)
          .join("")}
        </select>
      </label>
    `
    )
    .join("");

  el.mappingGrid.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", () => {
      state.importMapping[select.dataset.map] = select.value;
      validateMapping();
    });
  });

  const normalizeColumn = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_]/g, "")
      .replace(/\s+/g, "");

  const getFieldVariants = (field) => {
    const variants = new Set();
    variants.add(field.key);
    variants.add(field.label.toLowerCase());
    variants.add(field.key.replace(/([A-Z])/g, "_$1").toLowerCase());
    variants.add(field.key.replace(/([A-Z])/g, "$1").toLowerCase());
    return variants;
  };

  if (state.importType === "profesores" && state.importColumns.length >= 4) {
    config.fields.forEach((field, index) => {
      const select = el.mappingGrid.querySelector(`[data-map="${field.key}"]`);
      if (select && state.importColumns[index]) {
        select.value = state.importColumns[index];
        state.importMapping[field.key] = state.importColumns[index];
      }
    });
  } else {
    config.fields.forEach((field) => {
      const select = el.mappingGrid.querySelector(`[data-map="${field.key}"]`);
      if (!select) return;
      const fieldVariants = getFieldVariants(field);
      const match = state.importColumns.find((col) => {
        const normalizedCol = normalizeColumn(col);
        return fieldVariants.has(normalizedCol) ||
          Array.from(fieldVariants).some(v => normalizedCol.includes(v));
      });
      if (match) {
        select.value = match;
        state.importMapping[field.key] = match;
      }
    });
  }
  validateMapping();
};

const validateMapping = () => {
  const config = datasetConfig[state.importType];
  const missing = config.required.filter((key) => !state.importMapping[key]);
  el.importConfirm.disabled = missing.length > 0 || state.importRows.length === 0;
};

const renderPreview = () => {
  if (!state.importRows.length) {
    el.previewTable.innerHTML = "Sin datos";
    return;
  }
  const preview = state.importRows.slice(0, 8);
  const cols = state.importColumns;
  const header = cols.map((c) => `<th>${c}</th>`).join("");
  const body = preview
    .map((row) => {
      const cells = cols.map((c) => `<td>${row[c] ?? ""}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  el.previewTable.innerHTML = `
    <table class="table">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
};

const applyImport = () => {
  const config = datasetConfig[state.importType];
  const mapping = state.importMapping;
  const rows = state.importRows;

  if (!rows.length) return;
  const mapped = rows.map((row) => {
    const record = {};
    config.fields.forEach((field) => {
      const key = mapping[field.key];
      record[field.key] = key ? row[key] : "";
    });
    return record;
  });

  if (state.importType === "profesores") {
    const profesores = mapped.map((row) => {
      const prof = {
        id: generateId(),
        profesor: row.profesor || "",
        puesto: row.puesto || "",
        movilAvisos: row.movilAvisos || "",
        cuenta: row.cuenta || "",
      };
      return prof;
    });
    setProfesores(profesores);
  }

  if (state.importType === "materias") {
    const newMaterias = mapped.map((row) => {
      return {
        id: generateId(),
        diaSemana: normalizeDay(row.diaSemana),
        horaInicio: normalizeTime(row.horaInicio),
        horaFin: normalizeTime(row.horaFin),
        profesorId: resolveProfesorId(row.profesor),
        profesorNombre: row.profesor || "",
        cursoGrupo: row.cursoGrupo || "",
        materia: row.materia || "",
      };
    });
    const existingMaterias = getMaterias();
    setMaterias([...existingMaterias, ...newMaterias]);
  }

  if (state.importType === "tabla") {
    const existingTabla = getTabla();
    const existingIds = new Set(existingTabla.map(t => t.id));

    const newTabla = mapped.map((row) => {
      const profesorId = resolveProfesorId(row.profesor);
      const diaSemana = normalizeDay(row.diaSemana);
      const horaInicio = normalizeTime(row.horaInicio);
      const horaFin = normalizeTime(row.horaFin);
      const asignatura = row.asignatura || "";
      const cursoGrupo = row.cursoGrupo || "";

      // Generar ID determinístico para evitar duplicados
      const deterministicId = generateDeterministicId(profesorId, diaSemana, horaInicio, horaFin, asignatura, cursoGrupo);

      return {
        id: deterministicId,
        profesorId: profesorId,
        profesorNombre: row.profesor || "",
        diaSemana: diaSemana,
        horaInicio: horaInicio,
        horaFin: horaFin,
        asignatura: asignatura,
        cursoGrupo: cursoGrupo,
      };
    }).filter(newRow => {
      // Filtrar duplicados: no agregar si ya existe un registro con el mismo ID
      if (existingIds.has(newRow.id)) {
        return false;
      }
      existingIds.add(newRow.id);
      return true;
    });

    setTabla([...existingTabla, ...newTabla]);
    alert(`Importación completada: ${newTabla.length} registros nuevos añadidos`);
  }

  refreshProfesorOptions();
  closeImportModal();
  renderDashboard();
};

const renderProfesoresCards = (profesores) => {
  const search = state.datasetViewSearch.toLowerCase();
  const filtered = search
    ? profesores.filter((p) =>
      Object.values(p).some((val) =>
        String(val || "").toLowerCase().includes(search)
      )
    )
    : profesores;

  if (!filtered.length) {
    return `<div class="empty-profesores">No hay profesores para mostrar.</div>`;
  }

  const cards = filtered.map((prof) => `
    <div class="profesor-card" data-id="${prof.id}">
      <div class="profesor-header">
        <div class="profesor-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="4"></circle>
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6"></path>
          </svg>
        </div>
        <div class="profesor-info">
          <h3 class="profesor-nombre">${prof.profesor || 'Sin nombre'}</h3>
          <span class="profesor-puesto">${prof.puesto || 'Sin puesto'}</span>
        </div>
      </div>
      <div class="profesor-email">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
        <span>${prof.cuenta || 'Sin email'}</span>
      </div>
      <div class="profesor-movil">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
        <span>${prof.movilAvisos || 'Sin móvil'}</span>
      </div>
      <div class="profesor-actions">
        <button class="btn-profesor-edit" data-id="${prof.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Editar
        </button>
        <button class="btn-profesor-delete" data-id="${prof.id}" data-name="${prof.profesor}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <polyline points="3,6 5,6 21,6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    </div>
  `).join("");

  return `<div class="profesores-grid">${cards}</div>`;
};

const renderDataset = (type) => {
  state.datasetViewType = type;

  // Si es la página de profesores, mostrar la tabla de datos
  if (type === "profesores") {
    type = "tabla";
  }

  const data =
    type === "profesores"
      ? getProfesores()
      : type === "materias"
        ? getMaterias()
        : getTabla();

  // Debug: mostrar cantidad de registros cargados
  if (type === "tabla") {
    console.log(`[DEBUG] Total registros en tabla: ${data.length}`);
    const profesoresUnicos = [...new Set(data.map(r => r.profesorNombre || r.profesorId))];
    console.log(`[DEBUG] Profesores únicos: ${profesoresUnicos.length}`);
    console.log(`[DEBUG] Primeros 5 profesores:`, profesoresUnicos.slice(0, 5));
    console.log(`[DEBUG] Últimos 5 profesores:`, profesoresUnicos.slice(-5));
  }

  if (type === "profesores") {
    el.datasetTable.innerHTML = renderProfesoresCards(data);
    // Add event listeners for profesor card buttons
    el.datasetTable.querySelectorAll('.btn-profesor-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        editProfesor(id);
      });
    });
    el.datasetTable.querySelectorAll('.btn-profesor-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        deleteProfesor(id, name);
      });
    });
    return;
  }

  // Custom view for materias with profesor name resolution
  if (type === "materias") {
    const profesores = getProfesores();
    const search = state.datasetViewSearch.toLowerCase();
    const filtered = search
      ? data.filter((row) =>
        Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(search)
        )
      )
      : data;

    if (!filtered.length) {
      el.datasetTable.innerHTML = `<div class="empty-materias">No hay materias para mostrar.</div>`;
      return;
    }

    // Build table with profesor names
    const headerRow = `
      <th>Profesor</th>
      <th>Día</th>
      <th>Hora Inicio</th>
      <th>Hora Fin</th>
      <th>Asignatura</th>
      <th>Curso/Grupo</th>
    `;

    const body = filtered
      .map((row) => {
        const prof = profesores.find((p) => p.id === row.profesorId);
        const profesorName = row.profesorNombre || (prof ? prof.profesor : row.profesorId || "-");
        return `
          <tr>
            <td>${profesorName}</td>
            <td>${row.diaSemana || '-'}</td>
            <td>${row.horaInicio || '-'}</td>
            <td>${row.horaFin || '-'}</td>
            <td>${row.materia || '-'}</td>
            <td>${row.cursoGrupo || '-'}</td>
          </tr>
        `;
      })
      .join("");

    el.datasetTable.innerHTML = `
      <table class="table materias-table">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    `;

    return;
  }

  // Custom view for tabla with profesor name resolution
  if (type === "tabla") {
    const profesores = getProfesores();
    const search = state.datasetViewSearch.toLowerCase();
    const selectedProfesor = state.selectedProfesorFilter || "";

    let filtered = data;

    // Filtrar por búsqueda
    if (search) {
      filtered = filtered.filter((row) =>
        Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(search)
        )
      );
    }

    // Filtrar por profesor seleccionado
    if (selectedProfesor) {
      filtered = filtered.filter((row) => String(row.profesorId) === String(selectedProfesor));
    }

    // Actualizar selector de profesores (todos los profesores registrados)
    const filterSelect = document.getElementById("filterProfesor");
    if (filterSelect && profesores.length > 0) {
      const currentOptions = Array.from(filterSelect.options).map(o => o.value);
      const profesorIds = profesores.map(p => p.id);

      // Solo actualizar si hay cambios
      if (JSON.stringify(currentOptions.slice(1)) !== JSON.stringify(profesorIds)) {
        filterSelect.innerHTML = '<option value="">Todos los profesores</option>' +
          profesores.map(prof => {
            return `<option value="${prof.id}" ${String(prof.id) === String(selectedProfesor) ? 'selected' : ''}>${prof.profesor}</option>`;
          }).join("");
      }
    }

    if (!filtered.length) {
      el.datasetTable.innerHTML = `<div class="empty-tabla">No hay registros para mostrar.</div>`;
      return;
    }

    // Build table with profesor names y checkboxes
    const headerRow = `
      <th><input type="checkbox" id="selectAll" title="Seleccionar todos"></th>
      <th>Profesor</th>
      <th>Día</th>
      <th>Hora Inicio</th>
      <th>Hora Fin</th>
      <th>Asignatura</th>
      <th>Curso/Grupo</th>
    `;

    const body = filtered
      .map((row) => {
        const prof = profesores.find((p) => String(p.id) === String(row.profesorId));
        const profesorName = row.profesorNombre || (prof ? prof.profesor : row.profesorId || "-");
        // Todos los registros deben tener un ID (determinístico o generado)
        const rowId = row.id;
        return `
          <tr data-row-id="${rowId}">
            <td><input type="checkbox" class="row-checkbox" data-row-id="${rowId}"></td>
            <td>${profesorName}</td>
            <td>${row.diaSemana || '-'}</td>
            <td>${row.horaInicio || '-'}</td>
            <td>${row.horaFin || '-'}</td>
            <td>${row.asignatura || '-'}</td>
            <td>${row.cursoGrupo || '-'}</td>
          </tr>
        `;
      })
      .join("");

    el.datasetTable.innerHTML = `
      <table class="table tabla-sustituciones-table">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    `;

    // Configurar eventos de checkboxes
    setupTableCheckboxEvents(filtered);

    return;
  }

  // Table view for generic data
  const search = state.datasetViewSearch.toLowerCase();
  const filtered = search
    ? data.filter((row) =>
      Object.values(row).some((val) =>
        String(val || "")
          .toLowerCase()
          .includes(search)
      )
    )
    : data;

  if (!data.length) {
    el.datasetTable.innerHTML = "No hay datos para mostrar.";
    return;
  }

  const headers = Object.keys(data[0]);
  const headerRow = headers.map((h) => `<th>${h}</th>`).join("");
  const body = filtered
    .map((row) => {
      const cells = headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  el.datasetTable.innerHTML = `
    <div class="filters" style="margin-bottom:12px;">
      <label>
        Buscar
        <input type="text" id="datasetSearch" value="${state.datasetViewSearch}" placeholder="Filtrar..." />
      </label>
      <div style="font-size:0.8rem;color:#6b7280;">${filtered.length} registros</div>
    </div>
    <table class="table">
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
};

const editProfesor = (id) => {
  const profesores = getProfesores();
  const prof = profesores.find((p) => p.id === id);
  if (!prof) return;

  // Simple prompt-based editing (can be enhanced with a modal later)
  const nuevoProfesor = prompt("Nombre y apellidos:", prof.profesor);
  if (nuevoProfesor === null) return; // Cancelled

  const nuevoPuesto = prompt("Puesto:", prof.puesto);
  if (nuevoPuesto === null) return;

  const nuevoMovil = prompt("Móvil avisos emergencia:", prof.movilAvisos);
  if (nuevoMovil === null) return;

  const nuevaCuenta = prompt("Cuenta Google/Microsoft:", prof.cuenta);
  if (nuevaCuenta === null) return;

  const updated = profesores.map((p) =>
    p.id === id
      ? {
        ...p,
        profesor: nuevoProfesor || p.profesor,
        puesto: nuevoPuesto || p.puesto,
        movilAvisos: nuevoMovil || p.movilAvisos,
        cuenta: nuevaCuenta || p.cuenta,
      }
      : p
  );
  setProfesores(updated);
  renderDataset("profesores");
  refreshProfesorOptions();
  alert("Profesor actualizado correctamente.");
};

const deleteProfesor = (id, name) => {
  const ok = confirm(`¿Seguro que deseas eliminar a ${name || "este profesor"}?`);
  if (!ok) return;

  const profesores = getProfesores();
  const updated = profesores.filter((p) => p.id !== id);
  setProfesores(updated);
  renderDataset("profesores");
  refreshProfesorOptions();
  alert("Profesor eliminado correctamente.");
};

const addNewProfesor = () => {
  const profesor = prompt("Nombre y apellidos del profesor:");
  if (profesor === null || profesor.trim() === "") return;

  const puesto = prompt("Puesto:", "Profesor/a");
  if (puesto === null) return;

  const movilAvisos = prompt("Móvil avisos emergencia:");
  if (movilAvisos === null) return;

  const cuenta = prompt("Cuenta Google/Microsoft:");
  if (cuenta === null) return;

  const newProf = {
    id: generateId(),
    profesor: profesor.trim(),
    puesto: puesto.trim() || "Profesor/a",
    movilAvisos: movilAvisos.trim(),
    cuenta: cuenta.trim(),
  };

  const profesores = getProfesores();
  setProfesores([...profesores, newProf]);
  renderDataset("profesores");
  refreshProfesorOptions();
  alert("Profesor añadido correctamente.");
};

const addNewTablaRecord = () => {
  const profesor = prompt("Nombre y apellidos del profesor:");
  if (profesor === null || profesor.trim() === "") return;

  const diaSemana = prompt("Día de la semana (ej: lunes):");
  if (diaSemana === null || diaSemana.trim() === "") return;

  const horaInicio = prompt("Hora de inicio (ej: 9:00):");
  if (horaInicio === null || horaInicio.trim() === "") return;

  const horaFin = prompt("Hora de fin (ej: 9:30):");
  if (horaFin === null || horaFin.trim() === "") return;

  const asignatura = prompt("Asignatura (ej: Matemáticas):");
  if (asignatura === null) return;

  const cursoGrupo = prompt("Curso/Grupo (ej: 3ºA):");
  if (cursoGrupo === null) return;

  // Resolve profesor ID
  const profesorId = resolveProfesorId(profesor.trim());

  const normalizedDia = normalizeDay(diaSemana.trim());
  const normalizedHoraInicio = normalizeTime(horaInicio.trim());
  const normalizedHoraFin = normalizeTime(horaFin.trim());
  const normalizedAsignatura = asignatura.trim();
  const normalizedCursoGrupo = cursoGrupo.trim();

  // Generar ID determinístico
  const deterministicId = generateDeterministicId(
    profesorId,
    normalizedDia,
    normalizedHoraInicio,
    normalizedHoraFin,
    normalizedAsignatura,
    normalizedCursoGrupo
  );

  // Check if record already exists (by ID or by content)
  const tabla = getTabla();
  const existingRecord = tabla.find((t) =>
    t.id === deterministicId || (
      t.profesorId === profesorId &&
      normalizeDay(t.diaSemana) === normalizedDia &&
      t.horaInicio === normalizedHoraInicio &&
      t.horaFin === normalizedHoraFin
    )
  );

  if (existingRecord) {
    const replace = confirm(
      `Ya existe un registro con los mismos datos:\n` +
      `Profesor: ${profesor}\n` +
      `Día: ${diaSemana}\n` +
      `Horario: ${horaInicio} - ${horaFin}\n\n` +
      `¿Deseas reemplazar el registro existente?`
    );
    if (!replace) return;

    // Remove existing record and add new one
    const updated = tabla.filter((t) => t.id !== existingRecord.id);
    const newRecord = {
      id: deterministicId,
      profesorId: profesorId,
      profesorNombre: profesor.trim(),
      diaSemana: normalizedDia,
      horaInicio: normalizedHoraInicio,
      horaFin: normalizedHoraFin,
      asignatura: normalizedAsignatura,
      cursoGrupo: normalizedCursoGrupo,
    };
    setTabla([...updated, newRecord]);
    alert("Registro actualizado correctamente.");
  } else {
    // Add new record
    const newRecord = {
      id: deterministicId,
      profesorId: profesorId,
      profesorNombre: profesor.trim(),
      diaSemana: normalizedDia,
      horaInicio: normalizedHoraInicio,
      horaFin: normalizedHoraFin,
      asignatura: normalizedAsignatura,
      cursoGrupo: normalizedCursoGrupo,
    };
    setTabla([...tabla, newRecord]);
    alert("Registro añadido correctamente.");
  }

  renderDataset("tabla");
  refreshProfesorOptions();
};

const isRelevistaDeBajaActiva = (profesorSustitutoId, profesorAusenteId, fecha) => {
  const bajasActivas = getBajasActivas();
  const fechaSust = fromIso(fecha);
  
  const bajaRelevista = bajasActivas.find(b => {
    if (b.profesorRelevistaId !== profesorSustitutoId) return false;
    const inicio = fromIso(b.fechaInicio);
    const fin = b.fechaFin ? fromIso(b.fechaFin) : null;
    if (fechaSust < inicio) return false;
    if (fin && fechaSust > fin) return false;
    return true;
  });
  
  return bajaRelevista && bajaRelevista.profesorBajaId === profesorAusenteId;
};

const updateStats = () => {
  const from = el.statsFrom.value ? fromIso(el.statsFrom.value) : null;
  const to = el.statsTo.value ? fromIso(el.statsTo.value) : null;
  const profesorId = el.statsProfesor.value;
  const profesores = getProfesores();

  const filtered = getSustituciones().filter((s) => {
    if (isRelevistaDeBajaActiva(s.profesorSustitutoId, s.profesorAusenteId, s.fecha)) {
      return false;
    }
    const date = fromIso(s.fecha);
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (profesorId && s.profesorAusenteId !== profesorId && s.profesorSustitutoId !== profesorId) {
      return false;
    }
    return true;
  });

  el.statTotal.textContent = filtered.length;

  const countBy = (key) => {
    const map = {};
    filtered.forEach((s) => {
      const id = s[key];
      if (!id) return;
      if (!map[id]) {
        map[id] = { dias: new Set(), sesiones: 0 };
      }
      map[id].sesiones++;
      map[id].dias.add(s.fecha);
    });
    return Object.entries(map)
      .sort((a, b) => b[1].sesiones - a[1].sesiones)
      .slice(0, 5)
      .map(([id, data]) => {
        const prof = profesores.find((p) => p.id === id);
        const nombreOriginal = prof ? prof.profesor : id;
        const nombreMostrado = getDisplayNameForProfesor(id, nombreOriginal);
        return { name: nombreMostrado, dias: data.dias.size, sesiones: data.sesiones };
      });
  };

  const topAbsent = countBy("profesorAusenteId");
  const topSub = countBy("profesorSustitutoId");

  const renderList = (list) =>
    list.length
      ? list
        .map(
          (item) => `<div class="stat-item"><span>${item.name}</span><span>${item.dias} días / ${item.sesiones} sesiones</span></div>`
        )
        .join("")
      : "Sin datos";

  el.statTopAbsent.innerHTML = renderList(topAbsent);
  el.statTopSub.innerHTML = renderList(topSub);

  const allSubCounts = {};
  filtered.forEach((s) => {
    if (s.profesorSustitutoId) {
      allSubCounts[s.profesorSustitutoId] = (allSubCounts[s.profesorSustitutoId] || 0) + 1;
    }
  });

  const rankingList = Object.entries(allSubCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const prof = profesores.find((p) => p.id === id);
      const nombreOriginal = prof ? prof.profesor : id;
      const nombreMostrado = getDisplayNameForProfesor(id, nombreOriginal);
      return { name: nombreMostrado, count };
    });

  const renderRanking = (list) =>
    list.length
      ? list
        .map(
          (item) => `<div class="stat-ranking-item"><span class="stat-ranking-name">${item.name}</span><span class="stat-ranking-count">${item.count}</span></div>`
        )
        .join("")
      : "Sin datos";

  el.statRankingSub.innerHTML = renderRanking(rankingList);
};

const renderPrintTable = () => {
  const from = el.printFrom.value ? fromIso(el.printFrom.value) : null;
  const to = el.printTo.value ? fromIso(el.printTo.value) : null;
  const selected = el.printDate.value ? fromIso(el.printDate.value) : state.activeDate;
  const dateList = [];

  if (from && to) {
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      dateList.push(new Date(d));
    }
  } else {
    dateList.push(selected);
  }

  const profesores = getProfesores();
  const sustituciones = getSustituciones();

  el.printTable.innerHTML = dateList
    .map((date) => {
      const dateKey = toIso(date);
      const daySubstitutions = sustituciones.filter(s => s.fecha === dateKey);

      if (daySubstitutions.length === 0) {
        return `
          <h3 class="print-date-header">${getDayName(date)} · ${formatDate(date)}</h3>
          <p class="print-no-data">No hay sustituciones programadas.</p>
        `;
      }

      const substitutionsByTeacher = {};
      daySubstitutions.forEach(sub => {
        const ausente = profesores.find(p => p.id === sub.profesorAusenteId);
        const teacherName = ausente ? ausente.profesor : 'Desconocido';
    const displayName = getDisplayNameForProfesor(sub.profesorAusenteId, teacherName, sub.fecha);

        if (!substitutionsByTeacher[displayName]) {
          substitutionsByTeacher[displayName] = [];
        }
        substitutionsByTeacher[displayName].push(sub);
      });

      let cardsHTML = '';

      Object.entries(substitutionsByTeacher).forEach(([displayName, subs]) => {
        cardsHTML += `
          <div class="print-sub-card">
            <div class="print-card-header">
              <div class="print-teacher-info">
                <div class="print-teacher-avatar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="4"></circle>
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6"></path>
                  </svg>
                </div>
                <div>
                  <h3 class="print-teacher-name">${displayName}</h3>
                  <span class="print-substitution-count">${subs.length} ${subs.length === 1 ? 'tramo' : 'tramos'}</span>
                </div>
              </div>
            </div>
            <table class="print-tramo-table">
              <thead>
                <tr>
                  <th>Tramo</th>
                  <th>Sustituto</th>
                  <th>Grupo/Materia</th>
                </tr>
              </thead>
              <tbody>
                ${tramos.map(tramo => {
          const substitution = subs.find(s => s.horaInicio === tramo.start && s.horaFin === tramo.end);
          const isRecreo = tramo.blocked;

          if (substitution) {
            const sustituto = profesores.find(p => p.id === substitution.profesorSustitutoId);
            const extra = profesores.find(p => p.id === substitution.profesorExtraId);

            const sustitutoNombre = sustituto ? getDisplayNameForProfesor(sustituto.id, sustituto.profesor || sustituto.profesorNombre, substitution.fecha) : '-';
            const extraNombre = extra ? getDisplayNameForProfesor(extra.id, extra.profesor || extra.profesorNombre, substitution.fecha) : null;

            return `
                      <tr class="${isRecreo ? 'print-tramo-recreo' : ''}">
                        <td class="print-tramo-time">
                          ${tramo.start}<br>${tramo.end}${isRecreo ? ' · Recreo' : ''}
                        </td>
                        <td class="print-tramo-sustituto">
                          ${sustitutoNombre}
                          ${extraNombre ? `<br><small>+${extraNombre}</small>` : ''}
                        </td>
                        <td class="print-tramo-grupo">
                          ${substitution.cursoGrupoMateria || '-'}
                        </td>
                      </tr>
                    `;
          } else {
            return `
                      <tr class="${isRecreo ? 'print-tramo-recreo' : ''}">
                        <td class="print-tramo-time">
                          ${tramo.start}<br>${tramo.end}${isRecreo ? ' · Recreo' : ''}
                        </td>
                        <td class="print-tramo-sustituto">-</td>
                        <td class="print-tramo-grupo">-</td>
                      </tr>
                    `;
          }
        }).join('')}
              </tbody>
            </table>
          </div>
        `;
      });

      return `
        <h3 class="print-date-header">${getDayName(date)} · ${formatDate(date)}</h3>
        <div class="print-cards-grid">${cardsHTML}</div>
      `;
    })
    .join("");
};

const initNavigation = () => {
  const mainHeader = document.querySelector(".main-header");
  const sidebar = document.querySelector(".sidebar");
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;

      if (page === "profesores") {
        const savedKey = localStorage.getItem("gs_admin_key");
        const enteredKey = prompt("Introduce la clave de acceso:");
        if (enteredKey !== ".14004129") {
          if (enteredKey !== null) {
            alert("Contacta con administrador");
          }
          return;
        }
        localStorage.setItem("gs_admin_key", enteredKey);
      }

      // Cerrar sidebar al hacer clic en cualquier elemento del menú
      if (sidebar) {
        sidebar.classList.remove("is-open");
      }
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.querySelectorAll(".page").forEach((section) => {
        section.classList.toggle("is-hidden", section.id !== `page-${page}`);
      });
      // Hide header on profesores page, show on others
      if (mainHeader) {
        mainHeader.style.display = page === "inicio" ? "" : "none";
      }
      // Cargar datos de la tabla al entrar en la página de profesores
      if (page === "profesores") {
        renderDataset("tabla");
      }
      // Cargar opciones de profesores al entrar en la página de bajas
      if (page === "bajas") {
        refreshBajaOptions();
        renderBajaActiva();
      }
    });
  });
};

const initImports = () => {
  document.querySelectorAll("[data-import]").forEach((btn) => {
    btn.addEventListener("click", () => openImportModal(btn.dataset.import));
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.datasetViewSearch = "";
      renderDataset(btn.dataset.view);
    });
  });

  // Event delegation for dataset search input to prevent focus loss
  document.addEventListener("input", (e) => {
    if (e.target.id === "datasetSearch") {
      state.datasetViewSearch = e.target.value;
      const activeType = document.querySelector(".page:not(.is-hidden)")?.id?.replace("page-", "");
      if (activeType && ["profesores", "materias", "tabla"].includes(activeType)) {
        renderDataset(activeType);
      }
    }
  });

  // Event delegation for Add buttons
  document.addEventListener("click", (e) => {
    if (e.target.id === "btnAddActividad" || e.target.closest("#btnAddActividad")) {
      addNewTablaRecord();
    }
  });

  document.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const type = btn.dataset.clear;
      if (!type) {
        console.error("Error: Botón sin atributo data-clear");
        return;
      }
      const ok = window.confirm("¿Seguro que deseas borrar este dataset?");
      if (!ok) return;
      try {
        if (type === "profesores") {
          setProfesores([]);
        } else if (type === "materias") {
          setMaterias([]);
        } else if (type === "tabla") {
          setTabla([]);
        }
        renderDataset(type);
        refreshProfesorOptions();
        renderDashboard();
        alert(`${datasetConfig[type]?.label || type} borrado correctamente.`);
      } catch (error) {
        console.error("Error al borrar dataset:", error);
        alert("Error al borrar el dataset. Revisa la consola.");
      }
    });
  });

  // Exportar tabla a CSV
  document.querySelectorAll("[data-export='csv']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabla = getTabla();
      if (!tabla || tabla.length === 0) {
        alert("No hay datos para exportar.");
        return;
      }

      const profesores = getProfesores();

      // Preparar datos con nombres de profesores
      const dataToExport = tabla.map(row => {
        const prof = profesores.find((p) => p.id === row.profesorId);
        return {
          Profesor: row.profesorNombre || (prof ? prof.profesor : row.profesorId || ""),
          Día: row.diaSemana || "",
          "Hora Inicio": row.horaInicio || "",
          "Hora Fin": row.horaFin || "",
          Asignatura: row.asignatura || "",
          "Curso/Grupo": row.cursoGrupo || ""
        };
      });

      // Convertir a CSV usando PapaParse
      const csv = Papa.unparse(dataToExport, {
        header: true,
        delimiter: ";",
        newline: "\n"
      });

      // Crear blob y descargar
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tabla_datos_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  });

  // Evento para filtro de profesor
  const filterProfesor = document.getElementById("filterProfesor");
  if (filterProfesor) {
    filterProfesor.addEventListener("change", (e) => {
      state.selectedProfesorFilter = e.target.value;
      renderDataset("tabla");
    });
  }

  // Evento para borrar seleccionados
  const btnDeleteSelected = document.getElementById("btnDeleteSelected");
  if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener("click", () => {
      if (state.selectedRows.size === 0) {
        alert("No hay filas seleccionadas.");
        return;
      }

      const confirmDelete = confirm(`¿Seguro que deseas borrar ${state.selectedRows.size} registros?`);
      if (!confirmDelete) return;

      const tabla = getTabla();
      const profesores = getProfesores();
      const selectedProfesor = state.selectedProfesorFilter;

      // Filtrar registros a eliminar usando el ID del registro
      const updatedTabla = tabla.filter((row) => {
        // Si hay filtro de profesor activo, solo borrar las filas visibles seleccionadas
        if (selectedProfesor && String(row.profesorId) !== String(selectedProfesor)) {
          return true; // Mantener filas de otros profesores
        }

        return !state.selectedRows.has(row.id);
      });

      setTabla(updatedTabla);
      state.selectedRows.clear();
      updateDeleteButton();
      renderDataset("tabla");
      renderDashboard();
      alert("Registros borrados correctamente.");
    });
  }
};

// Función para configurar eventos de checkboxes en la tabla
const setupTableCheckboxEvents = (filteredData) => {
  const selectAll = document.getElementById("selectAll");
  const checkboxes = document.querySelectorAll(".row-checkbox");
  const btnDelete = document.getElementById("btnDeleteSelected");

  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const rowId = cb.dataset.rowId;
        if (isChecked) {
          state.selectedRows.add(rowId);
        } else {
          state.selectedRows.delete(rowId);
        }
      });
      updateDeleteButton();
    });
  }

  checkboxes.forEach(cb => {
    cb.addEventListener("change", (e) => {
      const rowId = e.target.dataset.rowId;
      if (e.target.checked) {
        state.selectedRows.add(rowId);
      } else {
        state.selectedRows.delete(rowId);
      }

      // Actualizar checkbox de "seleccionar todos"
      if (selectAll) {
        selectAll.checked = checkboxes.length > 0 &&
          Array.from(checkboxes).every(cb => cb.checked);
      }
      updateDeleteButton();
    });
  });
};

// Actualizar estado del botón de borrar
const updateDeleteButton = () => {
  const btnDelete = document.getElementById("btnDeleteSelected");
  if (btnDelete) {
    btnDelete.disabled = state.selectedRows.size === 0;
    btnDelete.textContent = state.selectedRows.size > 0
      ? `🗑️ Borrar ${state.selectedRows.size} seleccionados`
      : "🗑️ Borrar seleccionados";
  }
};

const initEvents = () => {
  el.ctaNueva.addEventListener("click", () => openModal("new"));

  el.modalClose.addEventListener("click", closeModal);
  el.modalCancel.addEventListener("click", closeModal);
  el.modal.querySelector(".modal__overlay").addEventListener("click", closeModal);
  el.substitutionForm.addEventListener("submit", handleSubmit);

  el.formFecha.addEventListener("change", () => {
    updateFormDay();
    updateMateriaInfo();
    refreshProfesorOptions();
    const ausenteId = el.formProfesorAusente.value;
    const currentSustituto = el.formProfesorSustituto.value;
    refreshSustitutoOptions(ausenteId, currentSustituto);
  });
  el.formHoraInicio.addEventListener("change", () => {
    updateHoraFin();
    updateMateriaInfo();
    refreshProfesorOptions();
    const ausenteId = el.formProfesorAusente.value;
    const currentSustituto = el.formProfesorSustituto.value;
    refreshSustitutoOptions(ausenteId, currentSustituto);
  });
  el.formProfesorAusente.addEventListener("change", () => {
    updateMateriaInfo();
    // Obtener el nuevo profesor ausente y actualizar las opciones de sustituto
    const nuevoAusenteId = el.formProfesorAusente.value;
    
    // Si el profesor ausente está de baja, autocompletar con el relevista
    if (nuevoAusenteId) {
      const bajasActivas = getBajasActivas();
      const bajaActiva = bajasActivas.find(b => b.profesorBajaId === nuevoAusenteId);
      if (bajaActiva && bajaActiva.profesorRelevistaId) {
        // El relevista tiene ID - seleccionarlo directamente
        el.formProfesorSustituto.value = bajaActiva.profesorRelevistaId;
      } else if (bajaActiva && bajaActiva.profesorRelevistaNombre) {
        // El relevista no tiene ID - buscar por nombre en la lista de profesores
        const profesores = getProfesores();
        const relevista = profesores.find(p => normalizeText(p.profesor) === normalizeText(bajaActiva.profesorRelevistaNombre));
        if (relevista) {
          el.formProfesorSustituto.value = relevista.id;
        }
      }
    }
    
    const currentSustituto = el.formProfesorSustituto.value;
    refreshSustitutoOptions(nuevoAusenteId, currentSustituto);
  });
  el.formProfesorSustituto.addEventListener("change", () => {
    updateMateriaInfo();
  });

  el.importClose.addEventListener("click", closeImportModal);
  el.importCancel.addEventListener("click", closeImportModal);
  el.importModal.querySelector(".modal__overlay").addEventListener("click", closeImportModal);
  el.importFile.addEventListener("change", (event) => loadImportFile(event.target.files[0]));
  el.importConfirm.addEventListener("click", applyImport);

  el.statsApply.addEventListener("click", updateStats);
  el.printGenerate.addEventListener("click", renderPrintTable);
  el.printBtn.addEventListener("click", printAsPng);
  el.exportPdf.addEventListener("click", async () => {
    renderPrintTable();
    await exportAsPdf();
  });

  // Backup buttons
  const btnBackup = document.getElementById("btnBackup");
  const btnRestore = document.getElementById("btnRestore");
  const backupFile = document.getElementById("backupFile");

  if (btnBackup) {
    btnBackup.addEventListener("click", createBackup);
  }

  if (btnRestore) {
    btnRestore.addEventListener("click", () => {
      backupFile.click();
    });
  }

  const btnSync = document.getElementById("btnSync");
  if (btnSync) {
    btnSync.addEventListener("click", async () => {
      btnSync.textContent = "🔄 Sincronizando...";
      btnSync.disabled = true;
      await supabaseSync();
      btnSync.textContent = "🔄 Sincronizar";
      btnSync.disabled = false;
      alert("Sincronización completada.");
    });
  }

  if (backupFile) {
    backupFile.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        restoreBackup(e.target.files[0]);
      }
    });
  }

  // Eventos de Bajas
  if (el.btnCrearBaja) {
    el.btnCrearBaja.addEventListener("click", crearBaja);
  }
  if (el.btnRevertirBaja) {
    el.btnRevertirBaja.addEventListener("click", revertirBaja);
  }
  if (el.btnVerHistorico) {
    el.btnVerHistorico.addEventListener("click", mostrarHistoricoBajas);
  }
  if (el.historicoBajasClose) {
    el.historicoBajasClose.addEventListener("click", () => {
      el.historicoBajasModal.classList.remove("is-open");
      el.historicoBajasModal.setAttribute("aria-hidden", "true");
    });
  }
  if (el.historicoBajasModal) {
    el.historicoBajasModal.querySelector(".modal__overlay").addEventListener("click", () => {
      el.historicoBajasModal.classList.remove("is-open");
      el.historicoBajasModal.setAttribute("aria-hidden", "true");
    });
  }
};

const createBackup = () => {
  const allStorage = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    try {
      allStorage[key] = JSON.parse(localStorage.getItem(key));
    } catch {
      allStorage[key] = localStorage.getItem(key);
    }
  }

  const backupData = {
    version: "1.0",
    fecha_backup: new Date().toISOString(),
    all_localStorage: allStorage,
    storage_keys: {
      profesores: getProfesores(),
      materias: getMaterias(),
      tabla: getTabla(),
      sustituciones: getSustituciones(),
      bajas: getBajas(),
    },
  };

  const blob = new Blob([JSON.stringify(backupData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fecha = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `backup_sustituciones_${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const totalItems =
    backupData.storage_keys.profesores.length +
    backupData.storage_keys.materias.length +
    backupData.storage_keys.tabla.length +
    backupData.storage_keys.sustituciones.length +
    (backupData.storage_keys.bajas?.length || 0);

  alert(
    `✅ Backup completo creado correctamente\n\n📊 Resumen:\n• Profesores: ${backupData.storage_keys.profesores.length}\n• Materias: ${backupData.storage_keys.materias.length}\n• Tabla sustituciones: ${backupData.storage_keys.tabla.length}\n• Sustituciones: ${backupData.storage_keys.sustituciones.length}\n• Bajas: ${backupData.storage_keys.bajas?.length || 0}\n\nTotal: ${totalItems} registros\n\n📦 Backup completo: ${Object.keys(backupData.all_localStorage).length} elementos`
  );
};

const restoreBackup = (file) => {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const backupData = JSON.parse(e.target.result);

      if (!backupData.storage_keys) {
        alert("❌ Error: El archivo no es un backup válido.");
        return;
      }

      const confirmRestore = confirm(
        `⚠️ ¿Estás seguro de restaurar el backup completo?\n\nSe sobrescribirán TODOS los datos actuales (configuración, profesores, materias, sustituciones, etc.)\n\n📅 Backup del: ${new Date(backupData.fecha_backup).toLocaleString("es-ES")}`
      );

      if (!confirmRestore) return;

      if (backupData.storage_keys.profesores) {
        setProfesores(backupData.storage_keys.profesores);
      }
      if (backupData.storage_keys.materias) {
        setMaterias(backupData.storage_keys.materias);
      }
      if (backupData.storage_keys.tabla) {
        setTabla(backupData.storage_keys.tabla);
      }
      if (backupData.storage_keys.sustituciones) {
        setSustituciones(backupData.storage_keys.sustituciones);
      }
      if (backupData.storage_keys.bajas) {
        setBajas(backupData.storage_keys.bajas);
      }

      if (backupData.all_localStorage) {
        Object.keys(backupData.all_localStorage).forEach(key => {
          const value = backupData.all_localStorage[key];
          if (typeof value === 'string') {
            localStorage.setItem(key, value);
          } else {
            localStorage.setItem(key, JSON.stringify(value));
          }
        });
      }

      refreshProfesorOptions();
      renderDashboard();
      renderCalendar();
      updateStats();
      renderPrintTable();

      alert("✅ Backup completo restaurado correctamente.\n\nPor favor, actualiza la página para ver todos los cambios.");
      location.reload();
    } catch (error) {
      console.error("Error al restaurar backup:", error);
      alert("❌ Error al leer el archivo. Asegúrate de que es un archivo JSON válido.");
    }
  };

  reader.readAsText(file);
};

const printAsPng = async () => {
  // Verificar que html2canvas esté disponible
  if (typeof html2canvas === 'undefined') {
    alert("Error: La librería html2canvas no está cargada. Recarga la página.");
    console.error("html2canvas no está definido");
    return;
  }

  const printContent = document.getElementById("printView");
  if (!printContent) {
    alert("No hay contenido para imprimir.");
    return;
  }

  // Verificar que haya contenido en la tabla
  const printTable = document.getElementById("printTable");
  if (!printTable || printTable.innerHTML.trim() === '') {
    alert("No hay datos para imprimir. Primero haz clic en 'Actualizar vista'.");
    return;
  }

  const originalWidth = printContent.style.width;
  printContent.style.width = "1200px";
  printContent.style.position = "fixed";
  printContent.style.left = "-9999px";
  printContent.style.top = "0";
  printContent.style.zIndex = "-1";

  try {
    console.log("Generando imagen con html2canvas...");
    const canvas = await html2canvas(printContent, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    console.log("Imagen generada correctamente");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para imprimir.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Imprimir Sustituciones</title>
        <style>
          body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
          }
          .print-image {
            max-width: 100%;
            height: auto;
            page-break-after: always;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <img src="${imgData}" class="print-image" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (error) {
    console.error("Error al generar imagen:", error);
    alert("Error al generar la imagen para imprimir: " + error.message);
  } finally {
    printContent.style.width = originalWidth;
    printContent.style.position = "";
    printContent.style.left = "";
    printContent.style.top = "";
    printContent.style.zIndex = "";
  }
};

const exportAsPdf = async () => {
  const printContent = document.getElementById("printView");
  if (!printContent) {
    alert("No hay contenido para exportar.");
    return;
  }

  const printTable = document.getElementById("printTable");
  if (!printTable || printTable.innerHTML.trim() === "") {
    alert("No hay sustituciones para exportar.");
    return;
  }

  const originalWidth = printContent.style.width;
  printContent.style.width = "1200px";
  printContent.style.position = "fixed";
  printContent.style.left = "-9999px";
  printContent.style.top = "0";
  printContent.style.zIndex = "-1";

  try {
    const canvas = await html2canvas(printContent, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const fechaArchivo = new Date().toISOString().split('T')[0];

    // Convertir a blob para descargar
    const response = await fetch(imgData);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    // Crear enlace de descarga automática
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = `sustituciones_${fechaArchivo}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(blobUrl);

    alert("Imagen descargada correctamente.");

  } catch (error) {
    console.error("Error:", error);
    alert("Error al generar el archivo.");
  }

  printContent.style.width = originalWidth;
  printContent.style.position = "";
  printContent.style.left = "";
  printContent.style.top = "";
  printContent.style.zIndex = "";
};

const initConsejoEscolar = () => {
  const btn = document.getElementById("consejoEscolarBtn");
  const panel = document.getElementById("consejoPanel");
  const calculateBtn = document.getElementById("consejoCalculate");

  if (btn && panel) {
    btn.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
  }

  if (calculateBtn) {
    calculateBtn.addEventListener("click", calculateConsejoEscolar);
  }

  const printBtn = document.getElementById("consejoPrint");
  if (printBtn) {
    printBtn.addEventListener("click", printConsejoEscolar);
  }
};

const calculateConsejoEscolar = () => {
  const consejoFrom = document.getElementById("consejoFrom").value;
  const consejoTo = document.getElementById("consejoTo").value;

  if (!consejoFrom || !consejoTo) {
    alert("Por favor, selecciona ambas fechas.");
    return;
  }

  const from = fromIso(consejoFrom);
  const to = fromIso(consejoTo);

  if (from > to) {
    alert("La fecha 'desde' debe ser anterior a 'hasta'.");
    return;
  }

  const sustituciones = getSustituciones();
  const profesores = getProfesores();

  const filteredSubs = sustituciones.filter(s => {
    if (isRelevistaDeBajaActiva(s.profesorSustitutoId, s.profesorAusenteId, s.fecha)) {
      return false;
    }
    const date = fromIso(s.fecha);
    return date >= from && date <= to;
  });

  const HORAS_POR_PROFESOR = 4.5;
  const NUM_PROFESORES = 33;
  const HORAS_TOTALES_DIA = HORAS_POR_PROFESOR * NUM_PROFESORES;

  const diasLaborables = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      diasLaborables.push(new Date(d));
    }
  }

  const totalHorasPeriodo = diasLaborables.length * HORAS_TOTALES_DIA;

  const horasConSustitucion = new Set();
  filteredSubs.forEach(s => {
    const key = `${s.fecha}-${s.horaInicio}`;
    horasConSustitucion.add(key);
  });

  const porcentajeHoras = totalHorasPeriodo > 0
    ? ((horasConSustitucion.size / totalHorasPeriodo) * 100).toFixed(1)
    : 0;

  document.getElementById("consejoHorasSustitucion").textContent = `${porcentajeHoras}%`;
  document.getElementById("consejoHorasDetail").textContent = `${horasConSustitucion.size} / ${totalHorasPeriodo.toFixed(1)} horas`;

  const profesoresAusentes = new Set();
  filteredSubs.forEach(s => {
    if (s.profesorAusenteId) {
      profesoresAusentes.add(s.profesorAusenteId);
    }
  });

  const porcentajeProfesores = profesores.length > 0
    ? ((profesoresAusentes.size / profesores.length) * 100).toFixed(1)
    : 0;

  document.getElementById("consejoProfesoresAusentes").textContent = `${porcentajeProfesores}%`;
  document.getElementById("consejoProfesoresDetail").textContent = `${profesoresAusentes.size} / ${profesores.length} profesores`;
};

const printConsejoEscolar = () => {
  const consejoFrom = document.getElementById("consejoFrom").value;
  const consejoTo = document.getElementById("consejoTo").value;
  const horasValue = document.getElementById("consejoHorasSustitucion").textContent;
  const horasDetail = document.getElementById("consejoHorasDetail").textContent;
  const profesValue = document.getElementById("consejoProfesoresAusentes").textContent;
  const profesDetail = document.getElementById("consejoProfesoresDetail").textContent;

  if (!consejoFrom || !consejoTo) {
    alert("Primero debes calcular los datos seleccionando las fechas.");
    return;
  }

  if (horasValue === "--%") {
    alert("Primero debes calcular los datos.");
    return;
  }

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Informe Consejo Escolar</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          color: #333;
        }
        h1 {
          text-align: center;
          color: #1b1f2a;
          margin-bottom: 10px;
        }
        .date-range {
          text-align: center;
          margin-bottom: 30px;
          color: #666;
        }
        table {
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
          border-collapse: collapse;
        }
        th, td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #5b63ff;
          color: white;
        }
        .percentage {
          font-size: 2rem;
          font-weight: bold;
          color: #15803d;
        }
        .detail {
          color: #666;
          font-size: 0.9rem;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 0.85rem;
          color: #999;
        }
      </style>
    </head>
    <body>
      <h1>Informe de Sustituciones</h1>
      <p class="date-range">Período: ${formatDate(fromIso(consejoFrom))} - ${formatDate(fromIso(consejoTo))}</p>
      
      <table>
        <thead>
          <tr>
            <th>Indicador</th>
            <th>Porcentaje</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Horas con sustitución</td>
            <td class="percentage">${horasValue}</td>
            <td class="detail">${horasDetail}</td>
          </tr>
          <tr>
            <td>Profesores ausentes</td>
            <td class="percentage">${profesValue}</td>
            <td class="detail">${profesDetail}</td>
          </tr>
        </tbody>
      </table>
      
      <p class="footer">Generado por Gestión de Sustituciones - CEIP Noreña</p>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 500);
};

// Funciones para gestionar las bajas de profesores
const refreshBajaOptions = () => {
  const profesores = getProfesores()
    .filter(p => p.id && p.profesor)
    .sort((a, b) => (a.profesor || '').localeCompare(b.profesor || ''));

  const options = ['<option value="">Seleccionar profesor...</option>'];
  profesores.forEach((p) => {
    options.push(`<option value="${p.id}">${p.profesor}</option>`);
  });

  if (el.bajaProfesorBaja) {
    el.bajaProfesorBaja.innerHTML = options.join("");
  }
};

const crearBaja = () => {
  const profesorBajaId = el.bajaProfesorBaja.value;
  const profesorRelevistaNombre = el.bajaProfesorRelevista.value.trim();
  const fechaInicio = el.bajaFechaInicio.value;

  if (!profesorBajaId || !profesorRelevistaNombre || !fechaInicio) {
    alert("Por favor, completa todos los campos obligatorios.");
    return;
  }

  const tabla = getTabla();
  const profesorBaja = tabla.find(t => t.profesorId === profesorBajaId);

  const nuevaBaja = {
    id: generateId(),
    profesorBajaId: profesorBajaId,
    profesorBajaNombre: profesorBaja?.profesorNombre || "Desconocido",
    profesorRelevistaId: null,
    profesorRelevistaNombre: profesorRelevistaNombre,
    fechaInicio: fechaInicio,
    fechaFin: null,
    createdAt: new Date().toISOString(),
  };

  const bajas = getBajas();
  bajas.push(nuevaBaja);
  setBajas(bajas);

  // Guardar inmediatamente en Supabase
  if (useSupabase()) {
    supabaseSave("bajas", [nuevaBaja]);
  }

  el.bajaProfesorBaja.value = "";
  el.bajaProfesorRelevista.value = "";
  el.bajaFechaInicio.value = "";

  renderBajaActiva();

  alert("Baja creada correctamente.");
};

const renderBajaActiva = () => {
  const bajasActivas = getBajasActivas();

  if (bajasActivas.length > 0 && el.bajaActive) {
    el.bajaActive.style.display = "block";

    // Generar HTML para cada baja activa
    const bajasHTML = bajasActivas.map(baja => `
      <div class="baja-info-row">
        <span class="baja-label">Profesor de baja:</span>
        <span class="baja-value">${baja.profesorBajaNombre}</span>
        <span class="baja-label" style="margin-top:4px">Relevista:</span>
        <span class="baja-value">${baja.profesorRelevistaNombre}</span>
        <span class="baja-label" style="margin-top:4px">Desde:</span>
        <span class="baja-value">${formatDate(new Date(baja.fechaInicio))}</span>
        <button class="btn btn-sm btn-danger" onclick="revertirBaja('${baja.id}')" style="margin-top:8px;padding:4px 8px;font-size:0.8rem">Revertir</button>
      </div>
    `).join('');

    el.bajaActive.innerHTML = `
      <div class="baja-active-badge">${bajasActivas.length} baja${bajasActivas.length > 1 ? 's' : ''} activa${bajasActivas.length > 1 ? 's' : ''}</div>
      <div class="baja-active-info" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
        ${bajasHTML}
      </div>
    `;

    if (el.btnRevertirBaja) el.btnRevertirBaja.style.display = "none";
  } else if (el.bajaActive) {
    el.bajaActive.style.display = "none";
    if (el.btnRevertirBaja) {
      el.btnRevertirBaja.style.display = "inline-flex";
      el.btnRevertirBaja.disabled = true;
    }
  }
};

const revertirBaja = (bajaId) => {
  let bajaActiva;

  if (bajaId) {
    bajaActiva = cachedData.bajas.find(b => b.id === bajaId);
  } else {
    bajaActiva = getBajaActiva();
  }

  if (!bajaActiva) {
    alert("No hay ninguna baja activa para revertir.");
    return;
  }

  const ok = window.confirm(`¿Confirmas que el profesor ${bajaActiva.profesorBajaNombre} ha terminado su baja?`);

  if (!ok) return;

  const fechaFin = toIso(new Date());

  const bajas = getBajas();
  const updatedBajas = bajas.map(b => {
    if (b.id === bajaActiva.id) {
      return { ...b, fechaFin: fechaFin };
    }
    return b;
  });

  setBajas(updatedBajas);
  renderBajaActiva();

  alert("Baja revertida correctamente.");
};

const editarBajaHistorico = (bajaId) => {
  const bajas = getBajas();
  const baja = bajas.find(b => b.id === bajaId);
  if (!baja) return;

  const profesorBajaNombre = prompt("Profesor de baja:", baja.profesorBajaNombre);
  if (profesorBajaNombre === null) return;

  const profesorRelevistaNombre = prompt("Profesor relevista:", baja.profesorRelevistaNombre);
  if (profesorRelevistaNombre === null) return;

  const fechaInicio = prompt("Fecha inicio (YYYY-MM-DD):", baja.fechaInicio);
  if (fechaInicio === null) return;

  const fechaFin = prompt("Fecha fin (YYYY-MM-DD, dejar vacío si en curso):", baja.fechaFin || "");
  if (fechaFin === null) return;

  const updated = bajas.map(b => {
    if (b.id === bajaId) {
      return {
        ...b,
        profesorBajaNombre: profesorBajaNombre.trim() || b.profesorBajaNombre,
        profesorRelevistaNombre: profesorRelevistaNombre.trim() || b.profesorRelevistaNombre,
        fechaInicio: fechaInicio.trim() || b.fechaInicio,
        fechaFin: fechaFin.trim() || null,
      };
    }
    return b;
  });

  setBajas(updated);
  renderBajaActiva();
  mostrarHistoricoBajas();
};

const eliminarBajaHistorico = (bajaId) => {
  const bajas = getBajas();
  const baja = bajas.find(b => b.id === bajaId);
  if (!baja) return;

  const ok = confirm(`¿Estás seguro de eliminar la baja de ${baja.profesorBajaNombre}?`);
  if (!ok) return;

  const updated = bajas.filter(b => b.id !== bajaId);
  setBajas(updated);
  renderBajaActiva();
  mostrarHistoricoBajas();
};

const mostrarHistoricoBajas = () => {
  const bajas = getBajas();

  if (!el.historicoBajasBody) return;

  if (bajas.length === 0) {
    el.historicoBajasBody.innerHTML = '<tr><td colspan="6" class="empty-historico">No hay bajas registradas.</td></tr>';
  } else {
    const rows = bajas.map(b => {
      const diasDuracion = b.fechaFin
        ? Math.ceil((new Date(b.fechaFin) - new Date(b.fechaInicio)) / (1000 * 60 * 60 * 24))
        : "En curso";

      return `
        <tr>
          <td>${b.profesorBajaNombre}</td>
          <td>${b.profesorRelevistaNombre}</td>
          <td>${formatDate(new Date(b.fechaInicio))}</td>
          <td>${b.fechaFin ? formatDate(new Date(b.fechaFin)) : "En curso"}</td>
          <td>${typeof diasDuracion === 'number' ? diasDuracion + " días" : diasDuracion}</td>
          <td>
            <button class="btn btn-sm btn-edit-baja" data-id="${b.id}" title="Editar">✏️</button>
            <button class="btn btn-sm btn-danger btn-delete-baja" data-id="${b.id}" title="Eliminar">🗑️</button>
          </td>
        </tr>
      `;
    }).join("");

    el.historicoBajasBody.innerHTML = rows;

    el.historicoBajasBody.querySelectorAll('.btn-edit-baja').forEach(btn => {
      btn.addEventListener('click', () => editarBajaHistorico(btn.dataset.id));
    });
    el.historicoBajasBody.querySelectorAll('.btn-delete-baja').forEach(btn => {
      btn.addEventListener('click', () => eliminarBajaHistorico(btn.dataset.id));
    });
  }

  if (el.historicoBajasModal) {
    el.historicoBajasModal.classList.add("is-open");
    el.historicoBajasModal.setAttribute("aria-hidden", "false");
  }
};

// Migrar registros antiguos para asegurar que todos tengan IDs determinísticos
const migrateTablaIds = () => {
  const tabla = getTabla();
  let needsMigration = false;

  const migratedTabla = tabla.map((row) => {
    // Si ya tiene un ID determinístico o válido, mantenerlo
    if (row.id && row.id.startsWith('id_')) {
      return row;
    }

    needsMigration = true;
    // Generar ID determinístico
    const newId = generateDeterministicId(
      row.profesorId,
      row.diaSemana,
      row.horaInicio,
      row.horaFin,
      row.asignatura,
      row.cursoGrupo
    );

    return {
      ...row,
      id: newId,
    };
  });

  if (needsMigration) {
    console.log(`[Migration] Migrando ${tabla.length} registros a IDs determinísticos`);
    setTabla(migratedTabla);
  }
};

const init = async () => {
  try {
    loadCachedData();

    // Migrar IDs antiguos antes de sincronizar con Supabase
    migrateTablaIds();

    if (useSupabase()) {
      await supabaseSync();
    }

    // Sincronización periódica cada 30 segundos
    setInterval(async () => {
      if (useSupabase()) {
        console.log("[Sync] Sincronización periódica...");
        await supabaseSync();
      }
    }, 30000);
  } catch (error) {
    console.error("[Init] Error durante la inicialización:", error);
  }

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // Toggle sidebar on mobile
  if (el.hamburgerBtn) {
    const sidebar = document.querySelector('.sidebar');
    el.hamburgerBtn.addEventListener('click', () => {
      sidebar.classList.toggle('is-open');
    });
    // Close sidebar when clicking on overlay
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('is-open') &&
        !sidebar.contains(e.target) &&
        !el.hamburgerBtn.contains(e.target)) {
        sidebar.classList.remove('is-open');
      }
    });
  }

  initNavigation();
  initImports();
  initEvents();
  initConsejoEscolar();
  initSupabaseToggle();
  refreshHoraInicioOptions();
  refreshProfesorOptions();
  updateHoraFin();
  state.activeDate = new Date();
  state.calendarDate = new Date();
  setActiveDate(state.activeDate);
  updateStats();
  renderPrintTable();
};

const initSupabaseToggle = () => {
  const backupCard = document.querySelector('.backup-card');
  if (!backupCard) return;
  const isEnabled = useSupabase();
  const toggleBtn = document.createElement('button');
  toggleBtn.className = `btn ${isEnabled ? 'btn-danger' : 'btn-outline'}`;
  toggleBtn.id = 'btnSupabaseToggle';
  toggleBtn.textContent = isEnabled ? '☁️ Supabase ON' : '☁️ Activar Supabase';
  toggleBtn.style.marginTop = '10px';
  toggleBtn.onclick = async () => {
    const nowEnabled = !useSupabase();
    localStorage.setItem(STORAGE_KEY, nowEnabled.toString());
    if (nowEnabled) {
      // Test connection first
      const test = await supabaseFetch("profesores");
      console.log("[Supabase] Connection test:", test);
      if (test === null || (test && test.error)) {
        alert("Error conectando a Supabase. Revisa la consola.");
        return;
      }
      await supabaseSync();
    }
    toggleBtn.textContent = nowEnabled ? '☁️ Supabase ON' : '☁️ Activar Supabase';
    toggleBtn.className = `btn ${nowEnabled ? 'btn-danger' : 'btn-outline'}`;
    alert(nowEnabled ? 'Supabase activado. Abre la consola (F12) para ver logs de sincronización.' : 'Supabase desactivado. Solo modo local.');
  };
  backupCard.appendChild(toggleBtn);
};

document.addEventListener("DOMContentLoaded", init);
