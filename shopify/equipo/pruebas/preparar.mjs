// Datos de prueba (todos inventados) y arranque del navegador con el puente a la base.
import { Puente } from './puente.mjs';

export const URL_SB = 'https://prueba.supabase.invalid';
export const CLAVE_SB = 'sb_publishable_prueba';

export function sembrar() {
  const p = new Puente();
  p.crear(`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, instance_id)
    values ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', extensions.crypt('claveadmin1', extensions.gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
    insert into public.admins (email, clave_activa) values ('admin@ejemplo.test', true);
    insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, lugar, descripcion, baristas_necesarios, pago_manual, estado, servicio, uniforme, tiene_maquina) values
      ('e1000000-0000-0000-0000-000000000001', 'Matrimonio Tres Cupos', current_date + 6, '18:00', '23:00', 'Pirque', 'Viña Prueba', 'Tenida negra', 3, 50000, 'abierto', 'Carrito Espresso Martini', 'Camisa negra', true),
      ('e1000000-0000-0000-0000-000000000002', 'Coffee Break Un Cupo', current_date + 7, '09:00', '11:00', 'Las Condes', null, null, 1, 25000, 'abierto', null, null, null),
      ('e1000000-0000-0000-0000-000000000003', 'Borrador Secreto', current_date + 8, '16:00', '19:00', 'Santiago', null, null, 2, 40000, 'borrador', null, null, null),
      ('e1000000-0000-0000-0000-000000000004', 'Evento Lejano', current_date + 40, '16:00', '19:00', 'Colina', null, null, 2, 40000, 'abierto', null, null, null),
      ('e1000000-0000-0000-0000-000000000006', 'Evento Pasado', current_date - 5, '16:00', '20:00', 'Santiago', null, null, 2, 40000, 'abierto', null, null, null);
    insert into public.evento_privado (evento_id, cliente) values ('e1000000-0000-0000-0000-000000000001', 'Familia Reservada');
    insert into public.evento_direcciones (evento_id, direccion, indicaciones) values ('e1000000-0000-0000-0000-000000000001', 'Camino Falso 123', 'Portón verde');
    insert into public.evento_seguimiento (evento_id) select id from public.eventos on conflict do nothing;
  `);
  const clave = id => p.consulta(`select (public.crear_acceso('${id}', initcap(replace('${id}', '.', ' '))))->>'clave'`);
  const claves = { 'ana.prueba': clave('ana.prueba'), 'beto.prueba': clave('beto.prueba'), 'carla.prueba': clave('carla.prueba') };
  return { p, claves };
}

/* Abre la página del equipo con el puente a la base y la librería de Supabase simulada. */
export async function abrir(browser, p, origen, ancho = 1100) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 1500 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  pg.errores = []; pg.solicitudes = [];
  pg.on('pageerror', e => pg.errores.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pg.errores.push(m.text()); });
  pg.on('request', r => { if (new URL(r.url()).origin === origen) pg.solicitudes.push(r.method() + ' ' + new URL(r.url()).pathname); });
  await pg.exposeFunction('__puente', (tipo, d) => {
    if (tipo === 'rpc') return p.rpc(d.claims, d.nombre, d.args);
    if (tipo === 'tabla') return p.tabla(d.claims, d.consulta);
    if (tipo === 'objeto') return p.objeto(d.claims, d);
    if (tipo === 'entrar') return p.entrar(d.email, d.password);
    if (tipo === 'clave') return p.cambiarClave(d.id, d.clave);
    throw new Error('puente: ' + tipo);
  });
  await pg.route('https://cdn.jsdelivr.net/**', r => r.abort());                      // la librería real no se carga
  await pg.addInitScript({ path: new URL('./mock-supabase.js', import.meta.url).pathname });
  return pg;
}
