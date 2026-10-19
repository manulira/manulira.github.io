// Carga Codigo.gs en Node con simulaciones de los servicios de Google (CalendarApp, MailApp,
// UrlFetchApp, PropertiesService…) para probar el script sin Apps Script.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));

function partesEnZona(ms, zona) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}

function formatDate(d, zona, patron) {
  const p = partesEnZona(d.getTime(), zona);
  return patron
    .replace(/yyyy/g, p.year).replace(/MM/g, p.month).replace(/dd/g, p.day)
    .replace(/HH/g, p.hour).replace(/mm/g, p.minute).replace(/ss/g, p.second)
    .replace(/'T'/g, 'T').replace(/'Z'/g, 'Z');
}

function parseDate(texto, zona) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(texto);
  const adivinado = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const p = partesEnZona(adivinado, zona);
  const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(adivinado - (visto - adivinado));
}

/**
 * opciones:
 *   propiedades   {clave: valor} de las Script properties
 *   eventos       eventos del calendario en el formato simple de la prueba (ver eventoGoogle)
 *   fetch         (url, opciones) => {codigo, cuerpo}  (simula UrlFetchApp)
 *   cuotaCorreo   correos que quedan hoy (por defecto 1000)
 */
export function cargar(opciones = {}) {
  const registro = { logs: [], correos: [], fetch: [], triggers: [] };
  // Reloj simulado: reloj.ahora (ms) manda en `new Date()` y Date.now() dentro del script.
  const reloj = opciones.reloj || { ahora: null };
  const DateReal = Date;
  class FechaSimulada extends DateReal {
    constructor(...a) { if (a.length === 0 && reloj.ahora != null) super(reloj.ahora); else super(...a); }
    static now() { return reloj.ahora != null ? reloj.ahora : DateReal.now(); }
  }
  const props = { ...(opciones.propiedades || {}) };
  const sandbox = {
    console, Date: FechaSimulada,
    Logger: { log: (s) => registro.logs.push(String(s)) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
      }),
    },
    Utilities: { formatDate, parseDate },
    UrlFetchApp: {
      fetch: (url, o) => {
        registro.fetch.push({ url, payload: o && o.payload ? JSON.parse(o.payload) : null, headers: o && o.headers });
        const r = opciones.fetch ? opciones.fetch(url, o) : { codigo: 200, cuerpo: 'null' };
        return { getResponseCode: () => r.codigo, getContentText: () => r.cuerpo };
      },
    },
    MailApp: {
      sendEmail: (o) => {
        if (opciones.fallaCorreoA && String(o.subject).includes(opciones.fallaCorreoA)) throw new Error('Simulación: correo rechazado');
        registro.correos.push(o);
      },
      getRemainingDailyQuota: () => (opciones.cuotaCorreo == null ? 1000 : opciones.cuotaCorreo),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dueno@ejemplo.test' }) },
    ScriptApp: {
      getProjectTriggers: () => registro.triggers.slice(),
      deleteTrigger: (t) => { registro.triggers.splice(registro.triggers.indexOf(t), 1); },
      newTrigger: (f) => {
        const t = { getHandlerFunction: () => f, cuando: [] };
        const b = {
          timeBased: () => b, everyDays: (n) => { t.cuando.push('dias' + n); return b; },
          atHour: (h) => { t.cuando.push('hora' + h); return b; }, everyHours: (n) => { t.cuando.push('cada' + n + 'h'); return b; },
          create: () => { registro.triggers.push(t); return t; },
        };
        return b;
      },
    },
    CalendarApp: {
      GuestStatus: { NO: 'NO', YES: 'YES' },
      getDefaultCalendar: () => calendario(opciones.eventos || []),
      getCalendarById: (id) => (id === 'no-existe' ? null : calendario(opciones.eventos || [])),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(AQUI, '..', 'Codigo.gs'), 'utf8'), sandbox, { filename: 'Codigo.gs' });
  return { ctx: sandbox, registro, props, reloj };
}

function calendario(eventos) {
  return {
    getEvents: (desde, hasta) => eventos
      .filter((e) => new Date(e.fin) > desde && new Date(e.inicio) < hasta)
      .map((e) => ({
        getId: () => e.id, getTitle: () => e.titulo, getDescription: () => e.descripcion || '', getLocation: () => e.lugar || '',
        getStartTime: () => new Date(e.inicio), getEndTime: () => new Date(e.fin),
        isAllDayEvent: () => !!e.todoElDia, isRecurringEvent: () => !!e.recurrente,
        getMyStatus: () => e.estado || 'OWNER',
      })),
  };
}

// Atajo para armar un evento «de Google» a partir de la hora de Santiago (verano: UTC-3).
export function eventoGoogle({ id, titulo, descripcion, lugar, ini, fin, ...resto }) {
  return { id, titulo, descripcion, lugar, inicio: ini + ':00-03:00', fin: fin + ':00-03:00', ...resto };
}
