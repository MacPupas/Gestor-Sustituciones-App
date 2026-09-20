import fs from 'fs';
import csv from 'csv-parse/sync';

const URL = 'https://pxpujmdlobwopqqbudwi.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cHVqbWRsb2J3b3BxcWJ1ZHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTE4NjYsImV4cCI6MjA4Njc2Nzg2Nn0.f1R38JNM09UkI-2hzng5iYNUbCHq4cyjZXfngr1q64E';

async function fetchRest(table, method, body) {
  const opts = { method, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${URL}/rest/v1/${table}`, opts);
  if (!res.ok && res.status !== 204) console.error('Error', table, res.status, await res.text());
  return res;
}

const data = fs.readFileSync('materias_por_profesores.csv', 'utf8');
const rows = csv.parse(data, { delimiter: ';', columns: true, skip_empty_lines: true });

// Borrar todo
await fetchRest('profesores', 'DELETE', null);
await fetchRest('tabla_horario', 'DELETE', null);

const profesores = new Map();
const horario = [];

for (const r of rows) {
  const prof = (r['Profesor'] || '').trim();
  if (prof && !profesores.has(prof)) {
    profesores.set(prof, Math.random().toString(36).slice(2, 10));
  }
  if (prof) {
    horario.push({
      id: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6),
      profesorId: profesores.get(prof),
      profesorNombre: prof,
      diaSemana: (r['Día'] || '').trim().toLowerCase(),
      horaInicio: (r['Hora Inicio'] || '').trim(),
      horaFin: (r['Hora Fin'] || '').trim(),
      asignatura: (r['Asignatura'] || '').trim(),
      cursoGrupo: (r['Curso/Grupo'] || '').trim()
    });
  }
}

// Insertar profesores
for (const [prof, id] of profesores) {
  await fetchRest('profesores', 'POST', { id, profesor: prof, puesto: 'Profesor/a', movilAvisos: '', cuenta: '' });
}

// Insertar horario por batches de 50
for (let i = 0; i < horario.length; i += 50) {
  const batch = horario.slice(i, i + 50);
  await fetchRest('tabla_horario', 'POST', batch);
}

console.log('Actualizado:', profesores.size, 'profesores,', horario.length, 'horarios');
