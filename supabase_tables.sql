-- Tabla de Profesores
CREATE TABLE IF NOT EXISTS profesores (
  id TEXT PRIMARY KEY,
  profesor TEXT,
  puesto TEXT,
  movilAvisos TEXT,
  cuenta TEXT,
  displayName TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Materias (horario)
CREATE TABLE IF NOT EXISTS materias (
  id TEXT PRIMARY KEY,
  diaSemana TEXT,
  horaInicio TEXT,
  horaFin TEXT,
  profesorId TEXT REFERENCES profesores(id),
  profesorNombre TEXT,
  cursoGrupo TEXT,
  materia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Horario (tabla de datos)
CREATE TABLE IF NOT EXISTS tabla_horario (
  id TEXT PRIMARY KEY,
  profesorId TEXT REFERENCES profesores(id),
  profesorNombre TEXT,
  diaSemana TEXT,
  horaInicio TEXT,
  horaFin TEXT,
  asignatura TEXT,
  cursoGrupo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Sustituciones
CREATE TABLE IF NOT EXISTS sustituciones (
  id TEXT PRIMARY KEY,
  fecha TEXT,
  diaSemana TEXT,
  horaInicio TEXT,
  horaFin TEXT,
  profesorAusenteId TEXT REFERENCES profesores(id),
  profesorSustitutoId TEXT REFERENCES profesores(id),
  profesorExtraId TEXT REFERENCES profesores(id),
  cursoGrupoMateria TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (opcional, para producción)
-- ALTER TABLE profesores ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE materias ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tabla_horario ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sustituciones ENABLE ROW LEVEL SECURITY;
