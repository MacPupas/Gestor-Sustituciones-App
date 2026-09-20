import fs from 'fs';

function hashId(s){let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i)|0;}return Math.abs(h).toString(36).slice(0,8);}
const URL = 'https://pxpujmdlobwopqqbudwi.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cHVqbWRsb2J3b3BxcWJ1ZHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTE4NjYsImV4cCI6MjA4Njc2Nzg2Nn0.f1R38JNM09UkI-2hzng5iYNUbCHq4cyjZXfngr1q64E';

async function fetchRest(table, method, body, deleteAll = false) {
  let url = URL + '/rest/v1/' + table; if (deleteAll) url += '?id=neq.'; const opts = { method, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 204) console.error('Error', table, res.status, await res.text());
  return res;
}

const raw = fs.readFileSync('materias_por_profesores.csv', 'utf8');
const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
const header = lines[0].split(';').map(s => s.trim());
const rows = [];
for (let i = 1; i < lines.length; i++) {
  const cells = lines[i].split(';');
  const obj = {};
  for (let j = 0; j < header.length; j++) obj[header[j]] = (cells[j] || '').trim();
  rows.push(obj);
}

// Borrar todo
await fetchRest('profesores', 'DELETE', null, true);
await fetchRest('tabla_horario', 'DELETE', null, true);

const profesores = new Map();
const horario = [];

for (const r of rows) {
  const prof = (r['Profesor'] || '').trim();
  if (prof && !profesores.has(prof)) {
    profesores.set(prof, hashId(prof));
  }
  if (prof) {
    horario.push({
      id: hashId(prof + '|' + (r['Día']||'').trim().toLowerCase() + '|' + (r['Hora Inicio']||'').trim() + '|' + (r['Hora Fin']||'').trim() + '|' + (r['Asignatura']||'').trim()),
      profesorid: profesores.get(prof),
      profesornombre: prof,
      diasemana: (r['Día'] || '').trim().toLowerCase(),
      horainicio: (r['Hora Inicio'] || '').trim(),
      horafin: (r['Hora Fin'] || '').trim(),
      asignatura: (r['Asignatura'] || '').trim(),
      // cursoGrupo: (r['Curso/Grupo'] || '').trim()
    });
  }
}

// Insertar profesores
for (const [prof, id] of profesores) {
  await fetchRest('profesores', 'POST', { id, profesor: prof, puesto: 'Profesor/a', movilavisos: '', cuenta: '' });
}

// Insertar horario por batches de 50
for (let i = 0; i < horario.length; i += 50) {
  const batch = horario.slice(i, i + 50);
  await fetchRest('tabla_horario', 'POST', batch);
}

console.log('Actualizado:', profesores.size, 'profesores,', horario.length, 'horarios');
