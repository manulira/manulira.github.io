/* Simulación de la librería de Supabase en el navegador, conectada al Postgres de pruebas por el «puente»
   (window.__puente lo expone Playwright). Solo lo que usa assets/sepia-equipo-api.js. */
(function () {
  var LLAVE = 'sepia-baristas-auth';
  var archivos = {};                 // archivos subidos en esta página: «bucket/ruta» → data URL
  var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function leer() { try { return JSON.parse(localStorage.getItem(LLAVE)); } catch (e) { return null; } }
  function claims(s) { return s ? { sub: s.user.id, email: s.user.email, role: 'authenticated', amr: [{ method: 'password' }] } : null; }
  function puente(tipo, datos) { return window.__puente(tipo, datos); }
  function aError(e) { return e ? { message: e.message, code: e.code, status: 400 } : null; }
  function dataUrl(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsDataURL(blob); }); }

  function tabla(nombre) {
    var q = { tabla: nombre, op: 'select', columnas: '*', filtros: [], valores: null, devolver: 'id' };
    var api = {
      select: function (c) { if (q.op === 'update') q.devolver = c; else q.columnas = c; return api; },
      update: function (v) { q.op = 'update'; q.valores = v; return api; },
      eq: function (c, v) { q.filtros.push([c, v]); return api; },
      maybeSingle: function () { return ejecutar(function (d) { return d[0] || null; }); },
      single: function () { return ejecutar(function (d) { return d[0] || null; }); },
      then: function (a, b) { return ejecutar(function (d) { return d; }).then(a, b); }
    };
    function ejecutar(forma) {
      return puente('tabla', { claims: claims(leer()), consulta: q }).then(function (r) {
        return r.error ? { data: null, error: aError(r.error) } : { data: forma(r.data), error: null };
      });
    }
    return api;
  }

  function almacen(bucket) {
    return {
      upload: function (ruta, blob) {
        return puente('objeto', { claims: claims(leer()), op: 'insert', bucket: bucket, nombres: [ruta] }).then(function (r) {
          if (r.error) return { data: null, error: aError(r.error) };
          return dataUrl(blob).then(function (u) { archivos[bucket + '/' + ruta] = u; return { data: { path: ruta }, error: null }; });
        });
      },
      createSignedUrls: function (rutas) {
        return puente('objeto', { claims: claims(leer()), op: 'select', bucket: bucket, nombres: rutas }).then(function (r) {
          if (r.error) return { data: null, error: aError(r.error) };
          return { data: r.data.map(function (n) { return { path: n, signedUrl: archivos[bucket + '/' + n] || PIXEL, error: null }; }), error: null };
        });
      },
      remove: function (rutas) {
        return puente('objeto', { claims: claims(leer()), op: 'delete', bucket: bucket, nombres: rutas }).then(function (r) {
          rutas.forEach(function (n) { delete archivos[bucket + '/' + n]; });
          return r.error ? { data: null, error: aError(r.error) } : { data: r.data, error: null };
        });
      }
    };
  }

  window.__mockSupabase = { llamadas: [] };
  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: function () { var s = leer(); return Promise.resolve({ data: { session: s }, error: null }); },
          signInWithPassword: function (c) {
            return puente('entrar', c).then(function (r) {
              if (r.error) return { data: { session: null, user: null }, error: aError(r.error) };
              var s = { user: r.data, access_token: 'prueba' };
              localStorage.setItem(LLAVE, JSON.stringify(s));
              return { data: { session: s, user: s.user }, error: null };
            });
          },
          signOut: function (o) { if (!o || o.scope !== 'others') localStorage.removeItem(LLAVE); return Promise.resolve({ error: null }); },
          updateUser: function (c) {
            var s = leer(); if (!s) return Promise.resolve({ data: null, error: { message: 'sin sesión' } });
            return puente('clave', { id: s.user.id, clave: c.password }).then(function (r) { return { data: { user: s.user }, error: aError(r.error) }; });
          }
        },
        rpc: function (nombre, args) {
          window.__mockSupabase.llamadas.push(nombre);
          return puente('rpc', { claims: claims(leer()), nombre: nombre, args: args || {} }).then(function (r) {
            return r.error ? { data: null, error: aError(r.error) } : { data: r.data, error: null };
          });
        },
        from: tabla,
        storage: { from: almacen }
      };
    }
  };
})();
