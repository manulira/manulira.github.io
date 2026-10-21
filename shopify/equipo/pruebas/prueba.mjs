// Pruebas de «Sepia Equipo» de punta a punta, en un navegador real:
//   interfaz de Jorge (assets/sepia-equipo-*) → adaptador (assets/sepia-equipo-api.js) → funciones y reglas de
//   la base de datos (equipo.sql, esquema.sql) en un Postgres de pruebas.
// Solo se simula la librería de Supabase (mock-supabase.js) y su Auth/Storage; las reglas de seguridad de las
// filas (RLS) y las funciones eq_* corren de verdad. Todos los datos son inventados.
//
//   PGHOST=… PGPORT=… PGUSER=… node shopify/equipo/pruebas/prueba.mjs
//
// Necesita Playwright (PLAYWRIGHT=/ruta/a/playwright/index.mjs; por defecto el paquete «playwright»), `psql` y un
// servidor Postgres de pruebas (con permiso para crear bases). Si el Chromium no es el de Playwright: CHROMIUM=/ruta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sembrar, abrir, URL_SB, CLAVE_SB } from './preparar.mjs';
import { servir } from './servidor.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');
const PUERTO = 5399, ORIGEN = 'http://localhost:' + PUERTO, PAGINA = ORIGEN + '/pages/equipo';
const CAPTURAS = process.env.CAPTURAS || '';          // carpeta donde dejar capturas de pantalla (opcional)
const SOLO = process.env.SECCION || '';               // letras de las secciones a correr (por defecto todas)

const { p, claves } = sembrar();
const servidor = servir(PUERTO, { url: URL_SB, clave: CLAVE_SB });
const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let fallas = 0, total = 0;
const ok = (c, t) => { total++; if (!c) fallas++; console.log(c ? '  ✔' : '  ✘ FALLA', t); };
const corre = letra => !SOLO || SOLO.includes(letra);
const db = sql => p.consulta(sql);
const espera = (pg, ms = 600) => pg.waitForTimeout(ms);
const texto = async pg => (await pg.innerText('body')).replace(/\s+/g, ' ');
const captura = async (pg, nombre) => { if (CAPTURAS) await pg.screenshot({ path: path.join(CAPTURAS, nombre + '.png'), fullPage: true }); };

/* RUT válido con puntos y guion a partir de un número */
const rut = n => {
  let s = 0, f = 2; for (const c of String(n).split('').reverse()) { s += +c * f; f = f === 7 ? 2 : f + 1; }
  const r = 11 - (s % 11), dv = r === 11 ? '0' : r === 10 ? 'K' : String(r), x = n + dv;
  return x.slice(0, -7) + '.' + x.slice(-7, -4) + '.' + x.slice(-4, -1) + '-' + x.slice(-1);
};

const nueva = async (ancho = 1100) => { const pg = await abrir(navegador, p, ORIGEN, ancho); await pg.goto(PAGINA); await entrarSiHaySplash(pg); return pg; };
async function entrarSiHaySplash(pg) {
  await pg.waitForSelector('.boot-screen, .startup-screen, .required-profile, .app-shell, button:has-text("Entrar")', { timeout: 15000 });
  await espera(pg, 800);
  const entrar = pg.getByRole('button', { name: /^Entrar/ });
  if (await entrar.count()) { await entrar.first().click(); await espera(pg, 500); }
}
const pulsa = (pg, nombre, opciones = {}) => pg.getByRole('button', { name: nombre, ...opciones }).first().click();
const clave = (pg, nombre) => pg.getByRole('textbox', { name: nombre, exact: true });

async function iniciarSesion(pg, id, contrasena) {
  await pg.getByLabel('ID de usuario').fill(id);
  await clave(pg, 'Clave').fill(contrasena);
  await pulsa(pg, 'Iniciar sesión');
  await espera(pg, 1800);
}

async function crearClave(pg, actual, nuevaClave) {
  await clave(pg, 'Clave actual').fill(actual);
  await clave(pg, 'Nueva clave').fill(nuevaClave);
  await clave(pg, 'Repetir nueva clave').fill(nuevaClave);
  await pulsa(pg, 'Guardar clave');
  await espera(pg, 1800);
}

async function completarPerfil(pg, { nombre, correo, telefono, numeroRut, camioneta }) {
  await pg.getByRole('textbox', { name: 'Nombre completo' }).fill(nombre);
  await pg.getByRole('textbox', { name: 'Correo electrónico' }).fill(correo);
  await pg.getByRole('textbox', { name: 'Teléfono' }).fill(telefono);
  await pg.getByRole('textbox', { name: 'RUT' }).fill(rut(numeroRut));
  await pg.locator('select').nth(0).selectOption('M');
  await pg.locator('select').nth(1).selectOption('BCI');
  await pg.locator('select').nth(2).selectOption('CuentaRUT');
  await pg.getByRole('textbox', { name: 'Número de cuenta' }).fill(String(numeroRut));
  await pg.locator('input[type=radio][value=' + (camioneta ? 'pickup' : 'none') + ']').check();
  await pulsa(pg, 'Completar perfil y entrar');
  await espera(pg, 1800);
}

const tarjeta = (pg, titulo) => pg.locator('article', { hasText: titulo }).last();
const abrirPostulacion = async (pg, titulo) => { await tarjeta(pg, titulo).getByRole('button', { name: 'Postular' }).click(); await espera(pg, 600); };
const postular = async (pg, titulo, modo) => {
  await abrirPostulacion(pg, titulo);
  await pg.locator('input[type=radio][value=' + modo + ']').check();
  await pulsa(pg, 'Confirmar turno'); await espera(pg, 1500);
};

/* Si se corren secciones sueltas (sin la A), las tres personas ya tienen clave propia y perfil, sin pasar por la interfaz. */
if (SOLO && !corre('A')) {
  const personas = [['ana.prueba', 'Ana Prueba', 20000012, true], ['beto.prueba', 'Beto Prueba', 20000013, false], ['carla.prueba', 'Carla Prueba', 20000014, false]];
  for (const [id, nombre, n, camioneta] of personas) {
    db(`update auth.users set encrypted_password = extensions.crypt('mi frase segura 1', extensions.gen_salt('bf')) where email = '${id}@equipo.sepiacoffee.cl';
        update public.accesos set debe_cambiar_clave = false where usuario = '${id}';
        insert into public.baristas (id, nombre, rut, correo, telefono, banco, tipo_cuenta, numero_cuenta, talla_camisa, tiene_camioneta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad)
          select id, '${nombre}', '${rut(n)}', '${id.split('.')[0]}@ejemplo.test', '+5698765${String(n).slice(-4)}', 'BCI', 'Cuenta RUT', '${n}', 'M', ${camioneta}, true, true, 'x', true from public.accesos where usuario = '${id}'`);
  }
}

try {
  /* ====================================================================== */
  if (corre('A')) {
    console.log('\n=== A. Entrada: ID y clave, clave personal obligatoria y perfil ===');
    const pg = await nueva();
    let t = await texto(pg);
    ok(/Bienvenido al equipo/.test(t) && /Contacta a Manuel/.test(t), 'sin sesión se ve la entrada con ID y clave (y el contacto es Manuel)');
    await captura(pg, 'A1-entrada');
    await iniciarSesion(pg, 'ana.prueba', 'clave equivocada');
    t = await texto(pg);
    ok(/ID o clave incorrectos/.test(t), 'una clave equivocada se rechaza con un mensaje claro');
    await iniciarSesion(pg, 'ana.prueba', claves['ana.prueba']);
    t = await texto(pg);
    ok(/Crea tu clave personal/.test(t), 'con la clave temporal se pide crear la clave personal antes de seguir');
    await captura(pg, 'A2-cambio-clave');
    await clave(pg, 'Clave actual').fill('otra que no es');
    await clave(pg, 'Nueva clave').fill('mi frase segura 1');
    await clave(pg, 'Repetir nueva clave').fill('mi frase segura 1');
    await pulsa(pg, 'Guardar clave'); await espera(pg, 1500);
    ok(/La clave actual no es correcta/.test(await texto(pg)), 'si la clave actual no coincide, no deja cambiarla');
    await clave(pg, 'Clave actual').fill(claves['ana.prueba']);
    await clave(pg, 'Repetir nueva clave').fill('otra frase distinta');
    await pulsa(pg, 'Guardar clave'); await espera(pg, 1200);
    ok(/no son iguales/.test(await texto(pg)), 'si las dos claves nuevas no son iguales, avisa');
    await clave(pg, 'Repetir nueva clave').fill('mi frase segura 1');
    await pulsa(pg, 'Guardar clave'); await espera(pg, 1800);
    t = await texto(pg);
    ok(/Completa tu perfil/.test(t), 'con la clave guardada sigue el perfil obligatorio');
    ok(db(`select (not debe_cambiar_clave)::text from public.accesos where usuario = 'ana.prueba'`) === 'true', 'en la base, la persona ya no debe cambiar la clave');
    ok(/aceptas que Sepia los use para coordinar y pagar/.test(t), 'el perfil avisa el uso de los datos y la boleta');
    await captura(pg, 'A3-perfil');
    await pg.getByRole('textbox', { name: 'RUT' }).fill('11.111.111-2');
    await completarPerfil(pg, { nombre: 'Ana Prueba', correo: 'ana@ejemplo.test', telefono: '+56 9 1234 5612', numeroRut: 20000012, camioneta: true });
    t = await texto(pg);
    ok(/Perfil completo\. Bienvenido a Sepia/.test(t) && /Hola, Ana/.test(t), 'con el perfil completo entra al equipo');
    const fila = db(`select nombre || '|' || tiene_camioneta || '|' || acepta_boleta || '|' || acepta_privacidad || '|' || cuenta_propia from public.baristas where nombre = 'Ana Prueba'`);
    ok(fila === 'Ana Prueba|true|true|true|true', 'el perfil quedó en la base con camioneta y los avisos aceptados (' + fila + ')');
    await captura(pg, 'A4-inicio');
    ok(pg.errores.length === 0, 'sin errores en la consola' + (pg.errores.length ? ': ' + pg.errores.join(' · ') : ''));
    const raros = pg.solicitudes.filter(s => !s.includes('/assets/') && s !== 'GET /pages/equipo');
    ok(raros.length === 0, 'ninguna llamada a un servidor propio: todo pasó por el adaptador' + (raros.length ? ': ' + raros.join(', ') : ''));
    await pg.context().close();
  }

  /* ====================================================================== */
  if (corre('B')) {
    console.log('\n=== B. Eventos: qué se ve, postular con camioneta, ver el evento, pedir ayuda y ver al equipo ===');
    const pg = await nueva();
    await iniciarSesion(pg, 'ana.prueba', 'mi frase segura 1');
    let t = await texto(pg);
    ok(/Matrimonio Tres Cupos/.test(t) && /Coffee Break Un Cupo/.test(t), 've los eventos abiertos de las próximas dos semanas');
    ok(!/Borrador Secreto|Evento Lejano/.test(t), 'no ve borradores ni eventos de más de dos semanas');
    ok(!/Familia Reservada|Camino Falso/.test(t), 'no ve el cliente ni la dirección antes de estar confirmada');
    ok(/1 de 1 cupos/.test(t) && /👤 1 cupos/.test(t), 'un evento de un solo cupo se puede tomar sin camioneta');
    await pg.getByRole('button', { name: 'Postular' }).first().click(); await espera(pg, 600);
    ok(await pg.locator('input[type=radio][value=pickup]').count() === 1 && await pg.locator('input[type=radio][value=none]').count() === 1, 'al postular elige con o sin camioneta');
    await pg.locator('input[type=radio][value=pickup]').check();
    await pulsa(pg, 'Confirmar turno'); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Turno confirmado/.test(t), 'queda confirmada al tiro (por orden de llegada)');
    await captura(pg, 'B1-confirmado');
    const post = db(`select p.estado || '|' || p.conductor || '|' || (p.asistencia_confirmada_en is not null) from public.postulaciones p join public.eventos e on e.id = p.evento_id where e.nombre = 'Matrimonio Tres Cupos'`);
    ok(post === 'confirmada|true|true', 'en la base: confirmada, como conductora, y con asistencia confirmada (' + post + ')');
    await pulsa(pg, 'Ver evento y tareas'); await espera(pg, 1200);
    t = await texto(pg);
    ok(/Camino Falso 123/.test(t) && /Indicaciones: Portón verde/.test(t) && /Uniforme: Camisa negra/.test(t), 'confirmada, ve la dirección, las indicaciones y el uniforme');
    ok(!/Familia Reservada/.test(t), 'pero nunca el nombre del cliente');
    ok(/Cómo llegar/.test(t) && await pg.locator('a[href*="google.com/maps/dir"]').count() > 0, 'trae el enlace «Cómo llegar»');
    await captura(pg, 'B2-detalle');

    await pulsa(pg, 'Necesito ayuda'); await espera(pg, 900);
    t = await texto(pg);
    ok(/Con quién quieres hablar/.test(t) && /Manuel Lira/.test(t), '«Necesito ayuda» muestra el contacto de Manuel');
    const wsp = await pg.locator('a[href*="wa.me/56979284400"]').count();
    ok(wsp === 1, 'con el enlace a su WhatsApp, con el evento en el mensaje');
    await pulsa(pg, 'Cerrar contactos de ayuda').catch(() => {});

    /* Registro fotográfico: tres etapas */
    const foto = path.join(os.tmpdir(), 'sepia-eq-foto.png');
    fs.writeFileSync(foto, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    await pg.locator('input[type=file]').nth(1).setInputFiles(foto); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Revisa tu foto antes de guardarla/.test(t), 'al elegir una foto, la muestra para revisarla antes de guardar');
    await pulsa(pg, 'Guardar foto'); await espera(pg, 2000);
    t = await texto(pg);
    ok(/Foto guardada en el registro privado del evento/.test(t) && /1\/3/.test(t), 'la foto queda guardada y el avance sube a 1 de 3');
    ok(db(`select count(*) || '|' || min(etapa) from public.evento_fotos`) === '1|loaded', 'en la base: una foto de la etapa «auto cargado»');
    ok(db(`select count(*) from storage.objects where bucket_id = 'eventos-fotos'`) === '1', 'y un archivo en el almacenamiento privado');
    ok(await pg.locator('.photo-gallery img').count() === 1 && /^data:image/.test(await pg.locator('.photo-gallery img').first().getAttribute('src')), 'se ve en la galería con su dirección firmada');
    await captura(pg, 'B3-fotos');
    await pg.locator('.photo-delete').first().click(); await espera(pg, 400);
    await pulsa(pg, 'Eliminar', { exact: true }); await espera(pg, 1500);
    ok(/Foto eliminada del registro/.test(await texto(pg)), 'se puede eliminar la foto propia');
    ok(db(`select (select count(*) from public.evento_fotos) || '|' || (select count(*) from storage.objects where bucket_id = 'eventos-fotos')`) === '0|0', 'y desaparece de la base y del almacenamiento');

    /* Cancelar con tiempo */
    await pulsa(pg, 'Cancelar mi turno'); await espera(pg, 500);
    await pulsa(pg, 'Sí, cancelar mi turno'); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Turno cancelado\. El cupo quedó disponible/.test(t), 'con más de 24 horas de plazo se puede cancelar');
    ok(db(`select p.estado from public.postulaciones p join public.eventos e on e.id = p.evento_id where e.nombre = 'Matrimonio Tres Cupos'`) === 'retirada', 'en la base la postulación queda retirada');
    await pg.locator('button', { hasText: /^Disponibles/ }).first().click(); await espera(pg, 500);
    ok(/3 de 3 cupos disponibles/.test(await texto(pg)), 'y el cupo vuelve a estar disponible');
    await pg.getByRole('button', { name: 'Postular' }).first().click(); await espera(pg, 500);
    await pg.locator('input[type=radio][value=pickup]').check(); await pulsa(pg, 'Confirmar turno'); await espera(pg, 1500);
    ok(/Turno confirmado/.test(await texto(pg)) && db(`select count(*) from public.postulaciones where estado = 'confirmada'`) === '1', 'puede volver a postular al mismo evento');

    /* Un turno que empieza en menos de 24 horas ya no se puede cancelar */
    db(`insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, pago_manual, estado)
        values ('e1000000-0000-0000-0000-000000000007', 'Turno Muy Cercano', (now() at time zone 'America/Santiago' + interval '20 hours')::date,
                (now() at time zone 'America/Santiago' + interval '20 hours')::time, '23:59', 'Providencia', 2, 30000, 'abierto');
        insert into public.evento_seguimiento (evento_id) values ('e1000000-0000-0000-0000-000000000007');
        insert into public.postulaciones (evento_id, barista_id, estado, conductor)
        select 'e1000000-0000-0000-0000-000000000007', id, 'confirmada', false from public.baristas where nombre = 'Ana Prueba'`);
    await pulsa(pg, 'Actualizar'); await espera(pg, 1500);
    await pg.locator('button', { hasText: /^Mis turnos/ }).first().click(); await espera(pg, 500);
    t = await texto(pg);
    ok(/Turno Muy Cercano/.test(t) && /Matrimonio Tres Cupos/.test(t), 'en «Mis turnos» están sus dos turnos');
    await pg.locator('article', { hasText: 'Turno Muy Cercano' }).last().getByRole('button', { name: /^Ver evento/ }).click(); await espera(pg, 1000);
    t = await texto(pg);
    ok(/El plazo de cancelación terminó/.test(t) && await pg.getByRole('button', { name: 'Cancelar mi turno' }).count() === 0, 'un turno que empieza en menos de 24 horas ya no se puede cancelar desde la app');
    // aunque la base también lo impide si alguien lo intentara por otro camino
    const intento = p.rpc({ sub: db(`select id from public.baristas where nombre = 'Ana Prueba'`), email: 'ana.prueba@equipo.sepiacoffee.cl', role: 'authenticated' }, 'eq_accion',
      { p_accion: 'cancelApplication', p_datos: { eventId: 'e1000000-0000-0000-0000-000000000007' } });
    ok(intento.error && /plazo de cancelación/.test(intento.error.message), 'y la base de datos lo rechaza aunque se pida por otro camino');
    await pulsa(pg, 'Cerrar ventana');
    await pg.locator('article', { hasText: 'Matrimonio Tres Cupos' }).last().getByRole('button', { name: 'Ver equipo' }).click(); await espera(pg, 1200);
    t = await texto(pg);
    ok(/Ana Prueba/.test(t), '«Ver equipo» muestra quién va al evento');
    await captura(pg, 'B5-equipo');
    await pg.context().close();
  }

  /* ====================================================================== */
  if (corre('C')) {
    console.log('\n=== C. Cupos: sin camioneta, el último cupo con camioneta, cupos cerrados ===');
    const alta = async (id, nombre, numeroRut, camioneta) => {
      const pg = await nueva();
      await iniciarSesion(pg, id, claves[id]);
      await crearClave(pg, claves[id], 'mi frase segura 1');
      await completarPerfil(pg, { nombre, correo: id.split('.')[0] + '@ejemplo.test', telefono: '+56 9 8765 43' + String(numeroRut % 100).padStart(2, '0'), numeroRut, camioneta });
      return pg;
    };
    const beto = await alta('beto.prueba', 'Beto Prueba', 20000013, false);
    let t = await texto(beto);
    ok(/Hola, Beto/.test(t), 'Beto entra por primera vez (clave temporal, clave propia y perfil sin camioneta)');
    await abrirPostulacion(beto, 'Matrimonio Tres Cupos');
    ok(await beto.locator('input[type=radio][value=pickup]').isDisabled(), 'sin camioneta en su perfil… la opción «con camioneta» ya está tomada por Ana y no se puede elegir');
    await beto.locator('input[type=radio][value=none]').check();
    await pulsa(beto, 'Confirmar turno'); await espera(beto, 1500);
    ok(/Turno confirmado/.test(await texto(beto)), 'Beto se confirma sin camioneta');
    const carla = await alta('carla.prueba', 'Carla Prueba', 20000014, false);
    await postular(carla, 'Matrimonio Tres Cupos', 'none');
    ok(/Turno confirmado/.test(await texto(carla)), 'Carla se confirma sin camioneta: el evento queda lleno (1 con camioneta + 2 sin)');
    await pulsa(carla, 'Actualizar'); await espera(carla, 1000);
    await carla.locator('button', { hasText: /^Disponibles/ }).first().click(); await espera(carla, 400);
    t = await texto(carla);
    ok(/Eventos listos 1/.test(t) && !/Matrimonio Tres Cupos 18:00 – 23:00 Viña/.test(t), 'el evento lleno sale de «Disponibles» y pasa a «Eventos listos» (tiene su camioneta y su equipo)');
    ok(db(`select count(*) from public.postulaciones p join public.eventos e on e.id = p.evento_id where e.nombre = 'Matrimonio Tres Cupos' and p.estado = 'confirmada'`) === '3', 'en la base: tres confirmadas en el evento de tres cupos');

    /* Un evento de tres cupos sin camioneta todavía: los «sin camioneta» no pueden llenar todo */
    db(`insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, pago_manual, estado)
        values ('e1000000-0000-0000-0000-000000000008', 'Fiesta Que Reserva Camioneta', current_date + 5, '20:00', '23:30', 'Ñuñoa', 3, 45000, 'abierto');
        insert into public.evento_seguimiento (evento_id) values ('e1000000-0000-0000-0000-000000000008')`);
    await pulsa(beto, 'Actualizar'); await espera(beto, 1000);
    await beto.locator('button', { hasText: /^Disponibles/ }).first().click(); await espera(beto, 400);
    await postular(beto, 'Fiesta Que Reserva Camioneta', 'none');
    ok(/Turno confirmado/.test(await texto(beto)), 'Beto toma un lugar sin camioneta en la fiesta');
    await pulsa(carla, 'Actualizar'); await espera(carla, 1000);
    await carla.locator('button', { hasText: /^Disponibles/ }).first().click(); await espera(carla, 400);
    await postular(carla, 'Fiesta Que Reserva Camioneta', 'none');
    ok(/Turno confirmado/.test(await texto(carla)), 'Carla toma el segundo lugar sin camioneta');
    const ana = await nueva();
    await iniciarSesion(ana, 'ana.prueba', 'mi frase segura 1');
    await abrirPostulacion(ana, 'Fiesta Que Reserva Camioneta');
    ok(await ana.locator('input[type=radio][value=none]').isDisabled() && !await ana.locator('input[type=radio][value=pickup]').isDisabled(), 'el último lugar queda reservado para la camioneta: Ana solo puede ir con camioneta');
    await captura(ana, 'C1-reservado');
    await ana.locator('input[type=radio][value=pickup]').check(); await pulsa(ana, 'Confirmar turno'); await espera(ana, 1500);
    ok(/Turno confirmado/.test(await texto(ana)), 'y lo toma');
    for (const pg of [beto, carla, ana]) { ok(pg.errores.length === 0, 'sin errores en la consola' + (pg.errores.length ? ': ' + pg.errores.join(' · ') : '')); await pg.context().close(); }
  }

  /* ====================================================================== */
  if (corre('D')) {
    console.log('\n=== D. Ranking, mi perfil, ganancias, foto, cambio de clave, avisos y salir ===');
    db(`update public.eventos set fecha = date_trunc('month', now() at time zone 'America/Santiago')::date where id = 'e1000000-0000-0000-0000-000000000006';
        insert into public.postulaciones (evento_id, barista_id, estado, conductor, asistio)
          select 'e1000000-0000-0000-0000-000000000006', id, 'confirmada', false, true from public.baristas where nombre = 'Beto Prueba';
        insert into public.historial_turnos (nombre, fecha, evento, horas, acceso_id)
          select 'Ana Prueba', current_date - 90 - n, 'Antiguo ' || n, 4, (select id from public.accesos where usuario = 'ana.prueba') from generate_series(1, 2) n`);
    const pg = await nueva();
    await iniciarSesion(pg, 'ana.prueba', 'mi frase segura 1');
    await pg.getByRole('button', { name: 'Ranking' }).first().click(); await espera(pg, 1500);
    let t = await texto(pg);
    await captura(pg, 'D1-ranking');
    ok(/Ana Prueba/.test(t) && /Beto Prueba/.test(t), 'el ranking muestra al equipo');
    const mes = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', month: 'long' }).format(new Date());
    ok(new RegExp(mes.charAt(0).toUpperCase() + mes.slice(1)).test(t) && /Acumulado/.test(t), 'con «Acumulado» y el mes en curso (' + mes + ')');
    const zona = t.slice(t.indexOf('Todo el equipo'));
    ok(/Ana Prueba 2.*Beto Prueba 1.*Carla Prueba 0/.test(zona), 'ordenado por turnos: Ana 2 (historial anterior), Beto 1 (turno trabajado), Carla 0');
    ok(!/rut|20\.000|@ejemplo/i.test(t), 'el ranking no muestra datos personales');
    await pg.getByRole('button', { name: mes.charAt(0).toUpperCase() + mes.slice(1) }).click(); await espera(pg, 600);
    const zona2 = (await texto(pg));
    ok(/Beto Prueba 1/.test(zona2.slice(zona2.indexOf('Todo el equipo'))) && /Ana Prueba 0/.test(zona2.slice(zona2.indexOf('Todo el equipo'))), 'el filtro del mes cuenta solo los turnos de ese mes');

    const seccion = async nombre => { await pg.locator('.profile-section-menu summary').click(); await espera(pg, 200); await pg.locator('.profile-section-menu nav').getByRole('button', { name: nombre }).click(); await espera(pg, 900); };
    await pg.getByRole('button', { name: 'Mi Perfil' }).first().click(); await espera(pg, 1000);
    await seccion('Datos personales');
    await pg.getByRole('textbox', { name: 'Correo de contacto' }).fill('ana.nueva@ejemplo.test');
    await pg.locator('select').first().selectOption('L');
    await pulsa(pg, 'Guardar cambios'); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Tu perfil se guardó de forma privada/.test(t), 'se pueden corregir los datos personales');
    ok(db(`select correo || '|' || talla_camisa from public.baristas where nombre = 'Ana Prueba'`) === 'ana.nueva@ejemplo.test|L', 'y quedan guardados en la base');
    await seccion('Camioneta y notificaciones');
    await pg.getByRole('checkbox', { name: /WhatsApp/ }).check();
    await pulsa(pg, 'Guardar cambios'); await espera(pg, 1500);
    ok(db(`select acepta_whatsapp::text from public.baristas where nombre = 'Ana Prueba'`) === 'true', 'acepta o no los avisos por WhatsApp');

    /* Foto de perfil */
    const png = path.join(os.tmpdir(), 'sepia-eq-perfil.png');
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    await pg.locator('.profile-photo-control input[type=file]').setInputFiles(png); await espera(pg, 2500);
    t = await texto(pg);
    ok(/Foto de perfil guardada/.test(t), 'sube su foto de perfil');
    const ruta = db(`select foto_path from public.baristas where nombre = 'Ana Prueba'`);
    ok(/^[0-9a-f-]{36}\/foto-\d+\.jpg$/.test(ruta) && db(`select count(*) from storage.objects where bucket_id = 'perfiles'`) === '1', 'queda en su carpeta privada del almacenamiento y anotada en su perfil (' + ruta + ')');
    await espera(pg, 800);
    const fotos = await pg.locator('.member-avatar-small img, .profile-photo-circle img').evaluateAll(els => els.map(e => e.getAttribute('src') || '').filter(Boolean));
    ok(fotos.length >= 1 && fotos.every(f => /^data:image/.test(f)), 'la foto se muestra con una dirección firmada, no con una ruta del servidor (' + fotos.length + ' lugares)');
    await captura(pg, 'D3-foto');
    await pulsa(pg, /Quitar foto/); await espera(pg, 1500);
    ok(/Foto de perfil quitada/.test(await texto(pg)) && db(`select (foto_path is null)::text from public.baristas where nombre = 'Ana Prueba'`) === 'true' && db(`select count(*) from storage.objects where bucket_id = 'perfiles'`) === '0', 'y la puede quitar (se borra de la base y del almacenamiento)');

    /* Avisos dentro de la app */
    db(`insert into public.avisos (barista_id, clave, titulo, cuerpo) select id, 'prueba:1', 'Mañana tienes turno: Matrimonio Tres Cupos', 'Horario 18:00 – 23:00.' from public.baristas where nombre = 'Ana Prueba'`);
    await pg.reload(); await entrarSiHaySplash(pg); await espera(pg, 1200);
    await pg.locator('.crew-notices summary').click(); await espera(pg, 500);
    t = await texto(pg);
    ok(/Mañana tienes turno: Matrimonio Tres Cupos/.test(t) && /1 Avisos|Avisos/.test(t), 'la campana muestra el aviso de turno');
    await captura(pg, 'D4-avisos');
    await pulsa(pg, 'Marcar como leído'); await espera(pg, 1000);
    ok(!/Mañana tienes turno/.test(await texto(pg)) && db(`select (leido_en is not null)::text from public.avisos where clave = 'prueba:1'`) === 'true', 'al marcarlo como leído desaparece y queda anotado en la base');

    /* Cambiar la clave desde el perfil, y salir */
    await seccion('Cambiar mi clave');
    await clave(pg, 'Clave actual').fill('mi frase segura 1');
    await clave(pg, 'Nueva clave').fill('otra frase segura 2');
    await clave(pg, 'Repetir nueva clave').fill('otra frase segura 2');
    await pulsa(pg, 'Guardar clave'); await espera(pg, 1800);
    const otra = await nueva();
    await iniciarSesion(otra, 'ana.prueba', 'mi frase segura 1');
    ok(/ID o clave incorrectos/.test(await texto(otra)), 'con la clave anterior ya no se entra');
    await iniciarSesion(otra, 'ana.prueba', 'otra frase segura 2');
    ok(/Hola, Ana/.test(await texto(otra)), 'con la nueva sí');
    await otra.context().close();
    await pg.getByRole('button', { name: 'Cerrar sesión' }).click(); await espera(pg, 2500);
    await entrarSiHaySplash(pg);
    ok(/Bienvenido al equipo/.test(await texto(pg)), 'al cerrar sesión vuelve a la entrada');
    ok(await pg.evaluate(() => localStorage.getItem('sepia-baristas-auth')) === null, 'y no queda la sesión guardada en el navegador');
    ok(pg.errores.length === 0, 'sin errores en la consola' + (pg.errores.length ? ': ' + pg.errores.join(' · ') : ''));
    await pg.context().close();
    await pg.context().close();
  }

  /* ====================================================================== */
  if (corre('E')) {
    console.log('\n=== E. Administración ===');
    db(`insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, pago_manual, estado, tiene_maquina)
        values ('e1000000-0000-0000-0000-000000000009', 'Evento Para Asignar', current_date + 9, '15:00', '19:00', 'La Reina', 3, 42000, 'abierto', true);
        insert into public.evento_seguimiento (evento_id) values ('e1000000-0000-0000-0000-000000000009')`);
    const pg = await nueva();
    await iniciarSesion(pg, 'admin@ejemplo.test', 'claveadmin1');
    let t = await texto(pg);
    ok(/Gestiona experiencias/.test(t) && /Vista barista/.test(t), 'la administración entra con su correo y clave (si activó su clave)');
    await pg.locator('button', { hasText: /^Eventos listos/ }).first().click(); await espera(pg, 500);
    t += ' ' + await texto(pg);
    ok(/Familia Reservada/.test(t) && /Traslado con camioneta/.test(t), 've el cliente y los datos de traslado de los eventos, que los baristas no ven');
    await pg.getByRole('button', { name: 'Administrar' }).first().click(); await espera(pg, 1000);
    const tile = nombre => pg.locator('button', { hasText: nombre }).first();
    await tile(/^Crear evento/).click(); await espera(pg, 800);
    await pg.locator('input[type=radio][name=machine]').first().check();
    await pg.getByRole('textbox', { name: 'Nombre del evento' }).fill('Cóctel Empresa Prueba');
    const fechaEv = db(`select (current_date + 3)::text`);
    await pg.getByLabel('Fecha', { exact: true }).fill(fechaEv);
    await pg.getByLabel(/Cupos totales/).fill('3');
    await pg.getByLabel('Hora de inicio').fill('19:00');
    await pg.getByLabel('Hora de término').fill('22:00');
    await pg.getByRole('textbox', { name: 'Dirección' }).fill('Av. Siempre Viva 742');
    await pg.getByRole('textbox', { name: /Comuna o zona/ }).fill('Providencia');
    await pg.getByLabel(/Monto líquido por barista/).fill('55000');
    await pg.getByRole('textbox', { name: 'Uniforme del evento' }).fill('Camisa blanca');
    await pg.getByRole('textbox', { name: 'Instrucciones para el equipo' }).fill('Llegar 1 hora antes');
    await pg.getByLabel('Estado').selectOption('published');
    await captura(pg, 'E3-formulario');
    await pulsa(pg, 'Guardar y publicar'); await espera(pg, 1800);
    t = await texto(pg);
    ok(/Evento publicado para el equipo/.test(t), 'crea y publica un evento');
    const ev = db(`select e.estado || '|' || e.comuna || '|' || e.baristas_necesarios || '|' || e.pago_manual || '|' || coalesce(e.uniforme, '') || '|' || coalesce(d.direccion, '') from public.eventos e left join public.evento_direcciones d on d.evento_id = e.id where e.nombre = 'Cóctel Empresa Prueba'`);
    ok(ev === 'abierto|Providencia|3|55000|Camisa blanca|Av. Siempre Viva 742', 'queda en la base con comuna, cupos, pago, uniforme y dirección (' + ev + ')');
    await captura(pg, 'E4-creado');
    await tile(/^Eventos abiertos/).click(); await espera(pg, 1000);
    await pg.locator('article, li, div', { hasText: 'Evento Para Asignar' }).filter({ has: pg.getByRole('button', { name: 'Ver equipo' }) }).last().getByRole('button', { name: 'Ver equipo' }).click(); await espera(pg, 1500);
    const idBar = nombre => db(`select id from public.baristas where nombre = '${nombre}'`);
    await pg.locator('select').filter({ hasText: 'Seleccionar barista' }).selectOption(idBar('Ana Prueba'));
    await pg.locator('select').filter({ hasText: 'Con camioneta' }).last().selectOption('pickup');
    await pulsa(pg, 'Asignar al evento'); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Barista asignado al evento/.test(t), 'asigna a Ana al evento, con camioneta');
    ok(db(`select p.estado || '|' || p.conductor from public.postulaciones p join public.eventos e on e.id = p.evento_id where e.nombre = 'Evento Para Asignar' and p.barista_id = '${idBar('Ana Prueba')}'`) === 'confirmada|true', 'en la base queda confirmada y como conductora');
    ok(/Con camioneta \(1\)/.test(t) && /Ana Prueba/.test(t.slice(t.indexOf('Asignar al evento'))), 'y aparece en el grupo «con camioneta»');
    await captura(pg, 'E6-asignada');
    await pg.locator('select').filter({ hasText: 'Seleccionar barista' }).selectOption(idBar('Beto Prueba'));
    await pg.locator('select').filter({ hasText: 'Con camioneta' }).last().selectOption('pickup');
    await pulsa(pg, 'Asignar al evento'); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Ya no queda cupo con camioneta/.test(t) || /camioneta/.test(t) && db(`select count(*) from public.postulaciones p join public.eventos e on e.id = p.evento_id where e.nombre = 'Evento Para Asignar' and p.estado = 'confirmada'`) === '1', 'no se puede asignar un segundo conductor (un solo cupo con camioneta por evento)');
    await pg.locator('select').filter({ hasText: 'Con camioneta' }).last().selectOption('none');
    await pulsa(pg, 'Asignar al evento'); await espera(pg, 1500);
    ok(db(`select count(*) from public.postulaciones p join public.eventos e on e.id = p.evento_id where e.nombre = 'Evento Para Asignar' and p.estado = 'confirmada'`) === '2', 'pero sí a Beto sin camioneta');
    await pg.getByRole('button', { name: 'Eliminar' }).last().click(); await espera(pg, 1500);
    ok(/Barista eliminado del evento/.test(await texto(pg)) && db(`select count(*) from public.postulaciones p join public.eventos e on e.id = p.evento_id where e.nombre = 'Evento Para Asignar' and p.estado = 'confirmada'`) === '1', 'se puede sacar a alguien del evento (queda retirada; el cupo se libera)');
    // cerrar el modal y volver al panel
    await pg.keyboard.press('Escape'); await espera(pg, 400);
    await pg.getByRole('button', { name: 'Administrar' }).first().click(); await espera(pg, 700);

    /* Editar un evento: los datos llegan completos y guardar no pierde nada */
    await tile(/^Eventos abiertos/).click(); await espera(pg, 900);
    await pg.locator('article, li, div', { hasText: 'Matrimonio Tres Cupos' }).filter({ has: pg.getByRole('button', { name: 'Editar' }) }).last().getByRole('button', { name: 'Editar' }).click(); await espera(pg, 1000);
    ok(await pg.getByRole('textbox', { name: 'Dirección' }).inputValue() === 'Camino Falso 123' && await pg.getByRole('textbox', { name: /Comuna o zona/ }).inputValue() === 'Viña Prueba, Pirque', 'al editar, el evento llega con su dirección y su lugar');
    await pg.getByLabel(/Cupos totales/).fill('4');
    await pulsa(pg, /^Guardar/); await espera(pg, 1500);
    ok(db(`select baristas_necesarios || '|' || descripcion || '|' || (select cliente from public.evento_privado where evento_id = e.id) from public.eventos e where nombre = 'Matrimonio Tres Cupos'`) === '4|Tenida negra|Familia Reservada', 'al guardar cambia los cupos y no pierde la descripción ni el cliente');

    /* Publicar un borrador */
    await tile(/^Preparar eventos/).click(); await espera(pg, 900);
    await pg.getByRole('button', { name: 'Editar' }).first().click(); await espera(pg, 900);
    await pg.locator('input[type=radio][name=machine]').nth(1).check();      // el formulario exige indicar si lleva máquina…
    await pg.getByRole('textbox', { name: 'Dirección' }).fill('Calle Falsa 456');   // …y la dirección
    await pg.locator('select').filter({ hasText: 'Borrador' }).last().selectOption('published');
    await pulsa(pg, 'Guardar y publicar'); await espera(pg, 1500);
    ok(db(`select estado from public.eventos where nombre = 'Borrador Secreto'`) === 'abierto', 'publica un borrador para que el equipo lo vea');

    /* Cuentas del equipo */
    await tile(/^Equipo/).click(); await espera(pg, 900);
    await pg.getByRole('textbox', { name: 'Nombre completo' }).fill('Dora Nueva');
    await pg.getByRole('textbox', { name: 'ID de acceso' }).fill('dora.nueva');
    await pulsa(pg, 'Crear cuenta'); await espera(pg, 1800);
    t = await texto(pg);
    const m = /ID:\s*(\S+)\s*Clave temporal:\s*(\S+)/.exec(t);
    ok(m && m[1] === 'dora.nueva' && /^[a-z0-9]{4}(-[a-z0-9]{4}){2}$/.test(m[2]), 'crea una cuenta y muestra su ID y su clave temporal (una sola vez)' + (m ? ' (' + m[1] + ')' : ''));
    const dora = await nueva();
    await iniciarSesion(dora, 'dora.nueva', m ? m[2] : '');
    ok(/Crea tu clave personal/.test(await texto(dora)), 'con esos datos la persona entra y debe crear su clave');
    await dora.context().close();
    await pulsa(pg, 'Ya guardé los datos'); await espera(pg, 800);
    pg.on('dialog', d => d.accept());
    await tile(/^Equipo/).click(); await espera(pg, 900);
    const filaAna = pg.locator('article, li, div', { hasText: 'Ana Prueba' }).filter({ has: pg.getByRole('button', { name: 'Restablecer clave' }) }).last();
    await filaAna.getByRole('button', { name: 'Restablecer clave' }).click(); await espera(pg, 1800);
    t = await texto(pg);
    const m2 = /ID:\s*(\S+)\s*Clave temporal:\s*(\S+)/.exec(t);
    ok(m2 && m2[1] === 'ana.prueba', 'restablece la clave de una persona y muestra la temporal');
    ok(db(`select debe_cambiar_clave::text from public.accesos where usuario = 'ana.prueba'`) === 'true', 'que la obliga a crear una nueva al entrar');
    await pulsa(pg, 'Ya guardé los datos'); await espera(pg, 800);
    await tile(/^Equipo/).click(); await espera(pg, 900);
    const filaCarla = pg.locator('article, li, div', { hasText: 'Carla Prueba' }).filter({ has: pg.getByRole('button', { name: 'Desactivar acceso', exact: true }) }).last();
    await filaCarla.getByRole('button', { name: 'Desactivar acceso', exact: true }).click(); await espera(pg, 1500);
    ok(db(`select activo::text from public.accesos where usuario = 'carla.prueba'`) === 'false' && /Sin acceso/.test(await texto(pg)), 'desactiva el acceso de una persona (y se puede restaurar)');
    const carla = await nueva();
    await iniciarSesion(carla, 'carla.prueba', 'mi frase segura 1');
    ok(/desactivado|incorrectos|no tiene acceso/i.test(await texto(carla)), 'la persona desactivada ya no entra');
    await carla.context().close();
    await pg.locator('article, li, div', { hasText: 'Carla Prueba' }).filter({ has: pg.getByRole('button', { name: 'Restaurar acceso', exact: true }) }).last().getByRole('button', { name: 'Restaurar acceso', exact: true }).click(); await espera(pg, 1200);

    /* Turnos y ganancias, y boletas */
    db(`insert into public.postulaciones (evento_id, barista_id, estado, conductor, asistio)
        select 'e1000000-0000-0000-0000-000000000006', id, 'confirmada', false, true from public.baristas where nombre = 'Beto Prueba'
        on conflict (evento_id, barista_id) do nothing`);
    await tile(/^Turnos y ganancias/).click(); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Beto Prueba · 1 turnos · \$40\.000 honorarios registrados/.test(t), '«Turnos y ganancias» muestra los turnos trabajados y los honorarios registrados de cada persona');
    await captura(pg, 'E7-ganancias');
    await pg.getByText(/Beto Prueba · 1 turnos/).click(); await espera(pg, 500);
    await pg.getByText('Ver detalle de mis turnos registrados en la app (1)').click(); await espera(pg, 500);
    t = await texto(pg);
    ok(/Pendiente de pago/.test(t) && /Evento Pasado/.test(t), 'con el detalle del turno y su estado de pago');
    await tile(/^Boletas y pagos/).click(); await espera(pg, 800);
    ok(await pg.locator('a[href="/pages/baristas"]').count() === 1, '«Boletas y pagos» lleva al portal de baristas, donde se gestionan');

    /* Vista barista */
    await pulsa(pg, 'Vista barista'); await espera(pg, 1500);
    t = await texto(pg);
    ok(/Administración/.test(t) && !/Familia Reservada/.test(t) && !/Traslado con camioneta/.test(t), '«Vista barista» muestra lo que ve el equipo (sin cliente ni traslados)');
    await captura(pg, 'E8-vista-barista');
    ok(pg.errores.length === 0, 'sin errores en la consola' + (pg.errores.length ? ': ' + pg.errores.join(' · ') : ''));
    await pg.context().close();
  }

  /* ====================================================================== */
  if (corre('F')) {
    console.log('\n=== F. Celular (390 px): nada se sale de la pantalla ===');
    const pg = await nueva(390);
    const sinDesborde = async () => (await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    ok(await sinDesborde(), 'la entrada cabe en el ancho del celular');
    await captura(pg, 'F1-entrada-celular');
    await iniciarSesion(pg, 'ana.prueba', 'otra frase segura 2').catch(() => {});
    if (/Bienvenido al equipo/.test(await texto(pg))) await iniciarSesion(pg, 'ana.prueba', 'mi frase segura 1');
    if (/Bienvenido al equipo/.test(await texto(pg))) await iniciarSesion(pg, 'ana.prueba', claves['ana.prueba']);
    await espera(pg, 800);
    ok(/Hola, Ana/.test(await texto(pg)), 'entra desde el celular');
    ok(await sinDesborde(), 'el inicio cabe en el ancho del celular');
    await captura(pg, 'F2-inicio-celular');
    await pg.getByRole('button', { name: 'Ranking' }).last().click(); await espera(pg, 1200);
    ok(await sinDesborde(), 'el ranking cabe en el ancho del celular');
    await captura(pg, 'F3-ranking-celular');
    await pg.getByRole('button', { name: 'Mi Perfil' }).last().click(); await espera(pg, 1000);
    ok(await sinDesborde(), 'el perfil cabe en el ancho del celular');
    await pg.getByRole('button', { name: 'Sepia' }).last().click(); await espera(pg, 1000);
    ok(await sinDesborde() && /Somos Sepia/.test(await texto(pg)), 'y la historia de Sepia, con sus fotos optimizadas, también');
    await captura(pg, 'F4-sepia-celular');
    await pg.getByRole('button', { name: 'Eventos' }).last().click(); await espera(pg, 800);
    await pg.getByRole('button', { name: 'Ver evento' }).first().click(); await espera(pg, 1000);
    ok(await sinDesborde(), 'el detalle de un evento cabe en el ancho del celular');
    await captura(pg, 'F5-evento-celular');
    ok(pg.errores.length === 0, 'sin errores en la consola' + (pg.errores.length ? ': ' + pg.errores.join(' · ') : ''));
    await pg.context().close();
  }
} finally {
  await navegador.close(); servidor.close(); p.borrar();
}
console.log('\n' + (fallas ? '✘ ' + fallas + ' de ' + total + ' comprobaciones fallaron' : '✔ ' + total + ' comprobaciones pasaron'));
process.exit(fallas ? 1 : 0);
