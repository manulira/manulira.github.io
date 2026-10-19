/**
 * SEPIA COFFEE · automatización del portal de baristas
 *
 * Hace dos cosas, con la cuenta de Google de la administración:
 *   1. Lee el calendario, y los eventos de servicio los publica en el portal para que los
 *      baristas se inscriban (sincronizarCalendario, una vez al día).
 *   2. Manda los correos de seguimiento: reconfirmar a los 7, 6 y 5 días, avisar de una
 *      vacante, estado de la semana, grupo de WhatsApp, boleta y pago (enviarNotificaciones,
 *      cada hora).
 *
 * Qué correo toca mandar, a quién y cuándo lo decide la base de datos (Supabase, función
 * calcular_notificaciones en esquema.sql). Este script solo lee el calendario, pregunta qué
 * toca, manda los correos y anota cuáles mandó. La instalación está en LEEME.md, sección
 * «Etapa 2». No pongas claves en este archivo: van en Project Settings → Script properties.
 *
 * Ajustes (Script properties):
 *   SUPABASE_URL    https://xxxx.supabase.co
 *   SUPABASE_KEY    la clave pública (sb_publishable_…) del proyecto
 *   SECRETO         la clave larga que guardaste en la base con secreto_hash
 *   MODO_PRUEBA     «si» (por defecto) manda TODO a EMAIL_PRUEBA y no marca nada como
 *                   enviado. Pásalo a «no» para que los correos salgan de verdad.
 *   EMAIL_PRUEBA    tu correo, para el modo de prueba
 *   PORTAL_URL      (opcional) https://sepiacoffee.cl/pages/baristas
 *   CALENDARIO_ID   (opcional) el calendario a leer; vacío = el principal de esta cuenta
 *   ADMIN_EMAIL     (opcional) a quién llegan el resumen de la sincronización y los errores;
 *                   vacío = la cuenta dueña del script
 *   TURNOS_FIJOS    (opcional) eventos que se parten en turnos, en JSON. Ver LEEME.md
 *   ALIAS_LUGARES   (opcional) lugares que no dicen su comuna, en JSON. Ver LEEME.md
 */

// ---------------------------------------------------------------------------
// Reglas editables
// ---------------------------------------------------------------------------

const ZONA = 'America/Santiago';
const DIAS_HACIA_ADELANTE = 365;     // cuánto calendario se lee y se publica
const MINIMO_BARISTAS = 2;           // nunca menos que esto por evento
const BARISTAS_CAFE_Y_MARTINI = 3;   // mínimo si el servicio lleva café y martini
const NOTA_HORARIO = 'Horario completo del evento: incluye armado y retiro del equipo.';

// Qué eventos del calendario son servicios con baristas. Se mira el título.
//  · excluir gana siempre. Un evento con #sinbaristas en el título o la descripción tampoco entra.
//  · incluir: «Servicio …», cualquiera con 🍸, o con #barista en el título o la descripción.
const REGLAS = {
  excluir: [/^\s*(reuni[oó]n|pagar)\b/i, /cancelad[oa]|anulad[oa]/i],
  incluir: [/^\s*servicio\b/i, /🍸/],
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const COMUNAS = [
  'Alhué', 'Buin', 'Calera de Tango', 'Cerrillos', 'Cerro Navia', 'Colina', 'Conchalí', 'Curacaví', 'El Bosque',
  'El Monte', 'Estación Central', 'Huechuraba', 'Independencia', 'Isla de Maipo', 'La Cisterna', 'La Florida',
  'La Granja', 'La Pintana', 'La Reina', 'Lampa', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul',
  'Maipú', 'María Pinto', 'Melipilla', 'Ñuñoa', 'Padre Hurtado', 'Paine', 'Pedro Aguirre Cerda', 'Peñaflor',
  'Peñalolén', 'Pirque', 'Providencia', 'Pudahuel', 'Puente Alto', 'Quilicura', 'Quinta Normal', 'Recoleta',
  'Renca', 'San Bernardo', 'San Joaquín', 'San José de Maipo', 'San Miguel', 'San Ramón', 'Santiago', 'Talagante',
  'Tiltil', 'Vitacura',
  'Valparaíso', 'Viña del Mar', 'Concón', 'Quintero', 'Puchuncaví', 'Zapallar', 'Papudo', 'Quilpué', 'Villa Alemana',
  'Limache', 'Olmué', 'Casablanca', 'Algarrobo', 'El Quisco', 'El Tabo', 'Cartagena', 'San Antonio', 'Santo Domingo',
  'Quillota', 'La Calera', 'Los Andes', 'San Felipe',
  'Rancagua', 'Machalí', 'Santa Cruz', 'Pichilemu',
];
// Localidades que no son comuna y a cuál pertenecen.
const ALIAS_BASE = { 'horcon': 'Puchuncaví', 'chicureo': 'Colina', 'cajon del maipo': 'San José de Maipo' };

// ---------------------------------------------------------------------------
// Utilidades de texto y fechas (sin Google: se prueban en Node)
// ---------------------------------------------------------------------------

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function sinAcentos_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// La descripción de Google Calendar puede venir con HTML (<br>, <b>, &nbsp;…).
function limpiarTexto_(s) {
  return String(s == null ? '' : s)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function pesos_(n) {
  if (n == null || isNaN(Number(n))) return '';
  return '$' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function porcentaje_(r) {
  return String(Math.round(Number(r) * 10000) / 100).replace('.', ',') + ' %';
}

function partesFecha_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return { a: +m[1], m: +m[2], d: +m[3] };
}

function fechaLarga_(iso) {
  const p = partesFecha_(iso);
  if (!p) return String(iso || '');
  const dow = new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay();
  return DIAS_SEMANA[dow] + ' ' + p.d + ' de ' + MESES[p.m - 1];
}

function fechaCorta_(iso) {
  const p = partesFecha_(iso);
  if (!p) return String(iso || '');
  const dow = new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay();
  return DIAS_SEMANA[dow].slice(0, 3) + ' ' + p.d + '/' + p.m;
}

function horario_(ini, fin) {
  return ini && fin ? ini + ' a ' + fin : '';
}

function primerNombre_(n) {
  return String(n || '').trim().split(/\s+/)[0] || '';
}

function telefonoWa_(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  return d;
}

function sumarMinutos_(hora, minutos) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora);
  const total = ((+m[1] * 60 + +m[2] + minutos) % 1440 + 1440) % 1440;
  return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
}

function minutosEntre_(fechaIni, horaIni, fechaFin, horaFin) {
  const a = partesFecha_(fechaIni), b = partesFecha_(fechaFin);
  const hi = /^(\d{1,2}):(\d{2})/.exec(horaIni), hf = /^(\d{1,2}):(\d{2})/.exec(horaFin);
  const t1 = Date.UTC(a.a, a.m - 1, a.d, +hi[1], +hi[2]);
  const t2 = Date.UTC(b.a, b.m - 1, b.d, +hf[1], +hf[2]);
  return Math.round((t2 - t1) / 60000);
}

function json_(texto, defecto) {
  try { return texto ? JSON.parse(texto) : defecto; } catch (e) { return defecto; }
}

// ---------------------------------------------------------------------------
// 1. Calendario → eventos del portal
// ---------------------------------------------------------------------------

// Una línea «Etiqueta: valor» de la descripción (acepta emojis delante de la etiqueta).
function extraerLinea_(texto, etiquetas) {
  for (let i = 0; i < etiquetas.length; i++) {
    const m = new RegExp('(?:^|\\n)[^\\n:]{0,14}?' + etiquetas[i] + '\\s*:\\s*([^\\n]+)', 'i').exec(texto);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

// Busca la comuna en los textos. Gana la que aparece más a la derecha («Casona X, Pirque» → Pirque).
function extraerComuna_(textos, alias) {
  const claves = [];
  COMUNAS.forEach(function (c) { claves.push({ k: sinAcentos_(c), comuna: c }); });
  const todos = Object.assign({}, ALIAS_BASE, alias || {});
  Object.keys(todos).forEach(function (k) { claves.push({ k: sinAcentos_(k), comuna: todos[k] }); });
  for (let t = 0; t < textos.length; t++) {
    const txt = sinAcentos_(textos[t]);
    if (!txt) continue;
    let mejor = null;
    claves.forEach(function (c) {
      const re = new RegExp('(^|[^a-z0-9])(' + c.k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![a-z0-9])', 'g');
      let m;
      while ((m = re.exec(txt)) !== null) {
        const fin = m.index + m[0].length;
        if (!mejor || fin > mejor.fin || (fin === mejor.fin && c.k.length > mejor.largo)) mejor = { fin: fin, largo: c.k.length, comuna: c.comuna };
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
    if (mejor) return mejor.comuna;
  }
  return '';
}

function limpiarCliente_(s) {
  return String(s || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu, ' ')
    .replace(/\s+[-–—]?\s*(\$?\d[\d.,]*\s*%?|pagad[oa]|abonad[oa]|no pagad[oa]|reserva)\b.*$/i, '')
    .replace(/\s+/g, ' ').trim();
}

function extraerCliente_(titulo, texto) {
  let c = extraerLinea_(texto, ['Nombre completo', 'Nombre', 'Cliente']);
  if (!c) {
    const partes = String(titulo || '').split(/\s+[-–—]\s+/);
    c = partes.length >= 2 ? partes[1] : String(titulo || '');
  }
  return limpiarCliente_(c).slice(0, 120);
}

function extraerServicios_(texto) {
  let s = extraerLinea_(texto, ['Servicios', 'Servicio']);
  if (!s && texto.indexOf(' | ') >= 0) s = texto.split('|')[0].trim();
  if (!s || /[$@]|\d{6,}/.test(s) || s.length > 140) return '';
  return s.replace(/\s+/g, ' ');
}

function extraerBaristas_(texto) {
  let m = /baristas?\s*[:=]\s*(\d{1,2})\b/i.exec(texto) || /\b(\d{1,2})\s*baristas?\b/i.exec(texto);
  return m ? +m[1] : null;
}

function llevaCafeYMartini_(servicios) {
  const s = sinAcentos_(servicios).replace(/sin cafe/g, '');
  return /\bcafe/.test(s) && /martini|carajillo/.test(s);
}

function nombrePublico_(lugar, comuna) {
  const corto = String(lugar || '').split(/\s*[,–—]\s*|\s+-\s+/)[0].trim().slice(0, 60);
  return 'Servicio de barra · ' + (corto || (comuna && comuna !== 'Por confirmar' ? comuna : 'Por confirmar'));
}

function idEvento_(e) {
  return e.recurrente ? e.id + '|' + e.inicio.fecha + 'T' + e.inicio.hora : e.id;
}

/**
 * Convierte los eventos del calendario (objetos simples, ver leerEventos_) en lo que recibe la
 * base de datos. Devuelve {eventos, ignorados, problemas}.
 *   ajustes.turnosFijos: [{patron, nombre, lugar, comuna, cliente, turnos:[{horas, pago, baristas}]}]
 *   ajustes.alias: {texto del lugar: comuna}
 */
function interpretar_(crudos, ajustes, desdeISO) {
  const eventos = [], ignorados = [], problemas = [];
  const turnosFijos = (ajustes && ajustes.turnosFijos) || [];
  const alias = (ajustes && ajustes.alias) || {};

  crudos.forEach(function (e) {
    const titulo = limpiarTexto_(e.titulo);
    const texto = limpiarTexto_(e.descripcion);
    const marcas = titulo + '\n' + texto;
    if (e.todoElDia || e.rechazado) return;
    if (e.inicio.fecha < desdeISO) return;
    if (REGLAS.excluir.some(function (r) { return r.test(titulo); }) || /#sinbaristas\b/i.test(marcas)) return;

    const fijo = turnosFijos.filter(function (t) { return t && t.patron && new RegExp(t.patron, 'i').test(titulo); })[0];
    const esServicio = REGLAS.incluir.some(function (r) { return r.test(titulo); }) || /#barista\b/i.test(marcas);
    if (!fijo && !esServicio) {
      const minutos = minutosEntre_(e.inicio.fecha, e.inicio.hora, e.fin.fecha, e.fin.hora);
      if (e.lugar || minutos >= 120) ignorados.push({ id: idEvento_(e), titulo: titulo, fecha: e.inicio.fecha });
      return;
    }

    const minutos = minutosEntre_(e.inicio.fecha, e.inicio.hora, e.fin.fecha, e.fin.hora);
    if (minutos <= 0) { problemas.push('«' + titulo + '» (' + e.inicio.fecha + '): el fin no es posterior al inicio.'); return; }
    if (minutos > 24 * 60) { problemas.push('«' + titulo + '» (' + e.inicio.fecha + '): dura más de un día; no se publicó.'); return; }

    const gid = idEvento_(e);
    if (fijo) {
      (fijo.turnos || []).forEach(function (t) {
        eventos.push({
          gcal_id: gid + '#' + t.horas + 'h',
          nombre: String(fijo.nombre || titulo).slice(0, 100) + ' · turno de ' + t.horas + ' horas',
          fecha: e.inicio.fecha, hora_inicio: e.inicio.hora, hora_fin: sumarMinutos_(e.inicio.hora, Math.round(t.horas * 60)),
          lugar: fijo.lugar || null, comuna: fijo.comuna || null,
          descripcion: 'Turno de ' + t.horas + ' horas dentro del evento de ' + e.inicio.hora + ' a ' + e.fin.hora + '. El horario exacto se confirma antes de la fecha.',
          baristas: t.baristas || 1, pago_manual: t.pago == null ? null : t.pago,
          cliente: fijo.cliente || fijo.nombre || null, revisar: false, revisar_motivo: null,
        });
      });
      return;
    }

    const lugar = (e.lugar && limpiarTexto_(e.lugar)) || extraerLinea_(texto, ['Lugar exacto', 'Lugar']) || '';
    // Nunca se mira el título: el nombre de una persona puede ser también el de una comuna.
    const comuna = extraerComuna_([lugar, extraerLinea_(texto, ['Lugar exacto']), extraerLinea_(texto, ['Comuna']), extraerLinea_(texto, ['Lugar'])], alias);
    const servicios = extraerServicios_(texto);
    const explicitos = extraerBaristas_(texto);
    // Café y martini llevan al menos 3; el resto, al menos 2. Si el calendario dice más, se respeta.
    const minimo = llevaCafeYMartini_(servicios) ? BARISTAS_CAFE_Y_MARTINI : MINIMO_BARISTAS;
    const baristas = Math.min(Math.max(explicitos != null ? explicitos : minimo, minimo), 12);

    const motivos = [];
    if (!lugar) motivos.push('Falta el lugar en el calendario');
    if (!comuna) motivos.push('No se reconoció la comuna');
    if (explicitos == null) motivos.push('No dice cuántos baristas: se supuso ' + baristas);
    if (explicitos != null && explicitos < minimo) motivos.push('Decía ' + explicitos + (explicitos === 1 ? ' barista' : ' baristas') + ': se puso el mínimo de ' + minimo);
    if (/por confirmar/i.test(extraerLinea_(texto, ['Hora', 'Horario'])) || /hora por confirmar|horario por confirmar/i.test(texto)) motivos.push('El horario está por confirmar');
    if (minutos > 12 * 60) motivos.push('Dura más de 12 horas');

    eventos.push({
      gcal_id: gid,
      nombre: nombrePublico_(lugar, comuna),
      fecha: e.inicio.fecha, hora_inicio: e.inicio.hora, hora_fin: e.fin.hora,
      lugar: lugar ? lugar.slice(0, 120) : null, comuna: comuna || null,
      descripcion: (servicios ? 'Servicio de ' + servicios.charAt(0).toLowerCase() + servicios.slice(1) + '. ' : '') + NOTA_HORARIO,
      baristas: baristas, pago_manual: null,
      cliente: extraerCliente_(titulo, texto) || null,
      revisar: motivos.length > 0, revisar_motivo: motivos.length ? motivos.join('. ').slice(0, 200) : null,
    });
  });
  return { eventos: eventos, ignorados: ignorados, problemas: problemas };
}

// ---------------------------------------------------------------------------
// 2. Correos
// ---------------------------------------------------------------------------
// Cada correo se arma como una lista de bloques y de ahí salen el HTML y el texto plano.
//   {p}  párrafo   {h}  subtítulo   {lista}  viñetas   {datos}  [[etiqueta, valor], …]
//   {tabla} {cabecera, filas}   {boton} {texto, url}   {nota}  letra chica

function bloquesATexto_(bloques) {
  const out = [];
  bloques.forEach(function (b) {
    if (b.p) out.push(b.p);
    else if (b.h) out.push(b.h.toUpperCase());
    else if (b.lista) out.push(b.lista.map(function (x) { return '• ' + x; }).join('\n'));
    else if (b.datos) out.push(b.datos.map(function (d) { return d[0] + ': ' + d[1]; }).join('\n'));
    else if (b.tabla) out.push(b.tabla.filas.map(function (f) { return '• ' + f.join(' · '); }).join('\n'));
    else if (b.boton) out.push(b.boton.texto + ': ' + b.boton.url);
    else if (b.nota) out.push(b.nota);
  });
  return out.join('\n\n');
}

const COL = { azul: '#526EA0', noche: '#020526', celeste: '#B9C5D3', crema: '#E7E5D9', gris: '#F2F2F2' };

function bloquesAHtml_(bloques, titulo) {
  const partes = bloques.map(function (b) {
    if (b.p) return '<p style="margin:0 0 14px;line-height:1.5">' + esc_(b.p) + '</p>';
    if (b.h) return '<h2 style="margin:22px 0 8px;font-size:17px;color:' + COL.noche + '">' + esc_(b.h) + '</h2>';
    if (b.lista) return '<ul style="margin:0 0 14px;padding-left:20px;line-height:1.5">' + b.lista.map(function (x) { return '<li>' + esc_(x) + '</li>'; }).join('') + '</ul>';
    if (b.datos) {
      return '<table role="presentation" style="width:100%;margin:0 0 16px;border-collapse:collapse;background:' + COL.crema + ';border-radius:12px">' +
        b.datos.map(function (d) {
          return '<tr><td style="padding:8px 14px;font-weight:600;white-space:nowrap;vertical-align:top">' + esc_(d[0]) + '</td><td style="padding:8px 14px">' + esc_(d[1]) + '</td></tr>';
        }).join('') + '</table>';
    }
    if (b.tabla) {
      return '<table role="presentation" style="width:100%;margin:0 0 16px;border-collapse:collapse;font-size:14px"><tr>' +
        b.tabla.cabecera.map(function (c) { return '<th style="padding:8px;text-align:left;background:' + COL.crema + '">' + esc_(c) + '</th>'; }).join('') + '</tr>' +
        b.tabla.filas.map(function (f) {
          return '<tr>' + f.map(function (c) { return '<td style="padding:8px;border-bottom:1px solid ' + COL.celeste + ';vertical-align:top">' + esc_(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</table>';
    }
    if (b.boton) {
      return '<p style="margin:20px 0"><a href="' + esc_(b.boton.url) + '" style="display:inline-block;padding:12px 24px;border-radius:999px;background:' + COL.azul + ';color:#ffffff;font-weight:600;text-decoration:none">' + esc_(b.boton.texto) + '</a></p>';
    }
    if (b.nota) return '<p style="margin:16px 0 0;font-size:13px;line-height:1.5">' + esc_(b.nota) + '</p>';
    return '';
  });
  return '<!doctype html><html lang="es"><body style="margin:0;padding:0;background:' + COL.gris + ';font-family:Arial,Helvetica,sans-serif;color:' + COL.noche + '">' +
    '<table role="presentation" style="width:100%;background:' + COL.gris + '"><tr><td style="padding:24px 12px">' +
    '<table role="presentation" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border:1px solid ' + COL.celeste + ';border-radius:16px;overflow:hidden">' +
    '<tr><td style="padding:18px 24px;background:' + COL.azul + ';color:#ffffff;font-size:18px;font-weight:700">Sepia Coffee</td></tr>' +
    '<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;color:' + COL.noche + '">' + esc_(titulo) + '</h1>' +
    partes.join('') + '</td></tr></table></td></tr></table></body></html>';
}

function chipEstado_(semaforo) {
  return { ok: 'OK', pendiente: 'Pendiente', alerta: 'ALERTA' }[semaforo] || '—';
}

function datosEvento_(d, conPago) {
  const filas = [
    ['Evento', d.nombre || d.evento],
    ['Fecha', fechaLarga_(d.fecha)],
    ['Horario', horario_(d.hora_inicio, d.hora_fin)],
    ['Comuna', d.comuna || ''],
  ].filter(function (f) { return f[1]; });
  if (d.lugar) filas.push(['Lugar', d.lugar]);
  if (conPago && d.pago_liquido != null) {
    filas.push(['Pago', pesos_(d.pago_liquido) + ' líquidos' + (d.monto_boleta ? ' · boleta de honorarios por ' + pesos_(d.monto_boleta) : '')]);
  }
  return { datos: filas };
}

function listaAsistentes_(d) {
  return (d.asistentes || []).map(function (x) {
    return x.nombre + ' — ' + (x.telefono || 'sin teléfono') + (x.telefono ? ' (wa.me/' + telefonoWa_(x.telefono) + ')' : '');
  });
}

function sinReconfirmar_(d) {
  return (d.asistentes || []).filter(function (x) { return !x.reconfirmo; }).map(function (x) { return x.nombre; });
}

/**
 * Arma el correo de un aviso para un destinatario.
 *   item: {clave, tipo, datos}, dest: {email, nombre}, portal: URL del portal.
 * Devuelve {asunto, titulo, bloques}.
 */
function armarCorreo_(item, dest, portal) {
  const d = item.datos || {};
  const hola = 'Hola' + (dest && dest.nombre && dest.nombre !== 'Sepia Coffee' ? ' ' + primerNombre_(dest.nombre) : '') + ',';
  const nombre = d.nombre || d.evento || '';
  const paso = +(String(item.clave || '').split(':').pop()) || d.paso || 1;
  const abrir = { boton: { texto: 'Abrir el portal', url: portal } };

  switch (item.tipo) {
    case 'recordatorio_reconfirmar': {
      const asunto = [null, 'Confirma que vas', 'Recordatorio: confirma tu asistencia', 'Último aviso: confirma tu asistencia'][d.paso] || 'Confirma tu asistencia';
      const intro = d.paso === 1
        ? 'Quedaste asignado en un evento que es en ' + d.dias + ' días. Necesitamos que reconfirmes que vas a ir.'
        : d.paso === 2
          ? 'Todavía no tenemos tu confirmación para este evento, que es en ' + d.dias + ' días.'
          : 'Este es el último aviso: el evento es en ' + d.dias + ' días y seguimos sin tu confirmación. Si no confirmas, avisaremos a otros baristas que hay un cupo disponible.';
      return {
        asunto: asunto + ' · ' + nombre + ' · ' + fechaCorta_(d.fecha),
        titulo: asunto,
        bloques: [{ p: hola }, { p: intro }, datosEvento_(d, true),
          { p: 'Entra al portal y presiona «Confirmo que voy». La dirección exacta y las indicaciones también están ahí.' },
          { boton: { texto: 'Confirmar en el portal', url: portal } },
          { nota: 'Si no puedes ir, entra al portal y retírate del evento: así liberamos el cupo a tiempo.' }],
      };
    }
    case 'vacante': {
      const n = d.vacantes || 1;
      return {
        asunto: (n > 1 ? 'Hay ' + n + ' cupos' : 'Hay un cupo') + ': ' + nombre + ' · ' + fechaCorta_(d.fecha),
        titulo: n > 1 ? 'Hay ' + n + ' cupos en un evento' : 'Hay un cupo en un evento',
        bloques: [{ p: hola }, { p: 'Se abrió un cupo en un evento próximo. Si puedes, postula desde el portal.' },
          datosEvento_({ nombre: nombre, fecha: d.fecha, hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, comuna: d.comuna, pago_liquido: d.pago_liquido, monto_boleta: d.monto_boleta }, true),
          { boton: { texto: 'Postular en el portal', url: portal } },
          { nota: 'Recibes este correo porque aceptaste los avisos de Sepia Coffee. Puedes desactivarlos en «Mis datos», dentro del portal.' }],
      };
    }
    case 'vacante_admin': {
      const sin = d.sin_reconfirmar || [];
      return {
        asunto: 'Cupo sin confirmar: ' + nombre + ' · ' + fechaCorta_(d.fecha),
        titulo: 'Hay un cupo sin confirmar',
        bloques: [{ p: hola }, datosEvento_(d, false),
          { p: sin.length ? 'No reconfirmaron tras los tres avisos: ' + sin.join(', ') + '.' : 'Nadie quedó sin reconfirmar, pero hay cupos libres.' },
          { p: d.abierto ? 'Avisé a ' + d.destinatarios + ' baristas que aceptaron avisos.' : 'El evento no está abierto a postulaciones, así que no se avisó a nadie más.' },
          { p: 'Reconfirmados: ' + d.reconfirmados + ' de ' + d.necesarios + '.' }, abrir],
      };
    }
    case 'estado_semana': {
      const evs = d.eventos || [];
      const ok = evs.filter(function (x) { return x.semaforo === 'ok'; }).length;
      return {
        asunto: 'Estado de la semana: ' + evs.length + (evs.length === 1 ? ' evento' : ' eventos') + ', ' + ok + ' OK',
        titulo: 'Estado de la semana',
        bloques: [{ p: hola }, { p: 'Estos son los eventos de los próximos 7 días: ' + ok + ' OK y ' + (evs.length - ok) + ' por resolver.' },
          { tabla: {
            cabecera: ['Evento', 'Estado', 'Baristas'],
            filas: evs.map(function (x) {
              const pend = [];
              if (x.faltan > 0) pend.push('faltan ' + x.faltan);
              const sr = sinReconfirmar_(x);
              if (sr.length) pend.push('sin reconfirmar: ' + sr.join(', '));
              return [x.nombre + ' · ' + fechaCorta_(x.fecha) + ' ' + (x.hora_inicio || '') + (x.comuna ? ' · ' + x.comuna : ''),
                chipEstado_(x.semaforo),
                x.asignados + ' de ' + x.necesarios + ' asignados, ' + x.reconfirmados + ' reconfirmados' + (pend.length ? ' (' + pend.join('; ') + ')' : '')];
            }),
          } }, abrir],
      };
    }
    case 'evento_ok':
    case 'grupo_wsp': {
      const recordatorio = item.tipo === 'grupo_wsp';
      return {
        asunto: (recordatorio ? 'Recordatorio ' + paso + ': crear el grupo de WhatsApp · ' : 'Evento OK · ') + nombre + ' · ' + fechaCorta_(d.fecha),
        titulo: recordatorio ? 'Falta crear el grupo de WhatsApp' : 'Evento OK: crea el grupo de WhatsApp',
        bloques: [{ p: hola },
          { p: recordatorio ? 'Todavía no marcas «Grupo de WhatsApp creado» en este evento.' : 'Todos reconfirmaron. Ahora hay que crear el grupo de WhatsApp para coordinar el evento.' },
          datosEvento_(d, false),
          { h: 'Agrega al grupo' }, { lista: listaAsistentes_(d) },
          { p: 'Cuando lo hayas creado, marca «Grupo de WhatsApp creado» en el checklist del evento (portal → Admin: seguimiento).' },
          abrir],
      };
    }
    case 'alerta4': {
      const sr = sinReconfirmar_(d);
      const razones = [];
      if (d.faltan > 0) razones.push('Faltan ' + d.faltan + ' baristas por asignar' + (d.postulantes ? ' (hay ' + d.postulantes + ' postulantes por revisar)' : '') + '.');
      if (sr.length) razones.push('Sin reconfirmar: ' + sr.join(', ') + '.');
      return {
        asunto: 'ALERTA: ' + nombre + ' no está OK (faltan ' + d.dias + ' días)',
        titulo: 'Alerta: el evento no está OK',
        bloques: [{ p: hola }, { p: 'Faltan ' + d.dias + ' días y este evento todavía no está OK.' }, datosEvento_(d, false),
          { lista: razones.length ? razones : ['Revisa el evento en el portal.'] }, abrir],
      };
    }
    case 'boleta': {
      const intro = d.paso === 1
        ? 'Gracias por trabajar en este evento. Para pagarte necesitamos tu boleta de honorarios.'
        : 'Te recordamos que falta tu boleta de honorarios de este evento.';
      return {
        asunto: (d.paso > 1 ? 'Recordatorio: ' : '') + 'Tu boleta de honorarios · ' + nombre,
        titulo: 'Tu boleta de honorarios',
        bloques: [{ p: hola }, { p: intro },
          { datos: [['Evento', nombre], ['Fecha', fechaLarga_(d.fecha)],
            ['Monto de la boleta', pesos_(d.monto_boleta)],
            ['Retención', porcentaje_(d.retencion)],
            ['Te transferimos', pesos_(d.pago_liquido) + ' líquidos']] },
          { p: 'Cuando la hayas emitido en el SII, entra al portal y presiona «Ya emití mi boleta de honorarios». Así la revisamos y te pagamos.' },
          { boton: { texto: 'Avisar que ya la emití', url: portal } }],
      };
    }
    case 'pago':
      return {
        asunto: 'Te pagamos · ' + nombre,
        titulo: 'Te hicimos la transferencia',
        bloques: [{ p: hola }, { p: 'Registramos el pago de tu trabajo en este evento. Revisa tu cuenta.' },
          { datos: [['Evento', nombre], ['Fecha del evento', fechaLarga_(d.fecha)], ['Monto', pesos_(d.pago_liquido) + ' líquidos'], ['Pagado el', d.pagado_en ? fechaLarga_(d.pagado_en) : '']].filter(function (f) { return f[1]; }) },
          { nota: 'Si no ves la transferencia en tu cuenta, responde este correo.' }],
      };
    case 'resumen_cierre': {
      const bol = d.boletas || [], atr = d.atrasados || [];
      const bloques = [{ p: hola }];
      if (bol.length) {
        bloques.push({ p: 'Estas boletas de honorarios están declaradas y sin pagar. Revisa en el SII que estén emitidas y, al transferir, márcalas como pagadas en el portal (Admin: seguimiento → Por cerrar → «Marcar pagado»); a cada persona le llegará un aviso.' });
        bloques.push({ tabla: { cabecera: ['Barista', 'Evento', 'Folio', 'Boleta', 'Líquido'],
          filas: bol.map(function (b) { return [b.barista + (b.rut ? ' · ' + b.rut : ''), b.evento + ' · ' + fechaCorta_(b.fecha), b.folio || '—', pesos_(b.monto_boleta), pesos_(b.pago_liquido)]; }) } });
      }
      if (atr.length) {
        bloques.push({ h: 'Cierres atrasados' });
        bloques.push({ lista: atr.map(function (x) {
          const falta = [];
          if (x.boletas_pendientes > 0) falta.push(x.boletas_pendientes + ' boletas');
          if (x.pagos_pendientes > 0) falta.push(x.pagos_pendientes + ' pagos');
          if (x.documento_cliente_pendiente) falta.push('documento al cliente');
          return x.evento + ' (hace ' + x.dias + ' días): falta ' + falta.join(', ');
        }) });
      }
      bloques.push(abrir);
      return { asunto: 'Cierres pendientes: ' + bol.length + ' boletas por revisar' + (atr.length ? ', ' + atr.length + ' atrasados' : ''), titulo: 'Cierres pendientes', bloques: bloques };
    }
  }
  return { asunto: 'Aviso de Sepia Coffee', titulo: 'Aviso', bloques: [{ p: hola }, { p: JSON.stringify(d).slice(0, 500) }, abrir] };
}

function correoSincronizacion_(r, extra, portal) {
  const bloques = [{ p: 'Esto pasó al leer el calendario:' }];
  const nombres = function (xs) { return (xs || []).map(function (x) { return x; }); };
  if (r.advertencia) bloques.push({ p: 'ATENCIÓN: ' + r.advertencia });
  if ((r.creados || []).length) { bloques.push({ h: 'Eventos nuevos, ya abiertos para inscribirse' }); bloques.push({ lista: nombres(r.creados) }); }
  if ((r.cambiados || []).length) { bloques.push({ h: 'Cambiaron de fecha u horario (o reaparecieron)' }); bloques.push({ lista: nombres(r.cambiados) }); }
  if ((r.cancelados || []).length) { bloques.push({ h: 'Cancelados (ya no están en el calendario)' }); bloques.push({ lista: nombres(r.cancelados) }); }
  if ((r.por_revisar || []).length) { bloques.push({ h: 'Revisa estos datos en el portal' }); bloques.push({ lista: nombres(r.por_revisar) }); }
  if ((r.errores || []).length) { bloques.push({ h: 'No se pudieron cargar' }); bloques.push({ lista: r.errores.map(function (x) { return x.gcal_id + ': ' + x.error; }) }); }
  if ((extra.problemas || []).length) { bloques.push({ h: 'Eventos con problemas' }); bloques.push({ lista: extra.problemas }); }
  if ((extra.ignorados || []).length) {
    bloques.push({ h: 'No los tomé como servicios' });
    bloques.push({ lista: extra.ignorados.map(function (x) { return x.titulo + ' (' + fechaCorta_(x.fecha) + ')'; }) });
    bloques.push({ nota: 'Si alguno es un servicio con baristas, agrega #barista al título del evento en el calendario. Para que no vuelva a aparecer aquí, agrega #sinbaristas.' });
  }
  bloques.push({ boton: { texto: 'Abrir el portal', url: portal } });
  const c = [(r.creados || []).length + ' nuevos', (r.cambiados || []).length + ' con cambios', (r.cancelados || []).length + ' cancelados'];
  return { asunto: 'Calendario sincronizado: ' + c.join(', '), titulo: 'Calendario sincronizado', bloques: bloques };
}

// ---------------------------------------------------------------------------
// 3. Lo que toca Google (se prueba en Node con simulaciones de estas clases)
// ---------------------------------------------------------------------------

function ajustes_() {
  const p = PropertiesService.getScriptProperties();
  // Al pegar desde el celular suelen colarse espacios o saltos de línea al final: se ignoran.
  const g = function (k, d) { const v = p.getProperty(k); const t = v === null ? '' : String(v).trim(); return t === '' ? d : t; };
  const a = {
    url: String(g('SUPABASE_URL', '')).replace(/\/+$/, ''),
    clave: g('SUPABASE_KEY', ''),
    secreto: g('SECRETO', ''),
    portal: g('PORTAL_URL', 'https://sepiacoffee.cl/pages/baristas'),
    modoPrueba: g('MODO_PRUEBA', 'si').toLowerCase() !== 'no',
    correoPrueba: g('EMAIL_PRUEBA', ''),
    calendarioId: g('CALENDARIO_ID', ''),
    admin: g('ADMIN_EMAIL', ''),
    turnosFijos: json_(g('TURNOS_FIJOS', ''), []),
    alias: json_(g('ALIAS_LUGARES', ''), {}),
  };
  const faltan = ['SUPABASE_URL', 'SUPABASE_KEY', 'SECRETO'].filter(function (k) { return !g(k, ''); });
  if (a.modoPrueba && !a.correoPrueba) faltan.push('EMAIL_PRUEBA (el modo de prueba manda todo a ese correo)');
  if (faltan.length) throw new Error('Faltan ajustes en Project Settings → Script properties: ' + faltan.join(', '));
  if (!a.admin) a.admin = Session.getEffectiveUser().getEmail();
  return a;
}

function rpc_(a, nombre, args) {
  const r = UrlFetchApp.fetch(a.url + '/rest/v1/rpc/' + nombre, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: a.clave }, payload: JSON.stringify(args),
  });
  const cod = r.getResponseCode(), cuerpo = r.getContentText();
  if (cod < 200 || cod >= 300) throw new Error(nombre + ' respondió ' + cod + ': ' + String(cuerpo).slice(0, 300));
  return cuerpo ? JSON.parse(cuerpo) : null;
}

function fechaLocal_(d) { return Utilities.formatDate(d, ZONA, 'yyyy-MM-dd'); }

function leerEventos_(a, desde, hasta) {
  const cal = a.calendarioId ? CalendarApp.getCalendarById(a.calendarioId) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('No encuentro el calendario «' + a.calendarioId + '». Revisa CALENDARIO_ID.');
  return cal.getEvents(desde, hasta).map(function (e) {
    const ini = e.getStartTime(), fin = e.getEndTime();
    return {
      id: e.getId(), titulo: e.getTitle(), descripcion: e.getDescription(), lugar: e.getLocation(),
      inicio: { fecha: fechaLocal_(ini), hora: Utilities.formatDate(ini, ZONA, 'HH:mm') },
      fin: { fecha: fechaLocal_(fin), hora: Utilities.formatDate(fin, ZONA, 'HH:mm') },
      todoElDia: e.isAllDayEvent(), recurrente: e.isRecurringEvent(),
      rechazado: e.getMyStatus() === CalendarApp.GuestStatus.NO,
    };
  });
}

function enviarCorreo_(a, dest, correo) {
  const html = bloquesAHtml_(correo.bloques, correo.titulo);
  const texto = bloquesATexto_(correo.bloques);
  const real = String(dest.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(real)) throw new Error('Correo inválido: ' + real);
  MailApp.sendEmail({
    to: a.modoPrueba ? a.correoPrueba : real,
    subject: (a.modoPrueba ? '[PRUEBA · iría a ' + real + '] ' : '') + correo.asunto,
    htmlBody: html, body: texto, name: 'Sepia Coffee',
  });
}

function avisarAdmin_(a, correo) {
  enviarCorreo_(a, { email: a.modoPrueba ? a.correoPrueba : a.admin }, correo);
}

function conBloqueo_(f) {
  const l = LockService.getScriptLock();
  if (!l.tryLock(20000)) { Logger.log('Hay otra ejecución en curso: se omite esta.'); return null; }
  try { return f(); } finally { l.releaseLock(); }
}

// Si algo falla, avisa por correo (una vez cada 6 horas por función) y relanza el error.
function conAviso_(nombre, f) {
  try { return f(); } catch (e) {
    Logger.log(nombre + ' falló: ' + e.message);
    try {
      const p = PropertiesService.getScriptProperties(), k = 'ULTIMO_ERROR_' + nombre, ahora = Date.now();
      if (!p.getProperty(k) || ahora - Number(p.getProperty(k)) > 6 * 3600 * 1000) {
        p.setProperty(k, String(ahora));
        const destino = p.getProperty('ADMIN_EMAIL') || Session.getEffectiveUser().getEmail();
        MailApp.sendEmail({ to: destino, subject: 'Sepia Coffee · falló la automatización (' + nombre + ')', body: nombre + ' falló:\n\n' + e.message + '\n\nRevisa Ejecuciones en script.google.com.', name: 'Sepia Coffee' });
      }
    } catch (e2) { Logger.log('Tampoco se pudo avisar: ' + e2.message); }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 4. Funciones que se ejecutan
// ---------------------------------------------------------------------------

/** Lee el calendario y publica/actualiza los eventos en el portal. Corre una vez al día. */
function sincronizarCalendario() {
  return conAviso_('sincronizarCalendario', function () {
    return conBloqueo_(function () {
      const a = ajustes_();
      const hoy = new Date(), hasta = new Date(hoy.getTime() + DIAS_HACIA_ADELANTE * 86400000);
      const desdeISO = fechaLocal_(hoy), hastaISO = fechaLocal_(hasta);
      const inicio = Utilities.parseDate(desdeISO + ' 00:00', ZONA, 'yyyy-MM-dd HH:mm');
      const fin = Utilities.parseDate(hastaISO + ' 23:59', ZONA, 'yyyy-MM-dd HH:mm');
      const crudos = leerEventos_(a, inicio, fin);
      const i = interpretar_(crudos, a, desdeISO);
      const r = rpc_(a, 'api_importar', { secreto: a.secreto, eventos: i.eventos, desde: desdeISO, hasta: hastaISO });
      Logger.log('Calendario: ' + crudos.length + ' eventos leídos, ' + i.eventos.length + ' para el portal. Creados ' + (r.creados || []).length +
        ', cambiados ' + (r.cambiados || []).length + ', cancelados ' + (r.cancelados || []).length + ', errores ' + (r.errores || []).length + '.');

      // Los «no los tomé como servicios» se avisan una sola vez por evento.
      const p = PropertiesService.getScriptProperties();
      const vistos = json_(p.getProperty('IGNORADOS_AVISADOS'), []);
      const nuevos = i.ignorados.filter(function (x) { return vistos.indexOf(x.id) < 0; });
      const hayNovedad = (r.creados || []).length || (r.cambiados || []).length || (r.cancelados || []).length ||
        (r.errores || []).length || r.advertencia || i.problemas.length || nuevos.length;
      if (hayNovedad) {
        avisarAdmin_(a, correoSincronizacion_(r, { problemas: i.problemas, ignorados: nuevos }, a.portal));
        if (!a.modoPrueba) p.setProperty('IGNORADOS_AVISADOS', JSON.stringify(vistos.concat(nuevos.map(function (x) { return x.id; })).slice(-300)));
      }
      return r;
    });
  });
}

/** Pregunta qué correos tocan, los manda y los anota. Corre cada hora. */
function enviarNotificaciones() {
  return conAviso_('enviarNotificaciones', function () {
    return conBloqueo_(function () {
      const a = ajustes_();
      const props = PropertiesService.getScriptProperties();
      const pendientes = rpc_(a, 'api_pendientes', { secreto: a.secreto }) || [];
      const vistos = a.modoPrueba ? json_(props.getProperty('PRUEBA_VISTOS'), []) : [];
      const marcar = [], fallos = [];
      let enviados = 0;

      for (let n = 0; n < pendientes.length; n++) {
        const item = pendientes[n];
        if (a.modoPrueba && vistos.indexOf(item.clave) >= 0) continue;
        if (!item.para || !item.para.length) { Logger.log('Sin destinatarios para ' + item.clave); continue; }
        if (MailApp.getRemainingDailyQuota() < item.para.length) { fallos.push('Se acabó la cuota diaria de correos; ' + item.clave + ' sale mañana.'); break; }
        let salieron = 0;
        item.para.forEach(function (dest) {
          try { enviarCorreo_(a, dest, armarCorreo_(item, dest, a.portal)); salieron++; enviados++; }
          catch (e) { fallos.push(item.clave + ' → ' + dest.email + ': ' + e.message); }
        });
        if (salieron > 0) marcar.push(item.clave);
      }

      if (a.modoPrueba) {
        props.setProperty('PRUEBA_VISTOS', JSON.stringify(vistos.concat(marcar).slice(-500)));
      } else if (marcar.length) {
        rpc_(a, 'api_marcar', { secreto: a.secreto, claves: marcar });
      }
      Logger.log('Avisos pendientes: ' + pendientes.length + '. Correos enviados: ' + enviados + '. ' + (a.modoPrueba ? '(MODO_PRUEBA: nada quedó marcado como enviado)' : ''));
      if (fallos.length) {
        avisarAdmin_(a, { asunto: 'Sepia Coffee · algunos correos no salieron', titulo: 'Algunos correos no salieron', bloques: [{ lista: fallos }] });
      }
      return { pendientes: pendientes.length, enviados: enviados, fallos: fallos };
    });
  });
}

// ---------------------------------------------------------------------------
// 5. Instalación y pruebas (se ejecutan a mano desde el editor)
// ---------------------------------------------------------------------------

/** Crea los dos horarios: calendario a las 6:00 y correos cada hora. */
function instalarDisparadores() {
  quitarDisparadores();
  ScriptApp.newTrigger('sincronizarCalendario').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('enviarNotificaciones').timeBased().everyHours(1).create();
  Logger.log('Listo: calendario cada día a las 6:00 y correos cada hora.');
}

function quitarDisparadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'sincronizarCalendario' || f === 'enviarNotificaciones') ScriptApp.deleteTrigger(t);
  });
}

/** Comprueba la clave, la base de datos y el calendario sin mandar ni cambiar nada. */
function probarConexion() {
  const a = ajustes_();
  const pend = rpc_(a, 'api_pendientes', { secreto: a.secreto });
  Logger.log('Base de datos: bien. Correos pendientes ahora: ' + pend.length);
  const hoy = new Date();
  const crudos = leerEventos_(a, hoy, new Date(hoy.getTime() + DIAS_HACIA_ADELANTE * 86400000));
  const i = interpretar_(crudos, a, fechaLocal_(hoy));
  Logger.log('Calendario: bien. ' + crudos.length + ' eventos leídos, ' + i.eventos.length + ' serían servicios con baristas.');
  Logger.log('Modo: ' + (a.modoPrueba ? 'PRUEBA (todo se manda a ' + a.correoPrueba + ')' : 'REAL (los correos salen a los baristas)'));
}

/** Muestra en el registro cómo se leería cada evento del calendario. No cambia nada. */
function vistaPreviaCalendario() {
  const a = ajustes_();
  const hoy = new Date();
  const crudos = leerEventos_(a, hoy, new Date(hoy.getTime() + DIAS_HACIA_ADELANTE * 86400000));
  const i = interpretar_(crudos, a, fechaLocal_(hoy));
  i.eventos.forEach(function (e) {
    Logger.log(e.fecha + ' ' + e.hora_inicio + '–' + e.hora_fin + ' | ' + e.nombre + ' | ' + (e.comuna || '¿comuna?') + ' | ' + e.baristas + ' baristas' +
      (e.pago_manual ? ' | pago ' + pesos_(e.pago_manual) : '') + (e.revisar ? ' | REVISAR: ' + e.revisar_motivo : ''));
  });
  i.ignorados.forEach(function (x) { Logger.log('NO ES SERVICIO: ' + x.titulo + ' (' + x.fecha + ')'); });
  i.problemas.forEach(function (x) { Logger.log('PROBLEMA: ' + x); });
}

/** Manda a EMAIL_PRUEBA un ejemplo de cada correo, con datos inventados. */
function enviarMuestras() {
  const a = ajustes_();
  if (!a.correoPrueba) throw new Error('Pon tu correo en EMAIL_PRUEBA.');
  const ev = { nombre: 'Servicio de barra · Casona de Ejemplo', fecha: '2027-03-13', hora_inicio: '15:00', hora_fin: '23:00', lugar: 'Casona de Ejemplo', comuna: 'Pirque', dias: 7,
    semaforo: 'pendiente', necesarios: 2, asignados: 2, reconfirmados: 1, faltan: 0, postulantes: 1, grupo_wsp: false, pago_liquido: 70000, monto_boleta: 82596,
    asistentes: [{ nombre: 'Ana Ejemplo', telefono: '+56911110001', reconfirmo: true }, { nombre: 'Beto Ejemplo', telefono: '+56911110002', reconfirmo: false }] };
  const barista = { email: a.correoPrueba, nombre: 'Ana Ejemplo' }, admin = { email: a.correoPrueba, nombre: 'Sepia Coffee' };
  const muestras = [
    [{ clave: 'x:1', tipo: 'recordatorio_reconfirmar', datos: Object.assign({ paso: 1, evento: ev.nombre }, ev) }, barista],
    [{ clave: 'x:3', tipo: 'recordatorio_reconfirmar', datos: Object.assign({ paso: 3, evento: ev.nombre }, ev, { dias: 5 }) }, barista],
    [{ clave: 'v', tipo: 'vacante', datos: Object.assign({ vacantes: 1 }, ev) }, barista],
    [{ clave: 'va', tipo: 'vacante_admin', datos: Object.assign({ sin_reconfirmar: ['Beto Ejemplo'], destinatarios: 6, abierto: true }, ev) }, admin],
    [{ clave: 'e', tipo: 'estado_semana', datos: { eventos: [ev, Object.assign({}, ev, { nombre: 'Cenco · turno de 3 horas', semaforo: 'ok', reconfirmados: 2 })] } }, admin],
    [{ clave: 'o', tipo: 'evento_ok', datos: Object.assign({}, ev, { semaforo: 'ok', reconfirmados: 2 }) }, admin],
    [{ clave: 'g:1', tipo: 'grupo_wsp', datos: ev }, admin],
    [{ clave: 'a', tipo: 'alerta4', datos: Object.assign({}, ev, { dias: 4 }) }, admin],
    [{ clave: 'b:1', tipo: 'boleta', datos: { paso: 1, evento: ev.nombre, fecha: ev.fecha, pago_liquido: 70000, monto_boleta: 82596, retencion: 0.1525 } }, barista],
    [{ clave: 'p', tipo: 'pago', datos: { evento: ev.nombre, fecha: ev.fecha, pago_liquido: 70000, pagado_en: '2027-03-18' } }, barista],
    [{ clave: 'r', tipo: 'resumen_cierre', datos: { boletas: [{ barista: 'Ana Ejemplo', rut: '11.111.111-1', evento: ev.nombre, fecha: ev.fecha, folio: '123', monto_boleta: 82596, pago_liquido: 70000 }],
      atrasados: [{ evento: 'Servicio de barra · Otra', fecha: '2027-03-01', dias: 12, boletas_pendientes: 1, pagos_pendientes: 2, documento_cliente_pendiente: true }] } }, admin],
  ];
  const modo = a.modoPrueba;
  a.modoPrueba = true;                       // las muestras siempre van solo a EMAIL_PRUEBA
  muestras.forEach(function (m) { enviarCorreo_(a, m[1], armarCorreo_(m[0], m[1], a.portal)); });
  a.modoPrueba = modo;
  Logger.log('Mandé ' + muestras.length + ' correos de muestra a ' + a.correoPrueba + '.');
}

/** Olvida lo que el modo de prueba ya mandó, para volver a recibir los mismos correos. */
function reiniciarPrueba() {
  PropertiesService.getScriptProperties().deleteProperty('PRUEBA_VISTOS');
  Logger.log('Listo: el modo de prueba vuelve a mandar todo lo pendiente.');
}
