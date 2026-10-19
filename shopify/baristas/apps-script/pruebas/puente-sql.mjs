// Puente para las pruebas de integración: en vez de PostgREST + Supabase, las llamadas del
// script (rpc/<función>) se ejecutan en un Postgres de pruebas con el esquema real, como el
// rol «anon». Necesita PGHOST/PGPORT/PGUSER (los de psql) y las pruebas se saltan sin ellos.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BARISTAS = join(AQUI, '..', '..');

export const hayPostgres = () => {
  if (!process.env.PGHOST) return false;
  try { execFileSync('psql', ['-X', '-q', '-At', '-d', 'postgres', '-c', 'select 1'], { stdio: 'pipe' }); return true; } catch { return false; }
};

const TIPOS = { secreto: 'text', eventos: 'jsonb', claves: 'jsonb', desde: 'date', hasta: 'date', ahora: 'timestamptz' };

function psql(db, args, env = {}) {
  return execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } });
}

export function crearBase() {
  const db = 'as_' + process.pid + '_' + Math.floor(Math.random() * 1e6);
  psql('postgres', ['-c', `create database ${db}`]);
  psql(db, ['-f', join(BARISTAS, 'pruebas', 'shim-supabase.sql')]);
  psql(db, ['-f', join(BARISTAS, 'esquema.sql')]);
  return {
    db,
    sql: (texto) => psql(db, ['-c', texto]),
    consulta: (texto) => psql(db, ['-c', texto]).trim(),
    borrar: () => { try { psql('postgres', ['-c', `drop database if exists ${db}`]); } catch { /* ya no estaba */ } },
    // Lo que haría PostgREST con POST /rest/v1/rpc/<nombre> y la clave pública (rol anon).
    fetch: (reloj) => (url, o) => {
      const nombre = /\/rest\/v1\/rpc\/(\w+)$/.exec(url)[1];
      const args = JSON.parse(o.payload);
      if (reloj && reloj.ahora != null && !('ahora' in args)) args.ahora = new Date(reloj.ahora).toISOString();
      const lista = Object.entries(args).map(([k, v]) => {
        const tipo = TIPOS[k];
        if (!tipo) throw new Error('Argumento desconocido en la prueba: ' + k);
        const lit = tipo === 'jsonb' ? JSON.stringify(v) : String(v);
        if (lit.includes('$arg$')) throw new Error('Texto no permitido');
        return `${k} => $arg$${lit}$arg$::${tipo}`;
      }).join(', ');
      try {
        const salida = psql(db, ['-c', `select to_jsonb(public.${nombre}(${lista}))`], { PGOPTIONS: '-c role=anon' }).trim();
        return { codigo: 200, cuerpo: salida === '' || salida === 'null' ? 'null' : salida };
      } catch (e) {
        return { codigo: 400, cuerpo: JSON.stringify({ message: String(e.stderr || e.message).trim().split('\n')[0] }) };
      }
    },
  };
}
