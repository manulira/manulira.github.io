/* Sepia: la entrada de la administración, aparte de la del equipo.
   Este código se agrega tal cual al archivo de la interfaz (construir.py), antes de la pantalla de entrada. Usa
   lo que ese archivo ya tiene a mano: D (React), W (los elementos de la pantalla) y Ce (el campo de clave con «Mostrar»).
   Se comunica con las rutas /api/auth/admin/* de assets/sepia-equipo-api.js. */
function sepiaH(etiqueta, propiedades, ...hijos) {
  return (0, W.jsxs)(etiqueta, { ...propiedades, children: hijos });
}

/* «Equipo» | «Administración»: dos formas de entrar, separadas (una misma persona puede trabajar como barista y como administración) */
function SepiaPestanas({ modo, cambiar }) {
  const boton = (id, texto) =>
    sepiaH(`button`, { type: `button`, role: `tab`, "aria-selected": modo === id, className: modo === id ? `active` : ``, onClick: () => cambiar(id) }, texto);
  return sepiaH(`div`, { className: `login-tabs`, role: `tablist`, "aria-label": `Tipo de acceso` }, boton(`equipo`, `Equipo`), boton(`admin`, `Administración`));
}

/* Administración: con un código al correo, o con correo y clave */
function SepiaAdmin({ onSuccess }) {
  const [paso, setPaso] = (0, D.useState)(`elegir`),
    [correo, setCorreo] = (0, D.useState)(``),
    [codigo, setCodigo] = (0, D.useState)(``),
    [clave, setClave] = (0, D.useState)(``),
    [error, setError] = (0, D.useState)(``),
    [ocupado, setOcupado] = (0, D.useState)(false);
  const correoLimpio = correo.trim().toLowerCase();
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoLimpio);

  async function llamar(ruta, cuerpo) {
    setOcupado(true);
    setError(``);
    try {
      const r = await fetch(ruta, { method: `POST`, headers: { "Content-Type": `application/json` }, body: JSON.stringify(cuerpo) });
      const datos = await r.json();
      if (!r.ok) throw Error(datos.error);
      return datos;
    } catch (e) {
      setError(e.message || `No pudimos entrar. Inténtalo de nuevo en un momento.`);
      return null;
    } finally {
      setOcupado(false);
    }
  }
  const ir = (nuevo) => { setError(``); setPaso(nuevo); };
  const campoCorreo = sepiaH(`label`, { className: `billing-field` }, `Correo electrónico`,
    (0, W.jsx)(`input`, { required: true, type: `email`, autoComplete: `username`, inputMode: `email`, autoCapitalize: `none`, spellCheck: `false`, maxLength: 254,
      placeholder: `tucorreo@ejemplo.cl`, value: correo, onChange: (e) => setCorreo(e.target.value) }));
  const alerta = error && sepiaH(`p`, { role: `alert`, className: `form-alert` }, error);
  const volver = sepiaH(`button`, { type: `button`, className: `secondary-btn`, disabled: ocupado, onClick: () => { setClave(``); setCodigo(``); ir(`elegir`); } }, `Volver`);

  if (paso === `elegir`) {
    return sepiaH(`section`, { className: `ops-card ops-form` },
      sepiaH(`p`, null, `Elige cómo quieres entrar.`),
      sepiaH(`button`, { type: `button`, className: `primary-btn`, onClick: () => ir(`pedir-codigo`) }, `Entrar con un código por correo`),
      sepiaH(`button`, { type: `button`, className: `secondary-btn`, onClick: () => ir(`con-clave`) }, `Entrar con correo y clave`),
      sepiaH(`p`, { className: `field-hint` }, `La clave se crea la primera vez que entras con código. Si todavía no la tienes, entra con código.`));
  }
  if (paso === `pedir-codigo`) {
    return sepiaH(`form`, { className: `ops-card ops-form`, onSubmit: async (e) => {
      e.preventDefault();
      if (!correoValido) return setError(`Escribe un correo válido.`);
      if (await llamar(`/api/auth/admin/codigo`, { email: correoLimpio })) ir(`codigo`);
    } },
      sepiaH(`h2`, null, `Entrar con un código`),
      sepiaH(`p`, null, `Te enviamos un código de un solo uso al correo de administración.`),
      campoCorreo, alerta,
      sepiaH(`button`, { className: `primary-btn`, disabled: ocupado }, ocupado ? `Enviando…` : `Enviarme el código`),
      volver);
  }
  if (paso === `codigo`) {
    return sepiaH(`form`, { className: `ops-card ops-form`, onSubmit: async (e) => {
      e.preventDefault();
      if (await llamar(`/api/auth/admin/verificar`, { email: correoLimpio, code: codigo })) onSuccess();
    } },
      sepiaH(`h2`, null, `Revisa tu correo`),
      sepiaH(`p`, null, `Te enviamos un código a ${correoLimpio}. Puede tardar un minuto; mira también en spam.`),
      sepiaH(`label`, { className: `billing-field` }, `Código`,
        (0, W.jsx)(`input`, { required: true, autoComplete: `one-time-code`, inputMode: `numeric`, maxLength: 10, placeholder: `Código del correo`, value: codigo, onChange: (e) => setCodigo(e.target.value) })),
      alerta,
      sepiaH(`button`, { className: `primary-btn`, disabled: ocupado }, ocupado ? `Entrando…` : `Entrar`),
      sepiaH(`button`, { type: `button`, className: `secondary-btn`, disabled: ocupado, onClick: () => { setCodigo(``); ir(`pedir-codigo`); } }, `Pedir otro código`));
  }
  return sepiaH(`form`, { className: `ops-card ops-form`, onSubmit: async (e) => {
    e.preventDefault();
    if (!correoValido) return setError(`Escribe tu correo de administración.`);
    if (await llamar(`/api/auth/admin/clave`, { email: correoLimpio, password: clave })) { setClave(``); onSuccess(); }
  } },
    sepiaH(`h2`, null, `Entrar con correo y clave`),
    sepiaH(`p`, null, `Entra con tu correo y tu clave de administración.`),
    campoCorreo,
    (0, W.jsx)(Ce, { label: `Clave`, value: clave, onChange: setClave, autoComplete: `current-password`, minLength: 1 }),
    alerta,
    sepiaH(`button`, { className: `primary-btn`, disabled: ocupado }, ocupado ? `Ingresando…` : `Iniciar sesión`),
    volver,
    sepiaH(`p`, { className: `field-hint` }, `¿No tienes clave o no la recuerdas? Vuelve y entra con un código por correo.`));
}

/* La primera vez que la administración entra con código: se le pide crear su clave (puede dejarlo para después) */
function sepiaClaveOmitida() {
  try { return sessionStorage.getItem(`sepia-clave-omitida`) === `1`; } catch { return false; }
}
function SepiaCrearClave({ onDone }) {
  const [clave, setClave] = (0, D.useState)(``),
    [repetida, setRepetida] = (0, D.useState)(``),
    [error, setError] = (0, D.useState)(``),
    [ocupado, setOcupado] = (0, D.useState)(false);
  return sepiaH(`section`, { className: `required-profile` },
    sepiaH(`h1`, null, `Crea tu clave de administración`),
    sepiaH(`p`, null, `Entraste con un código por correo. Si creas una clave, la próxima vez podrás elegir: entrar con tu correo y clave, o con un código.`),
    sepiaH(`form`, { className: `ops-form`, onSubmit: async (e) => {
      e.preventDefault();
      setOcupado(true);
      setError(``);
      try {
        const r = await fetch(`/api/auth/admin/crear-clave`, { method: `POST`, headers: { "Content-Type": `application/json` }, body: JSON.stringify({ password: clave, confirm: repetida }) });
        const datos = await r.json();
        if (!r.ok) throw Error(datos.error);
        await onDone();
      } catch (e) {
        setError(e.message || `No pudimos guardar la clave. Inténtalo de nuevo.`);
      } finally {
        setOcupado(false);
      }
    } },
      (0, W.jsx)(Ce, { label: `Clave`, value: clave, onChange: setClave, autoComplete: `new-password`, minLength: 10 }),
      (0, W.jsx)(Ce, { label: `Repite la clave`, value: repetida, onChange: setRepetida, autoComplete: `new-password`, minLength: 10 }),
      sepiaH(`p`, { className: `field-hint` }, `Usa al menos 10 caracteres. Una frase larga y fácil de recordar sirve.`),
      error && sepiaH(`p`, { role: `alert`, className: `form-alert` }, error),
      sepiaH(`button`, { className: `primary-btn`, disabled: ocupado }, ocupado ? `Guardando…` : `Guardar mi clave`)),
    sepiaH(`button`, { type: `button`, className: `secondary-btn`, disabled: ocupado, onClick: async () => {
      try { sessionStorage.setItem(`sepia-clave-omitida`, `1`); } catch {}
      await onDone();
    } }, `Ahora no`),
    sepiaH(`button`, { type: `button`, className: `text-btn`, onClick: q }, `Cerrar sesión`));
}

