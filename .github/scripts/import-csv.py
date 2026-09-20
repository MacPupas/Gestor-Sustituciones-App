#!/usr/bin/env python3
import csv, sys, hashlib, os

def make_id(s):
    return hashlib.md5(str(s).encode()).hexdigest()[:16]

csv_path = "materias_por_profesores.csv"
if not os.path.exists(csv_path):
    sys.exit(0)

profesores = {}
filas = []
with open(csv_path, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter=";")
    for row in reader:
        prof = (row.get("Profesor") or "").strip()
        dia = (row.get("Día") or "").strip().lower()
        ini = (row.get("Hora Inicio") or "").strip()
        fin = (row.get("Hora Fin") or "").strip()
        asig = (row.get("Asignatura") or "").strip()
        curso = (row.get("Curso/Grupo") or "").strip()
        if prof:
            prof_id = make_id(prof)
            profesores[prof] = prof_id
            filas.append({
                "profesor": prof,
                "profesorId": prof_id,
                "diaSemana": dia,
                "horaInicio": ini,
                "horaFin": fin,
                "asignatura": asig,
                "cursoGrupo": curso
            })

with open(".supabase_update.sql", "w") as out:
    out.write("BEGIN;\n")
    out.write("DELETE FROM tabla_horario;\n")
    out.write("DELETE FROM profesores;\n")
    for p in sorted(profesores):
        pid = profesores[p]
        safe_p = p.replace("'", "''")
        out.write(f"INSERT INTO profesores (id, profesor, puesto, movilAvisos, cuenta) VALUES ('{pid}', '{safe_p}', 'Profesor/a', '', '');\n")
    for fila in filas:
        rid = make_id(f"{fila['profesorId']}|{fila['diaSemana']}|{fila['horaInicio']}|{fila['horaFin']}|{fila['asignatura']}|{fila['cursoGrupo']}")
        safe_prof = fila['profesor'].replace("'", "''")
        safe_asig = fila['asignatura'].replace("'", "''")
        safe_curso = fila['cursoGrupo'].replace("'", "''")
        out.write(f"INSERT INTO tabla_horario (id, profesorId, profesorNombre, diaSemana, horaInicio, horaFin, asignatura, cursoGrupo) VALUES ('{rid}', '{fila['profesorId']}', '{safe_prof}', '{fila['diaSemana']}', '{fila['horaInicio']}', '{fila['horaFin']}', '{safe_asig}', '{safe_curso}');\n")
    out.write("COMMIT;\n")
