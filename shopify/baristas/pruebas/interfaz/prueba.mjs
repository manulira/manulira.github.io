// Pruebas de la interfaz del portal (assets/sepia-baristas.js) en un navegador real, contra una
// simulación de Supabase (mock-supabase.js). Las reglas de seguridad de verdad se prueban en
// Postgres (rls.sql). Todos los datos son inventados.
//
//   node shopify/baristas/pruebas/interfaz/prueba.mjs
//
// Necesita Playwright: PLAYWRIGHT=/ruta/a/playwright/index.mjs (por defecto el del paquete
// «playwright») y, si el Chromium no es el que descarga Playwright, CHROMIUM=/ruta/al/chromium.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARNES = pathToFileURL(path.join(AQUI, 'arnes.html')).href;
const LIQUID = fs.readFileSync(path.join(AQUI, '..', '..', '..', 'sections', 'sepia-baristas.liquid'), 'utf8');
const CSS = /\{% stylesheet %\}([\s\S]*?)\{% endstylesheet %\}/.exec(LIQUID)[1];
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let fallas = 0, total = 0;
const ok = (c, t) => { total++; if (!c) fallas++; console.log(c ? '  ✔' : '  ✘ FALLA', t); };
const abrir = async (esc, ancho = 1100) => {
  const ctx = await b.newContext({ viewport: { width: ancho, height: 1400 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(e.message)); p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await p.addInitScript(e => { window.__ESC = e; }, esc);
  await p.goto(ARNES);
  await p.addStyleTag({ content: CSS });
  await p.waitForSelector('.sb-cab');
  await p.waitForTimeout(250);
  p.errores = errores; return p;
};
const txt = p => p.innerText('#sc-baristas');
const pulsa = (p, nombre) => p.getByRole('button', { name: nombre }).first().click();
const espera = p => p.waitForTimeout(150);

console.log('\n=== A. Persona nueva: entra con ID y clave, crea su clave, completa su perfil y postula ===');
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sepia-ui-'));
fs.writeFileSync(path.join(tmp, 'foto.png'), png1x1); fs.writeFileSync(path.join(tmp, 'nota.txt'), 'no soy una foto');
let p = await abrir({ usuarios: [
  { usuario: 'camila.perez', clave: 'temporal-123', nombre: 'Camila Pérez González', debeCambiar: true },
  { usuario: 'caro.baja', clave: 'otra-clave-1', nombre: 'Caro Baja', activo: false, debeCambiar: false }] });
let t = await txt(p);
ok(t.includes('Bienvenido al equipo') && t.includes('ID de usuario') && t.includes('Clave') && t.includes('Iniciar sesión'), 'parte en la pantalla de ID y clave');
ok(t.includes('¿Olvidaste tu clave? Escríbele a Manuel'), 'dice a quién pedir una clave nueva');
ok(!t.includes('Matrimonio') && !t.includes('Camino Falso'), 'sin entrar no se ve ningún evento');
await pulsa(p, 'Iniciar sesión'); await espera(p);
ok((await txt(p)).includes('Revisa tu ID'), 'ID vacío → pide revisar el ID');
await p.fill('input[name=usuario]', 'Camila Pérez'); await pulsa(p, 'Iniciar sesión'); await espera(p);
ok((await txt(p)).includes('Revisa tu ID'), 'un ID con espacios o tildes → pide revisarlo');
await p.fill('input[name=usuario]', 'camila.perez'); await pulsa(p, 'Iniciar sesión'); await espera(p);
ok((await txt(p)).includes('Escribe tu clave.'), 'sin clave → la pide');
await p.fill('input[name=clave]', 'mala-clave'); await pulsa(p, 'Iniciar sesión'); await espera(p);
ok((await txt(p)).includes('ID o clave incorrectos'), 'clave mala → «ID o clave incorrectos»');
ok((await p.evaluate(() => window.__signIn[0].email)) === 'camila.perez@equipo.sepiacoffee.cl', 'el ID se convierte en id@equipo.sepiacoffee.cl');
await p.fill('input[name=usuario]', 'CARA.BAJA'.toLowerCase().replace('cara', 'caro')); await p.fill('input[name=clave]', 'otra-clave-1'); await pulsa(p, 'Iniciar sesión'); await espera(p);
ok((await txt(p)).includes('Tu acceso está desactivado'), 'un acceso desactivado lo dice');
await p.fill('input[name=usuario]', 'camila.perez');
ok((await p.getAttribute('input[name=clave]', 'type')) === 'password', 'la clave va oculta');
await pulsa(p, 'Mostrar');
ok((await p.getAttribute('input[name=clave]', 'type')) === 'text', '«Mostrar» la deja a la vista');
await p.fill('input[name=clave]', 'temporal-123'); await pulsa(p, 'Iniciar sesión'); await p.waitForSelector('text=Crea tu clave personal');
ok(true, 'con la clave temporal pide crear la clave personal');
ok(!(await txt(p)).includes('Matrimonio'), 'antes de cambiarla no se ve nada más');

await pulsa(p, 'Guardar clave'); ok((await txt(p)).includes('al menos 8 caracteres'), 'clave vacía o corta → pide 8 caracteres');
await p.fill('input[name=nueva]', 'abcdefgh1'); await p.fill('input[name=repetir]', 'abcdefgh2'); await pulsa(p, 'Guardar clave');
ok((await txt(p)).includes('no son iguales'), 'dos claves distintas → lo avisa');
await p.fill('input[name=nueva]', 'mi-camila.perez-1'); await p.fill('input[name=repetir]', 'mi-camila.perez-1'); await pulsa(p, 'Guardar clave');
ok((await txt(p)).includes('no puede llevar tu ID'), 'una clave que lleva el ID se rechaza');
await p.fill('input[name=nueva]', 'temporal-123'); await p.fill('input[name=repetir]', 'temporal-123'); await pulsa(p, 'Guardar clave'); await espera(p);
ok((await txt(p)).includes('distinta de la que ya tenías'), 'la clave temporal no sirve como clave personal');
await p.fill('input[name=nueva]', 'cafe con leche 2026'); await p.fill('input[name=repetir]', 'cafe con leche 2026'); await pulsa(p, 'Guardar clave'); await p.waitForSelector('text=Completa tu perfil');
ok((await p.evaluate(() => window.__claveCambiada)) === 'cafe con leche 2026' && (await p.evaluate(() => window.__signOut.scope)) === 'others', 'cambia la clave y cierra las sesiones de otros dispositivos');
ok((await p.evaluate(() => window.__DB.accesos.find(a => a.usuario === 'camila.perez').debe_cambiar_clave)) === false, 'y ya no pide cambiarla');
ok((await p.inputValue('form [name=nombre]')) === 'Camila Pérez González', 'el nombre que puso la administración ya viene escrito');
ok(!(await txt(p)).includes('Camino Falso'), 'sin perfil no se ve ningún evento ni dirección');

const f = n => `form [name=${n}]`;
// pegar los datos del banco
await p.getByText('Pegar datos desde mi banco').click();
await p.fill('textarea[aria-label="Datos de transferencia pegados"]', 'hola, esto no tiene datos');
await pulsa(p, 'Rellenar datos'); ok((await txt(p)).includes('No reconocimos los datos'), 'texto sin datos → «No reconocimos los datos»');
await p.fill('textarea[aria-label="Datos de transferencia pegados"]', 'Nombre: Camila Pérez González\nRut: 11.111.111-1\nBanco: Banco de Chile\nTipo de cuenta: Cuenta corriente\nN° de cuenta: 000 123 4567\nCorreo: Camila@Ejemplo.cl');
await pulsa(p, 'Rellenar datos'); await espera(p);
ok((await p.inputValue(f('banco'))) === 'Banco de Chile' && (await p.inputValue(f('tipo_cuenta'))) === 'Cuenta corriente' && (await p.inputValue(f('numero_cuenta'))) === '0001234567'
  && (await p.inputValue(f('rut'))) === '11.111.111-1' && (await p.inputValue(f('correo'))) === 'camila@ejemplo.cl', 'los datos pegados rellenan banco, tipo, cuenta, RUT y correo');
ok((await txt(p)).includes('Revisa los datos antes de guardar'), 'y pide revisarlos antes de guardar');
await p.fill('textarea[aria-label="Datos de transferencia pegados"]', 'BancoEstado CuentaRUT 12.345.678-5');
await pulsa(p, 'Rellenar datos'); await espera(p);
ok((await p.inputValue(f('banco'))) === 'Banco Estado' && (await p.inputValue(f('tipo_cuenta'))) === 'Cuenta RUT' && (await p.inputValue(f('numero_cuenta'))) === '12345678', 'una CuentaRUT toma el número del RUT sin dígito verificador');
await p.fill(f('banco'), ''); await p.selectOption(f('tipo_cuenta'), ''); await p.fill(f('numero_cuenta'), ''); await p.fill(f('rut'), ''); await p.fill(f('correo'), '');

// validaciones del perfil, en orden
await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('Revisa el RUT'), 'sin RUT → lo pide');
await p.fill(f('rut'), '11.111.111-2'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('Revisa el RUT'), 'RUT con dígito malo → se rechaza');
await p.fill(f('rut'), '111111111'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('teléfono válido'), 'RUT bueno → sigue con el teléfono');
await p.fill(f('telefono'), '9 1234 5678'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('correo de contacto válido'), 'pide un correo de contacto');
await p.fill(f('correo'), 'camila@ejemplo.cl'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('Escribe tu comuna'), 'pide la comuna');
await p.fill(f('comuna'), 'Providencia'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('talla de camisa'), 'pide la talla de camisa');
await p.selectOption(f('talla_camisa'), 'M'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('Indica si tienes camioneta'), 'pide indicar si tiene camioneta');
ok((await txt(p)).includes('Tengo camioneta') && (await txt(p)).includes('Postulo como barista sin camioneta'), 'ofrece «Tengo camioneta» y «No tengo camioneta»');
await p.getByText('Tengo camioneta', { exact: true }).click();
await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('Escribe tu banco'), 'pide el banco');
await p.fill(f('banco'), 'Banco Estado'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('tipo de cuenta'), 'pide el tipo de cuenta');
await p.selectOption(f('tipo_cuenta'), 'Cuenta RUT'); await p.fill(f('numero_cuenta'), '12AB');
await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('solo números'), 'cuenta con letras → se rechaza');
await p.fill(f('numero_cuenta'), '9876-5432'); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('a tu nombre y con tu RUT'), 'exige que la cuenta sea suya');
await p.check(f('cuenta_propia')); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('emitir boleta de honorarios'), 'exige declarar la boleta');
ok((await txt(p)).includes('Declaro que puedo emitir boleta de honorarios electrónica'), 'muestra el texto de la declaración tomado de la configuración');
await p.check(f('acepta_boleta')); await pulsa(p, 'Completar perfil'); ok((await txt(p)).includes('aceptas el uso de tus datos'), 'exige aceptar el uso de datos');
// foto de perfil
await p.setInputFiles('input[type=file]', path.join(tmp, 'nota.txt')); await espera(p);
ok((await txt(p)).includes('Usa una foto JPG, PNG o WebP'), 'un archivo que no es imagen se rechaza');
await p.setInputFiles('input[type=file]', path.join(tmp, 'foto.png')); await espera(p); await espera(p);
ok((await p.locator('.sb-foto img').count()) === 1 && (await txt(p)).includes('Cambiar foto'), 'la foto elegida se ve de inmediato y ofrece «Cambiar foto»');
await p.check(f('acepta_privacidad')); await p.check(f('acepta_avisos')); await pulsa(p, 'Completar perfil'); await p.waitForSelector('text=Próximos eventos');
const fila = await p.evaluate(() => window.__DB.baristas.find(x => x.id === 'u-camila.perez'));
ok(fila && fila.rut === '11.111.111-1' && fila.telefono === '+56912345678' && fila.numero_cuenta === '98765432' && fila.correo === 'camila@ejemplo.cl' && fila.acepta_boleta === true && fila.acepta_avisos === true, 'queda guardado con RUT formateado, teléfono +56 y cuenta solo con dígitos');
ok(fila.talla_camisa === 'M' && fila.tiene_camioneta === true && fila.turnos_previos === 0, 'con su talla, su camioneta y 0 turnos previos (eso lo pone la administración)');
ok(/^u-camila\.perez\/foto-\d+\.jpg$/.test(fila.foto_path || '') && Object.keys(await p.evaluate(() => window.__STORAGE)).length === 1, 'la foto se sube a su carpeta y queda en su perfil');

t = await txt(p);
ok(t.includes('Matrimonio en Pirque') && t.includes('Coffee break empresa') && t.includes('Cumpleaños'), 've los 3 eventos abiertos y de hasta 14 días');
ok(!t.includes('Borrador secreto') && !t.includes('Evento pasado'), 'no ve el borrador ni el evento pasado');
ok(!t.includes('Evento lejano'), 'no ve el evento de 40 días: todavía no se abre');
ok(t.includes('Cada evento se abre a la inscripción 14 días antes de su fecha.'), 'le explica que los eventos se abren 14 días antes');
ok(t.includes('MI PRÓXIMO TURNO') && t.includes('Aún no tienes un turno confirmado'), 'arriba dice que aún no tiene turno confirmado');
ok(t.includes('Pago: $50.000 líquidos') && t.includes('boleta de honorarios debe ser por $58.997'), '5 h → $50.000 líquidos y boleta de $58.997');
ok(t.includes('Pago: $25.000 líquidos') && t.includes('$29.499'), '2 h → $25.000 y boleta de $29.499');
ok(t.includes('Pago: $40.000 líquidos') && t.includes('$47.198'), '3 h → $40.000 y boleta de $47.198');
ok(t.includes('retención de 15,25 %'), 'muestra la retención de 15,25 %');
ok(!t.includes('Camino Falso') && !t.includes('Familia Secreta'), 'no ve la dirección exacta ni al cliente');
ok((await txt(p)).includes('camila.perez'), 'la barra dice con qué ID entró');

await p.locator('article', { hasText: 'Matrimonio en Pirque' }).getByRole('button', { name: 'Postular' }).click(); await espera(p);
t = await p.locator('article', { hasText: 'Matrimonio en Pirque' }).innerText();
ok(t.includes('Postulaste') && t.includes('Retirar postulación'), 'postula: queda «Postulaste» y aparece «Retirar postulación»');
await p.locator('article', { hasText: 'Matrimonio en Pirque' }).getByRole('button', { name: 'Retirar postulación' }).click(); await espera(p);
t = await p.locator('article', { hasText: 'Matrimonio en Pirque' }).innerText();
ok(t.includes('Retiraste tu postulación') && t.includes('Postular'), 'retira: vuelve a poder postular');
await p.locator('article', { hasText: 'Matrimonio en Pirque' }).getByRole('button', { name: 'Postular' }).click(); await espera(p);
await p.getByRole('tab', { name: 'Mis postulaciones' }).click(); await espera(p);
ok((await p.locator('article').count()) === 1, '«Mis postulaciones» muestra 1');
await p.getByRole('tab', { name: 'Mis datos' }).click(); await espera(p);
ok((await p.inputValue(f('talla_camisa'))) === 'M' && (await p.locator('input[name=camioneta]:checked').getAttribute('value')) === 'si', '«Mis datos» muestra su talla y su camioneta');
await p.fill(f('comuna'), 'Ñuñoa'); await p.selectOption(f('talla_camisa'), 'L'); await p.getByText('No tengo camioneta', { exact: true }).click(); await pulsa(p, 'Guardar cambios'); await espera(p);
const g = await p.evaluate(() => window.__DB.baristas.find(x => x.id === 'u-camila.perez'));
ok((await txt(p)).includes('guardamos tus datos') && g.comuna === 'Ñuñoa' && g.talla_camisa === 'L' && g.tiene_camioneta === false, '«Mis datos» guarda los cambios, la talla y la camioneta');
ok(!(await p.getByRole('tab', { name: /Admin/ }).count()), 'no ve pestañas de administración');
// foto desde «Mis datos»
const antes = g.foto_path;
await p.setInputFiles('input[type=file]', path.join(tmp, 'foto.png')); await espera(p); await espera(p);
const g2 = await p.evaluate(() => ({ b: window.__DB.baristas.find(x => x.id === 'u-camila.perez'), st: Object.keys(window.__STORAGE) }));
ok(g2.b.foto_path && g2.b.foto_path !== antes && g2.st.length === 1 && g2.st[0] === g2.b.foto_path, 'cambiar la foto sube la nueva y borra la anterior');
await pulsa(p, 'Quitar foto'); await espera(p);
ok((await p.evaluate(() => window.__DB.baristas.find(x => x.id === 'u-camila.perez').foto_path)) === null && Object.keys(await p.evaluate(() => window.__STORAGE)).length === 0, '«Quitar foto» la saca del perfil y del almacenamiento');
// cambiar la clave desde «Mis datos»
await p.fill('input[name=actual]', 'equivocada'); await p.fill('#sb-clave-nueva', 'otra frase larga 77'); await p.fill('#sb-clave-repetir', 'otra frase larga 77');
await p.locator('form.sb-sub').getByRole('button', { name: 'Guardar clave' }).click(); await espera(p);
ok((await txt(p)).includes('La clave actual no es correcta'), 'cambiar la clave pide la actual, y si no es, lo dice');
await p.fill('input[name=actual]', 'cafe con leche 2026');
await p.locator('form.sb-sub').getByRole('button', { name: 'Guardar clave' }).click(); await espera(p); await espera(p);
ok((await txt(p)).includes('cambiamos tu clave') && (await p.evaluate(() => window.__claveCambiada)) === 'otra frase larga 77', 'con la clave actual correcta, la cambia');
p.on('dialog', d => d.accept());
await pulsa(p, 'Borrar mis datos'); await p.waitForSelector('text=Completa tu perfil');
ok((await p.evaluate(() => window.__DB.baristas.length + window.__DB.postulaciones.length)) === 0, '«Borrar mis datos» elimina perfil y postulaciones (el acceso sigue)');
await pulsa(p, 'Salir'); await espera(p);
ok((await p.evaluate(() => window.__signOut.scope)) === 'local' && (await txt(p)).includes('Bienvenido al equipo'), '«Salir» cierra solo esta sesión, no las de otros dispositivos');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

console.log('\n=== A2. Administración entra con código por correo; una cuenta sin acceso no ve nada ===');
p = await abrir({ nuevoId: 'u-extraño' });
await pulsa(p, 'Soy administración'); await espera(p);
ok((await txt(p)).includes('Administración') && (await txt(p)).includes('código de un solo uso'), '«Soy administración» ofrece el código por correo');
await p.fill('input[name=correo]', 'sinacceso@ejemplo.cl'); await pulsa(p, 'Enviarme el código'); await espera(p);
ok((await txt(p)).includes('no tiene acceso de administración') && (await p.evaluate(() => window.__otp)) === undefined || (await p.evaluate(() => window.__otp.options.shouldCreateUser)) === false, 'un correo desconocido no puede crear una cuenta nueva por el código');
await p.fill('input[name=correo]', 'admin@ejemplo.cl'); await pulsa(p, 'Enviarme el código'); await espera(p);
ok((await p.evaluate(() => window.__otp.options.shouldCreateUser)) === false, 'el código nunca crea cuentas nuevas');
await p.fill('input[name=codigo]', '000000'); await pulsa(p, 'Entrar'); await espera(p);
ok((await txt(p)).includes('no es válido'), 'código malo → mensaje');
await p.fill('input[name=codigo]', '123456'); await pulsa(p, 'Entrar'); await espera(p); await espera(p);
ok((await txt(p)).includes('Tu cuenta no tiene acceso') && !(await txt(p)).includes('Matrimonio'), 'una cuenta que no es administración ni barista ve «Tu cuenta no tiene acceso» y ningún evento');
await pulsa(p, 'Volver').catch(() => {});
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

console.log('\n=== B. Barista registrada: lo ajeno no se ve; al confirmarla ve la dirección ===');
const perfil = { nombre: 'Ana Prueba', rut: '12.345.678-5', telefono: '+56987654321', comuna: 'Vitacura', experiencia: null, banco: 'BCI', tipo_cuenta: 'Cuenta vista', numero_cuenta: '55556666' };
p = await abrir({ sesion: { id: 'u-ana', email: 'ana@ejemplo.cl' }, perfilPropio: perfil, otraBarista: true }, 390);
t = await txt(p);
ok(t.includes('Próximos eventos') && !t.includes('Otra') && !t.includes('Familia Secreta') && !t.includes('Camino Falso'), 've eventos, pero ni a otros baristas, ni al cliente, ni la dirección');
ok((await p.evaluate(() => window.__xss)) === undefined, 'un nombre con HTML se muestra como texto (nada se ejecuta)');
await p.locator('article', { hasText: 'Matrimonio en Pirque' }).getByRole('button', { name: 'Postular' }).click(); await espera(p);
await p.evaluate(() => { window.__DB.postulaciones.find(x => x.barista_id === 'u-ana').estado = 'confirmada'; });
await pulsa(p, 'Actualizar'); await espera(p);
t = await p.locator('article', { hasText: 'Matrimonio en Pirque' }).innerText();
ok(t.includes('Asignado: falta que confirmes') && t.includes('Dirección: Camino Falso 123') && t.includes('Portón verde'), 'asignada → ve la dirección y las indicaciones');
ok(t.includes('Te asignamos a este evento') && t.includes('Confirmo que voy'), 'y le pide confirmar que va');
await p.locator('article', { hasText: 'Matrimonio en Pirque' }).getByRole('button', { name: 'Confirmo que voy' }).click(); await espera(p);
t = await p.locator('article', { hasText: 'Matrimonio en Pirque' }).innerText();
ok(t.includes('Asistencia confirmada') && !t.includes('Confirmo que voy') && !t.includes('Te asignamos a este evento'), 'confirma: queda «Asistencia confirmada» y desaparece el pedido');
ok(!!(await p.evaluate(() => window.__DB.postulaciones.find(x => x.barista_id === 'u-ana').asistencia_confirmada_en)), 'y queda guardada la reconfirmación');
ok(!(await txt(p)).includes('Familia Secreta'), 'y aun así no ve el nombre del cliente');
const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
ok(ancho <= 392, `en el teléfono no hay scroll horizontal (ancho ${ancho}px)`);
await p.screenshot({ path: path.join(os.tmpdir(), 'sepia-movil-eventos.png'), fullPage: true });
await p.context().close();

console.log('\n=== C. Administración ===');
p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, otraBarista: true });
ok((await p.getByRole('tab').allInnerTexts()).join('|') === 'Admin: seguimiento|Admin: eventos|Admin: postulantes|Admin: pagos|Admin: accesos|Ranking', 've solo las pestañas de administración (con seguimiento primero) y el ranking');
await p.getByRole('tab', { name: 'Admin: eventos' }).click(); await espera(p);
t = await txt(p);
ok(t.includes('Borrador secreto') && t.includes('Cliente: Familia Secreta'), 've borradores y el cliente');
ok(t.includes('Evento lejano') && /Todavía no lo ven los baristas: se abre el .* \(en 26 días\)\./.test(t), 'el evento de 40 días aparece con «Todavía no lo ven los baristas: se abre … (en 26 días)»');
ok(/Abierto a los baristas desde el /.test(t), 'y los de menos de 14 días dicen desde cuándo están abiertos');
await p.getByRole('tab', { name: 'Admin: postulantes' }).click(); await espera(p);
await p.locator('details', { hasText: 'Matrimonio en Pirque' }).locator('summary').click();
ok((await p.evaluate(() => window.__xss)) === undefined && (await txt(p)).includes('<img src=x'), 'el nombre con HTML aparece como texto, sin ejecutarse');
await p.locator('details', { hasText: 'Matrimonio en Pirque' }).getByRole('button', { name: 'Confirmar' }).click(); await espera(p);
ok((await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 'p-otra').estado)) === 'confirmada', 'confirma a la postulante');
ok((await p.locator('details', { hasText: 'Matrimonio en Pirque' }).innerText()).includes('1 de 2 confirmados'), 'el contador pasa a «1 de 2 confirmados»');
await p.getByRole('tab', { name: 'Admin: pagos' }).click(); await espera(p);
t = await txt(p);
ok(t.includes('Total') && t.includes('$50.000') && t.includes('$58.997') && t.includes('faltan 1'), 'resumen: líquido $50.000, boleta $58.997 y «faltan 1»');
ok(t.includes('11.111.111-1') && t.includes('Cuenta RUT 11111111'), 'lista a quién transferir, con RUT y cuenta');
await p.evaluate(() => { window.__DB.baristas[0].nombre = '=HYPERLINK("http://x")'; });
await p.getByRole('tab', { name: 'Admin: eventos' }).click(); await p.getByRole('tab', { name: 'Admin: pagos' }).click(); await espera(p);
const [dl] = await Promise.all([p.waitForEvent('download'), pulsa(p, 'Descargar transferencias')]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
ok(csv.charCodeAt(0) === 0xFEFF && csv.includes('"Monto líquido a transferir"') && csv.includes('"50000"') && csv.includes('"\'=HYPERLINK'), 'CSV con BOM, montos y fórmula neutralizada');

await p.getByRole('tab', { name: 'Admin: eventos' }).click(); await espera(p);
await pulsa(p, 'Nuevo evento'); await espera(p);
await p.fill('form [name=nombre]', 'Evento prueba'); await p.fill('form [name=fecha]', '2030-01-15');
await p.fill('form [name=hora_inicio]', '10:00'); await p.fill('form [name=hora_fin]', '12:00'); await p.fill('form [name=comuna]', 'Lo Barnechea');
ok((await txt(p)).includes('Dura 2 h → paga $25.000 líquidos'), 'la vista previa calcula 2 h → $25.000');
await p.fill('form [name=hora_fin]', '15:30');
ok((await txt(p)).includes('Dura 5,5 h') && (await txt(p)).includes('$55.000'), '5,5 h → $55.000');
await p.fill('form [name=hora_fin]', '20:00');
ok((await txt(p)).includes('Dura 10 h → paga $70.000 líquidos') && (await txt(p)).includes('tope diario de $70.000') && (await txt(p)).includes('sin tope serían $100.000'), '10 h → se recorta a $70.000 y avisa el tope');
await p.fill('form [name=pago_manual]', '90000');
ok((await txt(p)).includes('paga $90.000 líquidos') && !(await txt(p)).includes('tope diario'), 'con pago fijo de $90.000 no se recorta');
await p.fill('form [name=pago_manual]', ''); await p.fill('form [name=hora_fin]', '15:30');
await p.fill('form [name=direccion]', 'Calle Nueva 45'); await p.fill('form [name=cliente]', 'Cliente Nuevo');
await pulsa(p, 'Guardar evento'); await espera(p); await espera(p);
const nuevo = await p.evaluate(() => ({ ev: window.__DB.eventos.find(x => x.nombre === 'Evento prueba'), dir: window.__DB.evento_direcciones.find(x => x.direccion === 'Calle Nueva 45'), priv: window.__DB.evento_privado.find(x => x.cliente === 'Cliente Nuevo') }));
ok(nuevo.ev && nuevo.ev.estado === 'borrador' && nuevo.dir && nuevo.priv, 'crea el evento como borrador, con su dirección y su cliente aparte');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

console.log('\n=== D. Seguimiento: semáforo, reconfirmación, checklist y cierre ===');
p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, seguimiento: true });
const pestanas = await p.getByRole('tab').allInnerTexts();
ok(pestanas[0] === 'Admin: seguimiento (2)', `la pestaña avisa 2 alertas → «${pestanas[0]}»`);
ok((await p.getByRole('tab', { selected: true }).innerText()).startsWith('Admin: seguimiento'), 'y es la que se abre primero');
t = await txt(p);
ok(t.includes('2 alertas') && t.includes('Seg A 3 días sin baristas') && t.includes('Faltan 2 baristas por asignar · quedan 3 días'), 'arriba se listan las alertas: faltan baristas a 3 días');
ok(t.includes('Seg E pasado 10 días') && t.includes('cierre atrasado'), 'y el cierre atrasado');
const tar = n => p.locator('article', { hasText: n });
let tx = await tar('Seg A').innerText();
ok(tx.includes('ALERTA') && tx.includes('Asignados 0 de 2'), 'A (3 días, sin baristas): ALERTA');
tx = await tar('Seg B').innerText();
ok(tx.includes('Pendiente') && tx.includes('1 asignado sin reconfirmar') && tx.includes('quedan 10 días'), 'B (10 días, sin reconfirmar): Pendiente, aún hay tiempo');
tx = await tar('Seg C').innerText();
ok(tx.includes('OK') && tx.includes('Todo en orden'), 'C (cupos completos y reconfirmado): OK');
const hrefWa = await tar('Seg B').getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
ok(/^https:\/\/wa\.me\/56922223333\?text=/.test(hrefWa) && decodeURIComponent(hrefWa).includes('Hola Bea'), 'botón de WhatsApp con el teléfono y el mensaje');

await tar('Seg B').getByRole('button', { name: 'Marcar reconfirmado' }).click(); await espera(p); await espera(p);
ok(!!(await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 's1').asistencia_confirmada_en)), 'marcar reconfirmado guarda la reconfirmación');
tx = await tar('Seg B').innerText();
ok(tx.includes('OK') && tx.includes('Todo en orden'), 'y B pasa a OK');

await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (x) => { window.__copiado = x; return Promise.resolve(); } }, configurable: true }); });
await tar('Seg B').getByRole('button', { name: /Copiar teléfonos/ }).click(); await espera(p);
ok((await p.evaluate(() => window.__copiado)) === 'Bea Prueba: +56922223333' && (await tar('Seg B').innerText()).includes('Teléfonos copiados'), 'copia los teléfonos de los asignados para el grupo de WhatsApp');

tx = await tar('Seg C').innerText();
ok(tx.includes('Checklist: 0 de 5') && tx.includes('Grupo de WhatsApp creado') && tx.includes('Cliente confirmó hora y lugar'), 'checklist de 5 puntos');
await tar('Seg C').getByLabel('Grupo de WhatsApp creado').check(); await espera(p);
ok((await tar('Seg C').innerText()).includes('Checklist: 1 de 5') && (await p.evaluate(() => !!(window.__DB.evento_seguimiento.find(x => x.evento_id === 'e13') || { checklist: {} }).checklist.grupo_whatsapp)), 'marcar un punto lo guarda y actualiza el contador');
await tar('Seg C').getByLabel('Grupo de WhatsApp creado').uncheck(); await espera(p);
ok((await tar('Seg C').innerText()).includes('Checklist: 0 de 5') && (await p.evaluate(() => !(window.__DB.evento_seguimiento.find(x => x.evento_id === 'e13') || { checklist: {} }).checklist.grupo_whatsapp)), 'desmarcarlo lo quita');

tx = await tar('Seg D').innerText();
ok(tx.includes('Por cerrar') && tx.includes('Falta: documento al cliente, 1 boleta de honorarios, 1 pago') && tx.includes('fue hace 3 días') && !tx.includes('cierre atrasado'), 'D (hace 3 días): por cerrar, aún sin atraso, con lo que falta');
tx = await tar('Seg E').innerText();
ok(tx.includes('ALERTA') && tx.includes('cierre atrasado'), 'E (hace 10 días): ALERTA, cierre atrasado');
const cardD = tar('Seg D');
await cardD.locator('input[name=bol_fecha]').fill('2026-10-18'); await cardD.locator('input[name=bol_folio]').fill('B-77');
p.once('dialog', d => d.accept());
await cardD.getByRole('button', { name: 'Marcar pagado' }).click(); await espera(p); await espera(p);
const hoyChile = await p.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()));
const post3 = await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 's3'));
ok(post3.boleta_honorarios_folio === 'B-77' && post3.boleta_honorarios_recibida_en === '2026-10-18' && post3.honorarios_pagados_en === hoyChile, '«Marcar pagado» guarda boleta, folio y la fecha de hoy');
tx = await tar('Seg D').innerText();
ok(tx.includes('pagado') && tx.includes('Falta: documento al cliente') && !tx.includes('1 boleta'), 'D ahora solo espera el documento al cliente');
await tar('Seg D').locator('input[name=doc_fecha]').fill('2026-10-19'); await tar('Seg D').locator('input[name=doc_folio]').fill('F-20');
await tar('Seg D').getByRole('button', { name: 'Guardar documento' }).click(); await espera(p); await espera(p);
const docD = await p.evaluate(() => window.__DB.evento_seguimiento.find(x => x.evento_id === 'e14'));
ok(docD && docD.documento_cliente_folio === 'F-20' && docD.documento_cliente_emitido_en === '2026-10-19', 'guarda el documento al cliente con su folio');
ok((await p.locator('article', { hasText: 'Seg D pasado' }).count()) === 0, 'con todo registrado, D sale de «Por cerrar»');
ok((await txt(p)).includes('2 eventos ya cerrados'), 'y se cuenta entre los cerrados (2)');

await p.getByRole('tab', { name: 'Admin: pagos' }).click(); await espera(p);
let tp = await txt(p);
ok(/Bea Prueba[^\n]*\$120\.000/.test(tp), 'pagos: Bea suma sus 3 eventos ($120.000)');
await p.getByLabel(/Mostrar solo lo que falta pagar/).check(); await espera(p);
tp = await txt(p);
ok(/Bea Prueba[^\n]*\$40\.000/.test(tp) && !/Bea Prueba[^\n]*\$120\.000/.test(tp), 'con «solo lo que falta pagar» Bea baja a $40.000 (solo el evento sin pagar)');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();


console.log('\n=== E. Barista: después del evento, avisa su boleta y ve el pago ===');
p = await abrir({ sesion: { id: 'u-ana', email: 'ana@ejemplo.cl' }, perfilPropio: perfil, despues: true });
t = await txt(p);
ok(t.includes('Tienes 2 cosas pendientes') && t.includes('Confirma que vas a «Futuro asignado»') && t.includes('Avísanos cuando emitas tu boleta de honorarios de «Pasado sin boleta»'), 'en «Eventos» un aviso lista lo pendiente: reconfirmar y la boleta');
await pulsa(p, 'Ir a mis postulaciones'); await espera(p);
const ca = n => p.locator('article', { hasText: n });
tx = await ca('Pasado sin boleta').innerText();
ok(tx.includes('Para que te paguemos: tu boleta de honorarios') && tx.includes('por $47.198') && tx.includes('te quedan $40.000') && tx.includes('Ya emití mi boleta de honorarios'), 'después del evento: pide la boleta, con el monto de $47.198');
tx = await ca('Pasado boleta enviada').innerText();
ok(tx.includes('Boleta enviada: la estamos revisando') && tx.includes('folio B-5') && !tx.includes('Ya emití'), 'si ya avisó, ve «Boleta enviada» y no el botón');
tx = await ca('Pasado pagado').innerText();
ok(tx.includes('Pago recibido') && tx.includes('$40.000 líquidos') && !tx.includes('Ya emití'), 'si ya se pagó, ve «Pago recibido»');
tx = await ca('Futuro asignado').innerText();
ok(!tx.includes('boleta de honorarios') || !tx.includes('Ya emití'), 'un evento que aún no pasa no pide la boleta');
let negado = false; p.once('dialog', d => { negado = true; d.dismiss(); });
await ca('Pasado sin boleta').locator('input[name=folio]').fill('B-99');
await ca('Pasado sin boleta').getByRole('button', { name: 'Ya emití mi boleta de honorarios' }).click(); await espera(p);
ok(negado && (await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 't1').boleta_declarada_en)) === null, 'si cancela el diálogo, no se guarda nada');
p.once('dialog', d => d.accept());
await ca('Pasado sin boleta').getByRole('button', { name: 'Ya emití mi boleta de honorarios' }).click(); await espera(p); await espera(p);
const t1 = await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 't1'));
ok(!!t1.boleta_declarada_en && t1.boleta_declarada_folio === 'B-99', 'al confirmar, queda declarada con su folio');
tx = await ca('Pasado sin boleta').innerText();
ok(tx.includes('Boleta enviada: la estamos revisando') && tx.includes('folio B-99'), 'y la tarjeta cambia a «Boleta enviada»');
await p.getByRole('tab', { name: 'Eventos' }).click(); await espera(p);
ok((await txt(p)).includes('Tienes 1 cosa pendiente') && !(await txt(p)).includes('Pasado sin boleta'), 'el aviso baja a 1 pendiente');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

console.log('\n=== F. Administración: boleta declarada, un clic para pagar, eventos por revisar y última lectura ===');
p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, cierre: true });
t = await txt(p);
ok(t.includes('Calendario leído el ') && t.includes('20 eventos de servicio') && t.includes('nuevos 2, con cambios 1, cancelados 0'), 'arriba dice cuándo se leyó el calendario y qué cambió');
ok(!t.includes('Hace más de un día'), 'una lectura de hace 3 horas no preocupa');
ok(t.includes('1 evento espera que revises sus datos'), 'avisa cuántos eventos esperan revisión');
tx = await tar('Cierre con boleta declarada').innerText();
ok(tx.includes('boleta declarada: revisar en el SII') && tx.includes('Avisó que emitió su boleta el') && tx.includes('folio B-77') && tx.includes('Revísala en el SII'), 'el cierre muestra que Bea declaró su boleta, con folio');
const bea = tar('Cierre con boleta declarada').locator('.sb-postulante', { hasText: 'Bea Prueba' });
const caro = tar('Cierre con boleta declarada').locator('.sb-postulante', { hasText: 'Caro Prueba' });
ok((await caro.innerText()).includes('falta la boleta'), 'Caro sigue en «falta la boleta»');
ok((await bea.locator('input[name=bol_folio]').inputValue()) === 'B-77', 'el folio declarado ya viene escrito para guardarlo');
let confirmaTxt = '';
p.once('dialog', d => { confirmaTxt = d.message(); d.dismiss(); });
await bea.getByRole('button', { name: 'Marcar pagado' }).click(); await espera(p);
ok(confirmaTxt.includes('revisaste la boleta en el SII') && confirmaTxt.includes('$40.000') && confirmaTxt.includes('Bea Prueba') && confirmaTxt.includes('aviso por correo'), 'antes de pagar pide confirmar: SII, monto, nombre y el aviso por correo');
ok((await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 'q1').honorarios_pagados_en)) === null, 'si cancela, no se registra el pago');
p.once('dialog', d => d.accept());
await bea.getByRole('button', { name: 'Marcar pagado' }).click(); await espera(p); await espera(p);
const hoyCL = await p.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()));
const q1 = await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 'q1'));
ok(q1.honorarios_pagados_en === hoyCL && q1.boleta_honorarios_recibida_en === hoyCL && q1.boleta_honorarios_folio === 'B-77', 'un clic: pagado hoy, boleta recibida hoy y folio B-77');
ok((await tar('Cierre con boleta declarada').locator('.sb-postulante', { hasText: 'Bea Prueba' }).innerText()).includes('pagado'), 'Bea queda «pagado»');
ok((await tar('Cierre con boleta declarada').locator('.sb-postulante', { hasText: 'Bea Prueba' }).getByRole('button', { name: 'Marcar pagado' }).count()) === 0, 'y ya no ofrece pagar de nuevo');
// eventos por revisar
tx = await tar('Servicio de barra · Por confirmar').innerText();
ok(tx.includes('Por revisar (viene del calendario)') && tx.includes('Falta el lugar en el calendario'), 'el evento del calendario con datos dudosos aparece «Por revisar» con el motivo');
await tar('Servicio de barra · Por confirmar').getByRole('button', { name: 'Ya lo revisé' }).click(); await espera(p); await espera(p);
const rev = await p.evaluate(() => window.__DB.evento_seguimiento.find(x => x.evento_id === 'e32'));
ok(rev.revisar === false && rev.revisar_motivo === null, '«Ya lo revisé» quita la marca');
ok(!(await txt(p)).includes('espera que revises') && !(await txt(p)).includes('esperan que revises'), 'y el aviso de arriba desaparece');
await p.getByRole('tab', { name: 'Admin: eventos' }).click(); await espera(p);
ok(!(await txt(p)).includes('Por revisar'), 'en «Admin: eventos» tampoco queda marcado');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, cierre: true, syncViejo: true, syncAdvertencia: 'El calendario llegó vacío: no se canceló nada.' });
t = await txt(p);
ok(t.includes('Hace más de un día que no se lee') && t.includes('Atención: El calendario llegó vacío'), 'si el calendario no se lee hace más de un día, avisa que revise Apps Script; y muestra la advertencia');
await p.context().close();
p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, sinSync: true });
ok((await txt(p)).includes('El calendario todavía no se ha leído'), 'sin ninguna lectura, lo dice');
await p.context().close();
p = await abrir({ sesion: { id: 'u-ana', email: 'ana@ejemplo.cl' }, perfilPropio: perfil, despues: true });
ok(!(await txt(p)).includes('Calendario leído'), 'una barista no ve nada de la lectura del calendario');
await p.context().close();


console.log('\n=== G. Barista: próximo turno, equipo, camioneta, ranking y ganancias ===');
const perfilAna = { nombre: 'Ana Prueba', rut: '11.111.111-1', telefono: '+56911110001', comuna: 'Vitacura', experiencia: null, banco: 'BCI', tipo_cuenta: 'Cuenta vista', numero_cuenta: '11110001', tiene_camioneta: true, talla_camisa: 'M', foto_path: null, turnos_previos: 0 };
p = await abrir({ sesion: { id: 'u-ana', email: 'ana.prueba@equipo.sepiacoffee.cl' }, perfilPropio: perfilAna, equipo: true });
t = await txt(p);
ok(t.includes('MI PRÓXIMO TURNO') && /MI PRÓXIMO TURNO[\s\S]*Evento con equipo/.test(t), 'arriba muestra su próximo turno: el evento con equipo');
tx = await p.locator('article', { hasText: 'Evento con equipo' }).innerText();
ok(tx.includes('Tu equipo en este evento') && tx.includes('Ana Prueba (tú)') && tx.includes('Bea Prueba') && tx.includes('Caro Prueba'), 'el evento muestra a su equipo, con ella marcada «(tú)»');
ok((await p.locator('article', { hasText: 'Evento con equipo' }).locator('.sb-equipo .sb-avatar img').count()) === 1, 'solo Bea tiene foto: se ve su foto y las otras dos van con iniciales');
ok((await p.locator('article', { hasText: 'Evento con equipo' }).locator('.sb-equipo .sb-avatar', { hasText: 'AP' }).count()) === 1, 'Ana va con sus iniciales «AP»');
ok(!tx.includes('Necesita camioneta'), 'un evento sin camioneta no lo dice');
tx = await p.locator('article', { hasText: 'Evento con camioneta' }).innerText();
ok(tx.includes('Necesita camioneta') && tx.includes('Conductor con camioneta'), 'el evento que necesita camioneta lo dice y marca a la conductora');
ok(tx.includes('Traslado con camioneta: $11.100') && tx.includes('40 km · bencina $5.600 · TAG y peajes $3.500 · estacionamiento $2.000'), 'a la conductora le muestra su reembolso: 40 km, bencina $5.600, TAG $3.500 y estacionamiento $2.000');
ok(tx.includes('reembolso aparte de tus honorarios'), 'y que es aparte de los honorarios');
ok(!(await p.locator('article', { hasText: 'Evento con equipo' }).innerText()).includes('Traslado con camioneta'), 'el reembolso aparece solo en el evento donde es conductora');

await p.getByRole('tab', { name: 'Ranking' }).click(); await p.waitForSelector('.sb-ranking');
t = await txt(p);
ok(t.includes('Ranking del equipo') && t.includes('3 baristas en el equipo') && t.includes('18 participaciones registradas'), 'el ranking cuenta 3 baristas y 18 participaciones (con los 12 turnos previos de Caro)');
const filasRank = await p.locator('.sb-ranking__fila').allInnerTexts();
ok(filasRank.length === 3 && /^1\s+CP\s+Caro Prueba\s+13 turnos/.test(filasRank[0].replace(/\n/g, ' ')) && /^2\s+AP\s+Ana Prueba \(tú\)\s+3 turnos/.test(filasRank[1].replace(/\n/g, ' ')) && /^3\s+Bea Prueba|^3\s+BP\s+Bea Prueba/.test(filasRank[2].replace(/\n/g, ' ')),
  'ordenado: 1.º Caro con 13, 2.º Ana (tú) con 3 y 3.º Bea con 2');
ok(/\(tú\)/.test(await p.locator('.sb-ranking__fila--yo').innerText()), 'su fila va destacada');
await p.fill('#sb-buscar', 'bea'); await espera(p);
ok((await p.locator('.sb-ranking__fila').count()) === 1, 'buscar «bea» deja solo a Bea');
await p.fill('#sb-buscar', 'zzz'); await espera(p);
ok((await txt(p)).includes('No encontramos ese nombre'), 'una búsqueda sin resultados lo dice');
await p.fill('#sb-buscar', '');
await p.selectOption('#sb-periodo', { index: 1 }); await espera(p); await espera(p);
ok(!(await txt(p)).includes('13 turnos'), 'un mes no incluye los turnos previos al portal');
const llamadas = await p.evaluate(() => window.__rpc.filter(x => x === 'ranking_equipo').length);
ok(llamadas >= 2, 'cambiar el período vuelve a pedir el ranking');

await p.getByRole('tab', { name: 'Mis ganancias' }).click(); await espera(p);
t = await txt(p);
ok(t.includes('Mis turnos y ganancias') && t.includes('Solo tú y la administración pueden ver estos montos'), 'muestra «Mis turnos y ganancias» como privado');
const datos = await p.locator('.sb-dato').allInnerTexts();
ok(datos.map(x => x.replace(/\n/g, ' ')).join('|') === 'Turnos registrados 3|Próximos turnos 2|Pagado por Sepia $0|Pendiente de pago $120.000', 'resumen: 3 turnos registrados, 2 próximos, $0 pagado y $120.000 pendiente (3 eventos de $40.000)');
ok(t.includes('Reembolsos de camioneta: $0 pagados · $11.100 pendientes') && t.includes('no son honorarios'), 'los reembolsos van aparte y dicen que no son honorarios');
ok((await p.locator('.sb-tabla tbody tr').count()) === 3 && (await p.locator('.sb-tabla tbody').innerText()).includes('Falta tu boleta'), 'la tabla lista sus 3 eventos trabajados, con su estado');
await p.evaluate(() => { const x = window.__DB.postulaciones.find(q => q.id === 'x6'); x.honorarios_pagados_en = new Date().toISOString().slice(0, 10); x.boleta_declarada_en = new Date().toISOString(); });
await p.getByRole('tab', { name: 'Eventos' }).click(); await p.getByRole('tab', { name: 'Mis ganancias' }).click(); await espera(p);
ok((await p.locator('.sb-dato').allInnerTexts()).map(x => x.replace(/\n/g, ' ')).join('|').includes('Pagado por Sepia $40.000|Pendiente de pago $80.000'), 'al registrarse un pago, pasa de pendiente a pagado');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

console.log('\n=== H. Administración: accesos del equipo ===');
p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, accesosAdmin: true });
await p.getByRole('tab', { name: 'Admin: accesos' }).click(); await espera(p);
t = await txt(p);
ok(t.includes('Accesos del equipo') && t.includes('4 personas en el equipo'), 'la pestaña lista a las 4 personas del equipo');
const tarjA = n => p.locator('article', { hasText: n });
ok((await tarjA('Camila Pérez').innerText()).includes('Aún no entra') && (await tarjA('Bea Prueba').innerText()).includes('Perfil completo')
  && (await tarjA('Caro Prueba').innerText()).includes('Desactivado') && (await tarjA('Dani Prueba').innerText()).includes('Falta completar el perfil'), 'cada acceso muestra su estado: aún no entra, perfil completo, desactivado y falta el perfil');
await p.fill('#sb-na-nombre', 'María José Soto Rojas');
ok((await p.inputValue('#sb-na-usuario')) === 'maria.soto', 'al escribir el nombre se sugiere el ID: maria.soto');
await p.fill('#sb-na-usuario', 'Ab'); await pulsa(p, 'Crear acceso'); await espera(p);
ok((await txt(p)).includes('El ID debe tener de 3 a 30 caracteres'), 'un ID corto se rechaza');
await p.fill('#sb-na-usuario', 'bea.prueba'); await pulsa(p, 'Crear acceso'); await espera(p);
ok((await txt(p)).includes('Ese ID ya existe'), 'un ID repetido se rechaza');
await p.fill('#sb-na-usuario', 'maria.soto'); await pulsa(p, 'Crear acceso'); await espera(p); await espera(p);
t = await txt(p);
ok(t.includes('Acceso creado: María José Soto Rojas') && t.includes('maria.soto') && t.includes('abcd-efgh-jkmn') && t.includes('Se muestran una sola vez'), 'crea el acceso y muestra el ID y la clave temporal una sola vez');
const hrefWa2 = await p.getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href');
ok(/^https:\/\/wa\.me\/\?text=/.test(hrefWa2) && decodeURIComponent(hrefWa2).includes('ID: maria.soto') && decodeURIComponent(hrefWa2).includes('Clave temporal: abcd-efgh-jkmn') && decodeURIComponent(hrefWa2).includes('Hola María,'), 'el enlace de WhatsApp lleva el mensaje listo con ID y clave');
await pulsa(p, 'Copiar mensaje'); await espera(p);
ok((await txt(p)).includes('Mensaje copiado') || (await p.locator('.sb-caja--clave textarea').inputValue()).includes('Clave temporal: abcd-efgh-jkmn'), 'copiar el mensaje funciona (o deja el texto a mano)');
ok((await p.evaluate(() => window.__DB.accesos.some(a => a.usuario === 'maria.soto' && a.debe_cambiar_clave))) && (await tarjA('María José').innerText()).includes('Aún no entra'), 'queda en la lista como «Aún no entra»');
await pulsa(p, 'Ya guardé los datos'); await espera(p);
ok(!(await txt(p)).includes('abcd-efgh-jkmn'), '«Ya guardé los datos» oculta la clave');
await p.fill('#sb-na-nombre', 'Camila Pérez');
ok((await p.inputValue('#sb-na-usuario')) === 'camila.perez2', 'si el ID sugerido ya existe, sugiere otro');
p.on('dialog', d => d.accept());
await tarjA('Camila Pérez González').getByRole('button', { name: 'Restablecer clave' }).click(); await espera(p); await espera(p);
ok((await txt(p)).includes('Clave restablecida: Camila Pérez González') && (await txt(p)).includes('wxyz-2345-mnpq'), 'restablecer la clave muestra una clave temporal nueva');
await pulsa(p, 'Ya guardé los datos');
await tarjA('Bea Prueba').getByRole('button', { name: 'Desactivar acceso' }).click(); await espera(p); await espera(p);
ok((await tarjA('Bea Prueba').innerText()).includes('Desactivado') && (await tarjA('Bea Prueba').getByRole('button', { name: 'Restaurar acceso' }).count()) === 1, 'desactivar un acceso lo marca y ofrece restaurarlo');
await tarjA('Bea Prueba').getByRole('button', { name: 'Restaurar acceso' }).click(); await espera(p); await espera(p);
ok((await tarjA('Bea Prueba').innerText()).includes('Perfil completo'), 'restaurarlo lo deja como antes');
await tarjA('Bea Prueba').getByText('Datos privados de contacto y pago').click();
tx = await tarjA('Bea Prueba').innerText();
ok(tx.includes('+56922223333') && tx.includes('12.345.678-5') && tx.includes('Camioneta') && tx.includes('Talla de camisa') && tx.includes('Cuenta vista 22223333'), 'la administración ve los datos privados: teléfono, RUT, camioneta, talla y cuenta');
await tarjA('Bea Prueba').locator('input[name=turnos_previos]').fill('9');
await tarjA('Bea Prueba').getByRole('button', { name: 'Guardar' }).click(); await espera(p); await espera(p);
ok((await p.evaluate(() => window.__DB.baristas.find(b => b.id === 'u-bea').turnos_previos)) === 9, 'puede anotar los turnos de antes del portal');
await tarjA('Dani Prueba').getByRole('button', { name: 'Eliminar' }).click(); await espera(p); await espera(p);
ok((await tarjA('Dani Prueba').count()) === 0 && !(await p.evaluate(() => window.__DB.accesos.some(a => a.usuario === 'dani.prueba'))), 'eliminar borra el acceso de la lista y de la base');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

console.log('\n=== I. Administración: camioneta, asistencia y reembolsos ===');
p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, equipo: true });
await p.getByRole('tab', { name: 'Admin: eventos' }).click(); await espera(p);
const tarjE = n => p.locator('article', { hasText: n });
ok((await tarjE('Evento con camioneta').innerText()).includes('Necesita camioneta') && (await tarjE('Evento con camioneta').innerText()).includes('40 km'), 'el evento muestra que necesita camioneta y sus 40 km');
await tarjE('Evento con camioneta').getByRole('button', { name: 'Editar' }).click(); await espera(p);
ok(await p.locator('form input[name=requiere_camioneta]').isChecked() && (await p.inputValue('#sb-km')) === '40' && (await p.inputValue('#sb-tag')) === '3500', 'al editarlo trae la camioneta marcada, 40 km y $3.500 de TAG');
ok((await txt(p)).includes('Bencina = 40 km ÷ 10 km/l × $1.400/l = $5.600. Reembolso estimado: $9.100'), 'la vista previa calcula bencina $5.600 y reembolso $9.100');
await p.fill('#sb-km', '50');
ok((await txt(p)).includes('= $7.000. Reembolso estimado: $10.500'), 'con 50 km: bencina $7.000 y reembolso $10.500');
await p.fill('#sb-km', '5000'); await pulsa(p, 'Guardar evento'); await espera(p);
ok((await txt(p)).includes('entre 0 y 3.000'), 'kilómetros fuera de rango → se rechazan');
await p.fill('#sb-km', '50'); await pulsa(p, 'Guardar evento'); await espera(p); await espera(p);
ok((await p.evaluate(() => window.__DB.evento_traslado.find(x => x.evento_id === 'e42').km)) === 50, 'guarda los kilómetros del traslado');
await pulsa(p, 'Nuevo evento'); await espera(p);
await p.fill('form [name=nombre]', 'Evento con carrito'); await p.fill('form [name=fecha]', '2031-02-01'); await p.fill('form [name=hora_inicio]', '10:00'); await p.fill('form [name=hora_fin]', '14:00'); await p.fill('form [name=comuna]', 'Colina');
await p.check('form input[name=requiere_camioneta]'); await p.fill('#sb-km', '30.5'); await p.fill('#sb-tag', '2000');
await pulsa(p, 'Guardar evento'); await espera(p); await espera(p);
const nuevoEv = await p.evaluate(() => { const e = window.__DB.eventos.find(x => x.nombre === 'Evento con carrito'); return { e, t: window.__DB.evento_traslado.find(x => e && x.evento_id === e.id) }; });
ok(nuevoEv.e && nuevoEv.e.requiere_camioneta === true && nuevoEv.t && nuevoEv.t.km === 30.5 && nuevoEv.t.tag === 2000, 'un evento nuevo guarda «necesita camioneta» y su traslado');
await p.getByText('Ajustes de traslado con camioneta').click();
await p.fill('#sb-rend', '12'); await p.fill('#sb-precio', '1500'); await pulsa(p, 'Guardar ajustes'); await espera(p);
ok((await txt(p)).includes('guardamos los ajustes') && (await p.evaluate(() => window.__DB.config[0].rendimiento_km_l === 12 && window.__DB.config[0].precio_litro === 1500)), 'los ajustes de rendimiento y precio del litro se guardan');
await p.fill('#sb-rend', '0'); await pulsa(p, 'Guardar ajustes'); await espera(p);
ok((await txt(p)).includes('mayor que 0'), 'un rendimiento de 0 se rechaza');
await p.evaluate(() => { const c = window.__DB.config[0]; c.rendimiento_km_l = 10; c.precio_litro = 1400; });

await p.getByRole('tab', { name: 'Admin: postulantes' }).click(); await espera(p);
await p.locator('details', { hasText: 'Evento con equipo' }).locator('summary').first().click();
const detEq = p.locator('details', { hasText: 'Evento con equipo' }).first();
ok((await detEq.innerText()).includes('Talla M') && (await detEq.innerText()).includes('Tiene camioneta') && (await detEq.innerText()).includes('Sin camioneta'), 'en postulantes se ve la talla y quién tiene camioneta');
ok((await detEq.getByRole('button', { name: 'Asignar como conductor' }).count()) === 2, 'solo quienes declararon camioneta (Ana y Bea) ofrecen «Asignar como conductor»; Caro no');
await detEq.locator('.sb-postulante', { hasText: 'Bea Prueba' }).getByRole('button', { name: 'Asignar como conductor' }).click(); await espera(p); await espera(p);
ok((await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 'x2').conductor)) === true, 'Bea queda como conductora');
const detEq2 = p.locator('details', { hasText: 'Evento con equipo' }).first();
await detEq2.locator('.sb-postulante', { hasText: 'Ana Prueba' }).getByRole('button', { name: 'Asignar como conductor' }).click(); await espera(p); await espera(p);
const conductores = await p.evaluate(() => window.__DB.postulaciones.filter(x => x.evento_id === 'e41' && x.conductor).map(x => x.id));
ok(conductores.length === 1 && conductores[0] === 'x1', 'al asignar a Ana, Bea deja de ser conductora: hay una sola por evento');
// asistencia
const detPasado = p.locator('details', { hasText: 'Pasado tres' }).first();
if (!(await detPasado.evaluate(e => e.open))) await detPasado.locator('summary').first().click();
ok((await detPasado.innerText()).includes('Asistió') && (await detPasado.innerText()).includes('No asistió'), 'en un evento pasado se ve quién asistió y quién no');
await detPasado.locator('.sb-postulante', { hasText: 'Bea Prueba' }).getByRole('button', { name: 'Asistió' }).click(); await espera(p); await espera(p);
ok((await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 'x12').asistio)) === true, 'se puede corregir: Bea pasa a «Asistió»');
await p.getByRole('tab', { name: 'Ranking' }).click(); await p.waitForSelector('.sb-ranking');
ok((await txt(p)).includes('Bea Prueba') && /3 baristas en el equipo/.test(await txt(p)), 'la administración también ve el ranking');

await p.getByRole('tab', { name: 'Admin: pagos' }).click(); await espera(p);
t = await txt(p);
ok(t.includes('Reembolsos de camioneta') && t.includes('Ana Prueba · Evento con camioneta'), 'en «Admin: pagos» aparece el reembolso de la conductora');
const totalTxt = await p.locator('article', { hasText: 'Ana Prueba · Evento con camioneta' }).innerText();
ok(/Total \$12\.500/.test(totalTxt), 'el total del reembolso es $12.500: 50 km → bencina $7.000, TAG $3.500 y estacionamiento $2.000');
await p.locator('article', { hasText: 'Ana Prueba · Evento con camioneta' }).locator('input[name=estacionamiento]').fill('3000');
await p.locator('article', { hasText: 'Ana Prueba · Evento con camioneta' }).getByRole('button', { name: 'Guardar estacionamiento' }).click(); await espera(p); await espera(p);
ok(/Total \$13\.500/.test(await p.locator('article', { hasText: 'Ana Prueba · Evento con camioneta' }).innerText()), 'con $3.000 de estacionamiento el total sube a $13.500');
let msgPago = '';
p.once('dialog', d => { msgPago = d.message(); d.dismiss(); });
await p.locator('article', { hasText: 'Ana Prueba · Evento con camioneta' }).getByRole('button', { name: 'Registrar reembolso pagado' }).click(); await espera(p);
ok(msgPago.includes('$13.500') && msgPago.includes('no transfiere dinero') && (await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 'x4').traslado_pagado_en)) === null, 'antes de registrar el pago pide confirmar el monto y aclara que no transfiere dinero');
p.once('dialog', d => d.accept());
await p.locator('article', { hasText: 'Ana Prueba · Evento con camioneta' }).getByRole('button', { name: 'Registrar reembolso pagado' }).click(); await espera(p); await espera(p);
ok(!!(await p.evaluate(() => window.__DB.postulaciones.find(x => x.id === 'x4').traslado_pagado_en)) && (await p.locator('article', { hasText: 'Ana Prueba · Evento con camioneta' }).innerText()).includes('pagado'), 'al confirmar, el reembolso queda pagado');

await p.getByRole('tab', { name: /Admin: seguimiento/ }).click(); await espera(p);
ok((await p.locator('article', { hasText: 'Evento con camioneta' }).first().innerText()).includes('Camioneta: Ana Prueba'), 'en seguimiento, el evento con camioneta muestra quién la lleva');
await p.evaluate(() => { const x = window.__DB.postulaciones.find(q => q.id === 'x4'); x.conductor = false; });
await p.getByRole('tab', { name: 'Admin: eventos' }).click(); await p.getByRole('tab', { name: /Admin: seguimiento/ }).click(); await espera(p);
ok((await p.locator('article', { hasText: 'Evento con camioneta' }).first().innerText()).includes('Necesita camioneta: falta asignar al conductor'), 'si no hay conductor, seguimiento avisa que falta asignarlo');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

console.log('\n=== J. Historial anterior al portal: ranking, ganancias y administración ===');
// Las fechas del historial se calculan desde hoy (en Santiago) para que la prueba no caduque.
const hoyJ = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const [anioJ, mesJ] = hoyJ.split('-').map(Number);
const dMes = (atras, dia) => new Date(Date.UTC(anioJ, mesJ - 1 - atras, dia)).toISOString().slice(0, 10);
const historialAna = [
  { nombre: 'Ana Prueba', fecha: dMes(11, 5) }, { nombre: 'ana  PRUEBA', fecha: dMes(6, 10) }, { nombre: 'Ana Prueba', fecha: dMes(13, 17) },
  { nombre: 'Bea Prueba', fecha: dMes(11, 9) }, { nombre: 'Bea Prueba', fecha: dMes(11, 20) },
  { nombre: 'Tomás Herrera', fecha: dMes(5, 1) }, { nombre: 'Elio Aravena', fecha: dMes(4, 1) }];
p = await abrir({ sesion: { id: 'u-ana', email: 'ana.prueba@equipo.sepiacoffee.cl' }, perfilPropio: perfilAna, equipo: true, historial: historialAna });
await p.getByRole('tab', { name: 'Ranking' }).click(); await p.waitForSelector('.sb-ranking');
t = await txt(p);
const filasJ = (await p.locator('.sb-ranking__fila').allInnerTexts()).map(x => x.replace(/\n/g, ' '));
ok(filasJ.length === 3 && /Caro Prueba\s+13 turnos/.test(filasJ[0]) && /Ana Prueba \(tú\)\s+6 turnos/.test(filasJ[1]) && /Bea Prueba\s+4 turnos/.test(filasJ[2]),
  'el acumulado suma historial y portal: Caro 13 (12 previos + 1), Ana 6 (3 del historial + 3), Bea 4 (2 + 2)');
ok(t.includes('23 participaciones registradas'), 'cuenta 23 participaciones en total');
ok(!t.includes('Tomás Herrera') && !t.includes('Elio Aravena'), 'quienes están en el historial pero no tienen acceso no aparecen en el ranking');
ok((await p.locator('#sb-periodo option').count()) === 13, 'el selector ofrece el acumulado y los últimos 12 meses');
await p.selectOption('#sb-periodo', { index: 12 }); await espera(p); await espera(p);
const filasMes = (await p.locator('.sb-ranking__fila').allInnerTexts()).map(x => x.replace(/\n/g, ' '));
ok(filasMes.length === 3 && /^1\s+BP?\s*Bea Prueba\s+2 turnos|^1\s+Bea Prueba\s+2 turnos/.test(filasMes[0]) && /^2\s+AP\s+Ana Prueba \(tú\)\s+1 turno$/.test(filasMes[1]) && /^3\s+CP\s+Caro Prueba\s+0 turnos/.test(filasMes[2]),
  'un mes de hace 11 meses cuenta solo los turnos de ese mes: Bea 2, Ana 1, Caro 0');
ok((await txt(p)).includes('cada mes cuenta solo los turnos de ese mes'), 'la nota explica cómo cuenta el acumulado y los meses');
await p.getByRole('tab', { name: 'Mis ganancias' }).click(); await espera(p);
ok((await p.locator('.sb-dato').allInnerTexts()).map(x => x.replace(/\n/g, ' ')).join('|').startsWith('Turnos registrados 6|'), 'Mis ganancias: 6 turnos registrados (3 del historial + 3 del portal)');
ok((await txt(p)).includes('incluyen 3 turnos del historial de Sepia anterior al portal'), 'y dice cuántos vienen del historial');
const resumenAna = await p.evaluate(() => window.__rpc.filter(x => x === 'historial_resumen').length);
ok(resumenAna >= 1 && ((await p.evaluate(() => JSON.stringify(window.__DB.historial_turnos.filter(x => x.acceso_id === 'u-ana').length))) === '3'), 'los 3 turnos del historial quedaron unidos a Ana por su nombre (aunque uno estaba escrito «ana  PRUEBA»)');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

// Barista sin historial: Mis ganancias no menciona el historial
p = await abrir({ sesion: { id: 'u-ana', email: 'ana.prueba@equipo.sepiacoffee.cl' }, perfilPropio: perfilAna, equipo: true, historial: [{ nombre: 'Tomás Herrera', fecha: dMes(5, 1) }] });
await p.getByRole('tab', { name: 'Mis ganancias' }).click(); await espera(p);
ok(!(await txt(p)).includes('del historial de Sepia') && (await p.locator('.sb-dato').first().innerText()).includes('3'), 'sin historial propio, Mis ganancias queda como antes (3 turnos) y no lo menciona');
await p.context().close();

// Administración
const historialAdm = [
  { nombre: 'Bea Prueba', fecha: dMes(3, 2) }, { nombre: 'Bea Prueba', fecha: dMes(3, 9) }, { nombre: 'Dani Prueba', fecha: dMes(2, 4) },
  { nombre: 'Francisco Gallardo', fecha: dMes(5, 7) }, { nombre: 'Francisco Gallardo', fecha: dMes(5, 21) }, { nombre: 'Francisco Gallardo', fecha: dMes(4, 3) },
  { nombre: 'Tomás Herrera', fecha: dMes(5, 1) }, { nombre: 'Tomás Herrera', fecha: dMes(4, 2) },
  { nombre: 'Camila Gonzalez', fecha: dMes(6, 1) }, { nombre: 'Camila Gonzalez', fecha: dMes(6, 8) }, { nombre: 'Camila Gonzalez', fecha: dMes(5, 8) }, { nombre: 'Camila Gonzalez', fecha: dMes(4, 8) }];
p = await abrir({ sesion: { id: 'u-admin', email: 'admin@ejemplo.cl' }, admin: true, accesosAdmin: true, historial: historialAdm });
await p.getByRole('tab', { name: 'Admin: accesos' }).click(); await espera(p);
const resumenAdm = p.locator('summary', { hasText: 'Historial anterior al portal: 12 turnos' });
ok((await resumenAdm.count()) === 1, 'Admin: accesos resume el historial: 12 turnos');
await resumenAdm.click(); await espera(p);
t = await txt(p);
ok(t.includes('3 turnos unidos a un acceso y 9 turnos de personas sin acceso todavía'), 'dice cuántos turnos ya están unidos a un acceso (los de Bea y Dani) y cuántos no');
ok(t.includes('Francisco Gallardo · 3 turnos') && t.includes('Tomás Herrera · 2 turnos') && t.includes('Camila Gonzalez · 4 turnos'), 'lista a quienes no tienen acceso, con sus turnos');
ok((await p.locator('#sb-na-lista option').count()) === 3, 'el campo «nombre» del formulario ofrece esos 3 nombres para elegir');
ok((await p.locator('article', { hasText: 'Bea Prueba' }).locator('summary', { hasText: 'Historial anterior al portal: 2 turnos' }).count()) === 1
  && (await p.locator('article', { hasText: 'Dani Prueba' }).locator('summary', { hasText: 'Historial anterior al portal: 1 turno' }).count()) === 1, 'Bea y Dani quedaron unidas solas por su nombre: 2 y 1 turnos');

// Unir a mano: Camila (el historial dice «Camila Gonzalez», el acceso «Camila Pérez González»: no calzan solos)
const tarCamila = p.locator('article', { hasText: 'Camila Pérez González' });
await tarCamila.locator('summary', { hasText: 'Historial anterior al portal: 0 turnos' }).click(); await espera(p);
await tarCamila.getByRole('button', { name: 'Vincular historial' }).click(); await espera(p);
ok((await txt(p)).includes('Elige primero el nombre del historial'), 'sin elegir nombre, pide elegirlo');
ok((await tarCamila.locator('select option').allInnerTexts()).join('|').includes('Camila Gonzalez · 4 turnos'), 'el selector ofrece «Camila Gonzalez · 4 turnos»');
await tarCamila.locator('select').selectOption({ label: 'Camila Gonzalez · 4 turnos' });
await tarCamila.getByRole('button', { name: 'Vincular historial' }).click(); await espera(p); await espera(p);
ok((await p.evaluate(() => window.__DB.historial_turnos.filter(x => x.acceso_id === 'u-camila').length)) === 4, 'al vincular, los 4 turnos quedan unidos al acceso de Camila');
ok((await p.locator('article', { hasText: 'Camila Pérez González' }).locator('summary', { hasText: 'Historial anterior al portal: 4 turnos' }).count()) === 1, 'y su tarjeta pasa a mostrar 4 turnos');
ok((await p.locator('summary', { hasText: 'Historial anterior al portal: 12 turnos' }).count()) === 1, 'el total no cambia (12)');

// Desvincular
const tarBea = p.locator('article', { hasText: 'Bea Prueba' });
await tarBea.locator('summary', { hasText: 'Historial anterior al portal' }).click(); await espera(p);
let msgDes = ''; p.once('dialog', d => { msgDes = d.message(); d.accept(); });
await tarBea.getByRole('button', { name: 'Desvincular' }).click(); await espera(p); await espera(p);
ok(msgDes.includes('dejan de contar para Bea Prueba') && (await p.evaluate(() => window.__DB.historial_turnos.filter(x => x.nombre === 'Bea Prueba' && x.acceso_id === null).length)) === 2, 'desvincular pide confirmar y suelta los 2 turnos de Bea');

// Crear un acceso con un nombre del historial lo une solo
await p.fill('#sb-na-nombre', 'francisco gallardo'); await espera(p);
ok((await p.inputValue('#sb-na-usuario')) === 'francisco.gallardo', 'el ID se sugiere solo: francisco.gallardo');
await pulsa(p, 'Crear acceso'); await espera(p); await espera(p);
ok((await p.evaluate(() => window.__DB.historial_turnos.filter(x => x.acceso_id === 'u-francisco.gallardo').length)) === 3, 'al crear el acceso de «francisco gallardo», sus 3 turnos del historial quedan unidos solos');
ok((await p.locator('article', { hasText: 'Francisco Gallardo' }).locator('summary', { hasText: 'Historial anterior al portal: 3 turnos' }).count()) === 1, 'y su tarjeta lo muestra');
await p.getByRole('tab', { name: 'Ranking' }).click(); await p.waitForSelector('.sb-ranking');
t = await txt(p);
ok(/francisco gallardo\s*3 turnos/i.test(t) && /Camila Pérez González\s*4 turnos/.test(t), 'en el ranking figuran Francisco y Camila, aunque todavía no completan su perfil, por sus turnos del historial');
ok(!t.includes('Tomás Herrera'), 'quien sigue sin acceso (Tomás) no figura');
// Nombre completo en el acceso, nombre y primer apellido en el historial
await p.getByRole('tab', { name: 'Admin: accesos' }).click(); await espera(p);
await p.fill('#sb-na-nombre', 'Tomás Herrera Pérez'); await espera(p);
await pulsa(p, 'Crear acceso'); await espera(p); await espera(p);
ok((await p.evaluate(() => window.__DB.historial_turnos.filter(x => x.nombre === 'Tomás Herrera' && x.acceso_id === 'u-tomas.herrera').length)) === 2, 'un acceso «Tomás Herrera Pérez» se une solo al historial «Tomás Herrera» (2 turnos)');
ok(p.errores.length === 0, 'sin errores en la consola' + (p.errores.length ? ': ' + p.errores[0] : ''));
await p.context().close();

await b.close();
console.log(`\n${total - fallas} de ${total} comprobaciones pasaron`);
process.exit(fallas ? 1 : 0);
