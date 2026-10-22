/* Sepia: solicitudes de ingreso y tarjeta amarilla (solo administración).
   Este código se agrega tal cual al archivo de la interfaz (construir.py), junto a parches/entrada.js. Usa lo que ese
   archivo ya tiene a mano: D (React) y W (los elementos de la pantalla). Las acciones van por act(), la misma función
   que usa el resto del panel (POST /api/crew → eq_accion: requestStatus, yellowCard). */

function sepiaE(etiqueta, propiedades, ...hijos) {
  const { key, ...resto } = propiedades || {};
  return (0, W.jsxs)(etiqueta, { ...resto, children: hijos.filter((h) => h !== null && h !== undefined && h !== false) }, key);
}

/* La tarjeta amarilla junto al nombre. La ve solo la administración: al barista nunca le llega el dato. */
function SepiaAmarilla({ yellow }) {
  if (!yellow) return null;
  return sepiaE(`span`, { className: `sepia-amarilla`, title: `Tarjeta amarilla: sus postulaciones esperan confirmación` },
    sepiaE(`span`, { className: `sepia-amarilla-carta`, "aria-hidden": `true` }), `Amarilla`);
}

/* En «Equipo» (administración): cuántos eventos lleva y el botón para poner o quitar la amarilla. */
function SepiaAmarillaBoton({ member, busy, act }) {
  const n = member.eventsWorked || 0;
  const trabajados = n === 1 ? `1 evento trabajado` : `${n} eventos trabajados`;
  /* La administración se confirma sola: ni el aviso ni la amarilla le corresponden. */
  if (member.isAdmin) return sepiaE(`div`, { className: `sepia-amarilla-panel` }, sepiaE(`p`, { className: `field-hint` }, trabajados, ` · administración`));
  return sepiaE(`div`, { className: `sepia-amarilla-panel` },
    sepiaE(`p`, { className: `field-hint` }, trabajados,
      member.yellow || n < 2 ? ` · sus postulaciones esperan confirmación` : null),
    sepiaE(`button`, { type: `button`, className: `secondary-btn`, disabled: busy,
      onClick: () => act(`yellowCard`, { memberId: member.id, on: !member.yellow },
        member.yellow ? `Tarjeta amarilla quitada.` : `Tarjeta amarilla puesta. Sus postulaciones esperarán confirmación.`) },
      member.yellow ? `Quitar amarilla` : `Poner amarilla`));
}

/* «Solicitudes»: las postulaciones de «Trabaja con nosotros», para aprobar o rechazar. Al aprobar se crea su ID y le
   llega un correo con su ID y su clave temporal (lo manda el script de Google). */
function SepiaSolicitudes({ data, busy, act }) {
  const lista = data.requests || [];
  const fecha = (iso) => {
    try { return new Date(iso).toLocaleDateString(`es-CL`, { day: `numeric`, month: `long` }); } catch { return ``; }
  };
  const fila = (titulo, valor) => valor ? sepiaE(`div`, null, sepiaE(`dt`, null, titulo), sepiaE(`dd`, null, String(valor))) : null;
  return sepiaE(`section`, { className: `sepia-solicitudes` },
    sepiaE(`div`, { className: `ops-card` },
      sepiaE(`h2`, null, `Solicitudes para entrar al equipo`),
      sepiaE(`p`, null, lista.length
        ? `Llegan desde la página «Trabaja con nosotros». Si apruebas, se crea su ID y le llega un correo con su ID y su clave para entrar la primera vez.`
        : `No hay solicitudes pendientes.`)),
    sepiaE(`div`, { className: `ops-admin-list` },
      ...lista.map((s) => sepiaE(`article`, { className: `ops-card sepia-solicitud`, key: s.id },
        sepiaE(`h3`, null, s.name),
        sepiaE(`p`, { className: `field-hint` }, `Postuló el ${fecha(s.createdAt)}`),
        sepiaE(`dl`, null,
          fila(`Correo`, s.email), fila(`Teléfono`, s.phone), fila(`Comuna`, s.comuna), fila(`Edad`, s.age), fila(`RUT`, s.rut),
          fila(`Experiencia en barra`, s.experience), fila(`Qué ha preparado`, s.prepared), fila(`Dónde ha trabajado`, s.where),
          fila(`Fines de semana y noche`, s.availability), fila(`Auto`, s.car), fila(`Instagram o CV`, s.social), fila(`Cuéntanos de ti`, s.message)),
        sepiaE(`div`, { className: `ops-actions` },
          sepiaE(`button`, { type: `button`, className: `primary-btn`, disabled: busy,
            onClick: () => act(`requestStatus`, { id: s.id, status: `approved` },
              (r) => `Solicitud aprobada: su ID es ${r && r.usuario ? r.usuario : `nuevo`}. Le llegará un correo con su ID y su clave.`) }, `Aprobar`),
          sepiaE(`button`, { type: `button`, className: `secondary-btn`, disabled: busy,
            onClick: () => { if (confirm(`¿Rechazar la solicitud de ${s.name}?`)) act(`requestStatus`, { id: s.id, status: `rejected` }, `Solicitud rechazada.`); } }, `Rechazar`))))));
}
