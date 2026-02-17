const STORAGE_KEY = "gs_use_supabase";
const SUPABASE_URL = "https://pxpujmdlobwopqqbudwi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cHVqbWRsb2J3b3BxcWJ1ZHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTE4NjYsImV4cCI6MjA4Njc2Nzg2Nn0.f1R38JNM09UkI-2hzng5iYNUbCHq4cyjZXfngr1q64E";

const storageKeys = {
  profesores: "gs_profesores",
  materias: "gs_materias",
  tabla: "gs_tabla_sust",
  sustituciones: "gs_sustituciones",
  bajas: "gs_bajas",
};

const useSupabase = () => {
  const val = localStorage.getItem(STORAGE_KEY);
  return val === "true";
};

const supabaseFetch = async (table) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    
    // Renombrar columnas de Supabase al formato de la app
    return data.map(item => {
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
      return normalized;
    });
  } catch (e) {
    console.error("Supabase fetch error:", e);
    return [];
  }
};

const supabaseSync = async () => {
  if (!useSupabase()) return;
  console.log("[Supabase] Starting sync...");
  const tables = {
    profesores: await supabaseFetch("profesores"),
    materias: await supabaseFetch("materias"),
    tabla_horario: await supabaseFetch("tabla_horario"),
    sustituciones: await supabaseFetch("sustituciones"),
  };
  console.log("[Supabase] Fetched:", tables);

  // If Supabase has data, use it. Otherwise, upload local data
  const localProfesores = JSON.parse(localStorage.getItem(storageKeys.profesores) || "[]");
  const localMaterias = JSON.parse(localStorage.getItem(storageKeys.materias) || "[]");
  const localTabla = JSON.parse(localStorage.getItem(storageKeys.tabla) || "[]");
  const localSustituciones = JSON.parse(localStorage.getItem(storageKeys.sustituciones) || "[]");

  if (tables.profesores.length > 0) {
    setProfesores(tables.profesores);
  } else if (localProfesores.length > 0) {
    await supabaseSave("profesores", localProfesores);
    console.log("[Supabase] Uploaded local profesores");
  }
  if (tables.materias.length > 0) {
    setMaterias(tables.materias);
  } else if (localMaterias.length > 0) {
    await supabaseSave("materias", localMaterias);
  }
  if (tables.tabla_horario.length > 0) {
    setTabla(tables.tabla_horario);
  } else if (localTabla.length > 0) {
    await supabaseSave("tabla_horario", localTabla);
  }
  if (tables.sustituciones.length > 0) {
    setSustituciones(tables.sustituciones);
  } else if (localSustituciones.length > 0) {
    await supabaseSave("sustituciones", localSustituciones);
  }
  console.log("[Supabase] Sync complete");
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
  cachedData.bajas = data;
  localStorage.setItem(storageKeys.bajas, JSON.stringify(data));
};

const getBajaActiva = () => {
  return cachedData.bajas.find(b => !b.fechaFin);
};

const refreshBajaOptions = () => {
  const tabla = getTabla();
  const uniqueProfesores = [...new Map(tabla.map(t => [t.profesorId, t])).values()];
  
  const options = ['<option value="">Seleccionar profesor...</option>'];
  uniqueProfesores.forEach((t) => {
    if (t.profesorId && t.profesorNombre) {
      options.push(`<option value="${t.profesorId}">${t.profesorNombre}</option>`);
    }
  });
  
  if (el.bajaProfesorBaja) {
    el.bajaProfesorBaja.innerHTML = options.join("");
  }
  if (el.bajaProfesorRelevista) {
    el.bajaProfesorRelevista.innerHTML = options.join("");
  }
};

const renderBajaActiva = () => {
  const bajaActiva = getBajaActiva();
  
  if (bajaActiva) {
    el.bajaActive.style.display = "block";
    el.bajaActiveProfesor.textContent = bajaActiva.profesorBajaNombre;
    el.bajaActiveRelevista.textContent = bajaActiva.profesorRelevistaNombre;
    el.bajaActiveFecha.textContent = formatDate(new Date(bajaActiva.fechaInicio));
    el.btnRevertirBaja.disabled = false;
  } else {
    el.bajaActive.style.display = "none";
    el.btnRevertirBaja.disabled = true;
  }
};

const crearBaja = () => {
  const profesorBajaId = el.bajaProfesorBaja.value;
  const profesorRelevistaId = el.bajaProfesorRelevista.value;
  const fechaInicio = el.bajaFechaInicio.value;
  
  if (!profesorBajaId || !profesorRelevistaId || !fechaInicio) {
    alert("Por favor, completa todos los campos obligatorios.");
    return;
  }
  
  if (profesorBajaId === profesorRelevistaId) {
    alert("El profesor de baja no puede ser el mismo que el relevista.");
    return;
  }
  
  const bajaActiva = getBajaActiva();
  if (bajaActiva) {
    alert("Ya existe una baja activa. Por favor, revierte la baja actual primero.");
    return;
  }
  
  const tabla = getTabla();
  const profesorBaja = tabla.find(t => t.profesorId === profesorBajaId);
  const profesorRelevista = tabla.find(t => t.profesorId === profesorRelevistaId);
  
  const nuevaBaja = {
    id: generateId(),
    profesorBajaId: profesorBajaId,
    profesorBajaNombre: profesorBaja?.profesorNombre || "Desconocido",
    profesorRelevistaId: profesorRelevistaId,
    profesorRelevistaNombre: profesorRelevista?.profesorNombre || "Desconocido",
    fechaInicio: fechaInicio,
    fechaFin: null,
    createdAt: new Date().toISOString(),
  };
  
  const bajas = getBajas();
  bajas.push(nuevaBaja);
  setBajas(bajas);
  
  el.bajaProfesorBaja.value = "";
  el.bajaProfesorRelevista.value = "";
  el.bajaFechaInicio.value = "";
  
  renderBajaActiva();
  
  alert("Baja creada correctamente.");
};

const revertirBaja = () => {
  const bajaActiva = getBajaActiva();
  
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

const mostrarHistoricoBajas = () => {
  const bajas = getBajas();
  
  if (bajas.length === 0) {
    el.historicoBajasBody.innerHTML = '<tr><td colspan="5" class="empty-historico">No hay bajas registradas.</td></tr>';
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
        </tr>
      `;
    }).join("");
    
    el.historicoBajasBody.innerHTML = rows;
  }
  
  el.historicoBajasModal.classList.add("is-open");
  el.historicoBajasModal.setAttribute("aria-hidden", "false");
};

const initNavigation = () => {
  const mainHeader = document.querySelector(".main-header");
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const page = btn.dataset.page;
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
  const backupData = {
    version: "1.0",
    fecha_backup: new Date().toISOString(),
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
    backupData.storage_keys.sustituciones.length;

  alert(
    `✅ Backup creado correctamente\n\n📊 Resumen:\n• Profesores: ${backupData.storage_keys.profesores.length}\n• Materias: ${backupData.storage_keys.materias.length}\n• Tabla sustituciones: ${backupData.storage_keys.tabla.length}\n• Sustituciones: ${backupData.storage_keys.sustituciones.length}\n\nTotal: ${totalItems} registros`
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
        `⚠️ ¿Estás seguro de restaurar el backup?\n\nSe sobrescribirán todos los datos actuales.\n\n📅 Backup del: ${new Date(backupData.fecha_backup).toLocaleString("es-ES")}`
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

      refreshProfesorOptions();
      renderDashboard();
      renderCalendar();
      updateStats();
      renderPrintTable();

      alert("✅ Backup restaurado correctamente.\n\nPor favor, actualiza la página para ver todos los cambios.");
      location.reload();
    } catch (error) {
      console.error("Error al restaurar backup:", error);
      alert("❌ Error al leer el archivo. Asegúrate de que es un archivo JSON válido.");
    }
  };

  reader.readAsText(file);
};

const printAsPng = async () => {
  const printContent = document.getElementById("printView");
  if (!printContent) {
    alert("No hay contenido para imprimir.");
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

    const printWindow = window.open("", "_blank");
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
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (error) {
    console.error("Error al generar imagen:", error);
    alert("Error al generar la imagen para imprimir.");
  }

  printContent.style.width = originalWidth;
  printContent.style.position = "";
  printContent.style.left = "";
  printContent.style.top = "";
  printContent.style.zIndex = "";
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
    const date = fromIso(s.fecha);
    return date >= from && date <= to;
  });

  const totalHorasClase = 5;
  const diasLaborables = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      diasLaborables.push(new Date(d));
    }
  }

  const totalHorasPeriodo = diasLaborables.length * totalHorasClase;

  const horasConSustitucion = new Set();
  filteredSubs.forEach(s => {
    const key = `${s.fecha}-${s.horaInicio}`;
    horasConSustitucion.add(key);
  });

  const porcentajeHoras = totalHorasPeriodo > 0
    ? ((horasConSustitucion.size / totalHorasPeriodo) * 100).toFixed(1)
    : 0;

  document.getElementById("consejoHorasSustitucion").textContent = `${porcentajeHoras}%`;
  document.getElementById("consejoHorasDetail").textContent = `${horasConSustitucion.size} / ${totalHorasPeriodo} horas`;

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

const init = async () => {
  loadCachedData();
  if (useSupabase()) {
    await supabaseSync();
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
