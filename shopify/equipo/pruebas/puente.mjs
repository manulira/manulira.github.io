// Puente entre el navegador de pruebas y un Postgres de pruebas (psql), para probar la interfaz del equipo
// de punta a punta: pantalla → adaptador (assets/sepia-equipo-api.js) → funciones y reglas de la base de datos.
// Las llamadas llegan con la sesión de quien las hace (como Supabase: el rol «authenticated» y los claims del
// token), así que las reglas de seguridad de la fila (RLS) se aplican de verdad.
//
// Necesita `psql` y un servidor Postgres de pruebas: PGHOST, PGPORT y PGUSER (con permisos para crear bases).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BARISTAS = path.join(AQUI, '..', '..', 'baristas');

const lit = v => v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : Array.isArray(v) ? lit('{' + v.map(x => '"' + String(x).replace(/(["\\])/g, '\\$1') + '"').join(',') + '}')
  : typeof v === 'object' ? lit(JSON.stringify(v)) : "'" + String(v).replace(/'/g, "''") + "'";
const ident = s => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('nombre no permitido: ' + s); return s; };

export class Puente {
  constructor() { this.db = 'eq_ui_' + process.pid; this.tipos = {}; }

  psql(texto, db = this.db, args = []) {
    const r = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', db, ...args],
      { input: texto, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { ok: r.status === 0, salida: r.stdout || '', error: r.stderr || '' };
  }

  crear(extra = '') {
    const c = this.psql('create database ' + this.db, 'postgres');
    if (!c.ok) throw new Error('No se pudo crear la base de pruebas: ' + c.error);
    for (const f of [path.join(BARISTAS, 'pruebas', 'shim-supabase.sql'), path.join(BARISTAS, 'esquema.sql'), path.join(BARISTAS, 'equipo.sql')]) {
      const r = this.psql('', this.db, ['-f', f]);
      if (!r.ok) throw new Error('Falló ' + path.basename(f) + ': ' + r.error);
    }
    if (extra) { const r = this.psql(extra); if (!r.ok) throw new Error('Falló la preparación: ' + r.error); }
  }

  borrar() { this.psql('drop database if exists ' + this.db, 'postgres'); }

  /* Ejecuta como la sesión dada (claims del token) y devuelve el valor que imprime el último select «@@…». */
  como(claims, cuerpo) {
    const preparar = claims
      ? `select set_config('request.jwt.claims', ${lit(JSON.stringify(claims))}, true); set local role authenticated;`
      : 'set local role anon;';
    const r = this.psql(`begin; ${preparar} ${cuerpo}; commit;`);
    if (!r.ok) {
      const m = /ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(r.error);
      return { error: { code: m ? m[1] : 'XX000', message: m ? m[2] : r.error.trim() } };
    }
    const linea = r.salida.split('\n').find(l => l.startsWith('@@'));
    return { data: linea === undefined ? null : JSON.parse(linea.slice(2)) };
  }

  tipoRetorno(nombre) {
    if (!(nombre in this.tipos)) {
      this.tipos[nombre] = this.psql(`select prorettype::regtype::text from pg_proc where pronamespace = 'public'::regnamespace and proname = ${lit(nombre)} limit 1`).salida.trim();
    }
    return this.tipos[nombre];
  }

  rpc(claims, nombre, args) {
    ident(nombre);
    const lista = Object.entries(args || {}).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(', ');
    const llamada = `public.${nombre}(${lista})`;
    if (this.tipoRetorno(nombre) === 'void') {
      const r = this.como(claims, `select ${llamada}`);
      return r.error ? r : { data: null };
    }
    return this.como(claims, `select '@@' || coalesce(to_jsonb(${llamada})::text, 'null')`);
  }

  tabla(claims, { tabla, op, columnas, valores, filtros, devolver }) {
    ident(tabla);
    const donde = (filtros || []).map(([c, v]) => `${ident(c)} = ${lit(v)}`).join(' and ') || 'true';
    const cols = (columnas || '*').split(',').map(c => c.trim()).map(c => c === '*' ? '*' : ident(c)).join(', ');
    if (op === 'select') {
      return this.como(claims, `select '@@' || coalesce((select jsonb_agg(to_jsonb(t)) from (select ${cols} from public.${tabla} where ${donde}) t)::text, '[]')`);
    }
    if (op === 'update') {
      const sets = Object.entries(valores).map(([c, v]) => `${ident(c)} = ${lit(v)}`).join(', ');
      const dev = (devolver || 'id').split(',').map(c => ident(c.trim())).join(', ');
      return this.como(claims, `with u as (update public.${tabla} set ${sets} where ${donde} returning ${dev}) select '@@' || coalesce((select jsonb_agg(to_jsonb(u)) from u)::text, '[]')`);
    }
    throw new Error('operación no permitida: ' + op);
  }

  objeto(claims, { op, bucket, nombres }) {
    if (op === 'insert') {
      return this.como(claims, `insert into storage.objects (bucket_id, name, owner) values (${lit(bucket)}, ${lit(nombres[0])}, auth.uid()); select '@@null'`);
    }
    if (op === 'select') {
      return this.como(claims, `select '@@' || coalesce((select jsonb_agg(name) from storage.objects where bucket_id = ${lit(bucket)} and name = any(${lit(nombres)}::text[]))::text, '[]')`);
    }
    if (op === 'delete') {
      return this.como(claims, `with d as (delete from storage.objects where bucket_id = ${lit(bucket)} and name = any(${lit(nombres)}::text[]) returning name) select '@@' || coalesce((select jsonb_agg(name) from d)::text, '[]')`);
    }
    throw new Error('operación no permitida: ' + op);
  }

  /* «GoTrue»: entrar con correo y clave, y cambiar la clave. */
  entrar(correo, clave) {
    const r = this.psql(`select id || '|' || email from auth.users where lower(email) = lower(${lit(correo)}) and encrypted_password = extensions.crypt(${lit(clave)}, encrypted_password) and (banned_until is null or banned_until < now())`);
    const t = r.salida.trim();
    if (!t) return { error: { message: 'Invalid login credentials' } };
    const [id, email] = t.split('|');
    return { data: { id, email } };
  }
  /* «GoTrue», código por correo: solo a correos que ya tienen cuenta (shouldCreateUser: false). El código de las pruebas es fijo. */
  pedirCodigo(correo) {
    const r = this.psql(`select id from auth.users where lower(email) = lower(${lit(correo)})`);
    if (!r.salida.trim()) return { error: { message: 'Signups not allowed for otp' } };
    return { data: null };
  }
  verificarCodigo(correo, token) {
    if (token !== '12345678') return { error: { message: 'Token has expired or is invalid' } };
    const r = this.psql(`select id || '|' || email from auth.users where lower(email) = lower(${lit(correo)})`);
    const t = r.salida.trim();
    if (!t) return { error: { message: 'Token has expired or is invalid' } };
    const [id, email] = t.split('|');
    return { data: { id, email } };
  }
  cambiarClave(id, clave) {
    if (String(clave).length < 6) return { error: { message: 'Password should be at least 6 characters' } };
    const r = this.psql(`update auth.users set encrypted_password = extensions.crypt(${lit(clave)}, extensions.gen_salt('bf')) where id = ${lit(id)}`);
    return r.ok ? { data: null } : { error: { message: r.error } };
  }

  consulta(texto) { return this.psql(texto).salida.trim(); }
}

export const leer = f => fs.readFileSync(f, 'utf8');
