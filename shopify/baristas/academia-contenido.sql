-- Contenido inicial de la Academia (Jorge, 24 oct). Correr DESPUÉS de esquema.sql y equipo.sql. Solo agrega lo que falta
-- (por título), así que se puede correr de nuevo sin duplicar. Las medidas de los tragos son las de Sepia (Jorge):
-- 1 jigger = la medida del jigger de Sepia. Los datos de las botellas se revisaron en Difford's Guide, Wikipedia,
-- Britannica, la SCA y las fichas de Jumbo.cl (24 oct). Los videos se verificaron en YouTube ese día.
-- Las fotos de cada trago real las sube la administración desde la app (Academia → Editar).

insert into public.academia (tipo, titulo, resumen, cuerpo, ingredientes, pasos, video_url, orden)
select v.tipo, v.titulo, v.resumen, v.cuerpo, v.ingredientes, v.pasos, v.video_url, v.orden
from (values
  ('trago', 'Espresso Martini',
   'El trago estrella de Sepia: café, Kahlúa y vodka, bien agitado y con espuma.',
   $t$Lo creó el bartender Dick Bradsell en Londres, en los años 80, cuando una clienta le pidió algo que la despertara. Primero se llamó «Vodka Espresso»; el nombre «Espresso Martini» se impuso a fines de los 90.

La clave es el café recién hecho y agitar fuerte: así se forma la capa de espuma de arriba.$t$,
   '["1 jigger de Kahlúa", "1 jigger de vodka", "1 jigger de café espresso recién hecho"]'::jsonb,
   '["Prepara el espresso justo antes, para que esté fresco.", "En la coctelera pon 1 jigger de Kahlúa, 1 de vodka y 1 de espresso.", "Llena la coctelera con hielo, ciérrala bien y agita fuerte unos 10 a 15 segundos.", "Cuela a la copa fría, ojalá con colador doble, para que quede liso y con espuma.", "Sirve al tiro."]'::jsonb,
   'https://www.youtube.com/watch?v=1E4VPCGm8hc', 10),
  ('trago', 'Carajillo',
   'Licor 43 y café en partes iguales, con hielo: corto, dulce y con mucho café.',
   $t$Viene de España, donde era un café con un poco de licor que se tomaba en los bares de barrio. En México se hizo muy popular desde los 2000 con espresso, Licor 43 y hielo.

Se puede servir «puesto» (el café encima del licor, en capas) o «shakeado» (agitado con hielo y colado), que deja una espuma suave.$t$,
   '["1 jigger de Licor 43", "1 jigger de café espresso recién hecho"]'::jsonb,
   '["Llena el vaso con hielo.", "Sirve 1 jigger de Licor 43.", "Prepara 1 jigger de espresso recién hecho.", "Puesto: vierte el espresso despacio sobre el licor. Shakeado: agita licor y espresso con hielo en la coctelera y cuela al vaso con hielo.", "Sirve al tiro."]'::jsonb,
   'https://www.youtube.com/watch?v=DM6ar6ncbeA', 20),
  ('botella', 'Kahlúa',
   'Licor de café mexicano: ron, café arábica, azúcar y vainilla.',
   $t$Origen
Nació en 1936 en Veracruz, México. El nombre viene del náhuatl y significa «casa del pueblo acolhua». Desde 2005 es de Pernod Ricard y se sigue haciendo en México.

Qué tiene y cómo es
Se hace con ron de caña, café 100 % arábica de Veracruz, azúcar de caña y vainilla. La botella que se vende en Chile tiene 16° (en otros países, 20°). Es dulce, huele a café recién molido y en boca deja chocolate amargo, vainilla y un final a moca.

En Sepia es la base del Espresso Martini.$t$,
   '[]'::jsonb, '[]'::jsonb, null, 30),
  ('botella', 'Licor 43',
   'Licor español de Cartagena, hecho con 43 ingredientes. La base del Carajillo.',
   $t$Origen
Es de Cartagena, en Murcia, España. La familia Zamora empezó a producirlo en 1946 y la empresa (Diego Zamora) sigue siendo familiar.

Qué tiene y cómo es
Se llama «43» porque lleva 43 ingredientes: hierbas, especias y cítricos del Mediterráneo. La receta es secreta; se sabe que tiene naranja, limón, vainilla, entre otros. Tiene 31°. Es dulce, con mucha vainilla, toques de cacao y especias suaves, y termina a toffee.

En Sepia es la base del Carajillo.$t$,
   '[]'::jsonb, '[]'::jsonb, null, 40),
  ('botella', 'Vodka',
   'Destilado neutro: pone el alcohol y el cuerpo sin tapar el café.',
   $t$Origen
Viene de Polonia y Rusia (los dos países dicen haberlo inventado). La palabra aparece escrita por primera vez en Polonia en 1405 y significa algo así como «agüita».

Qué tiene y cómo es
Se destila de cereales o de papa (hoy también de maíz, caña o frutas), se filtra y se rebaja con agua; no se envejece. Lo normal es 40°. Es transparente y casi sin olor ni sabor.

En el Espresso Martini se usa justamente por eso: da fuerza y cuerpo, y deja que el café y el Kahlúa se luzcan.$t$,
   '[]'::jsonb, '[]'::jsonb, null, 50),
  ('botella', 'Café espresso',
   'Café corto y concentrado, hecho a presión. Sin un buen espresso no hay buen trago.',
   $t$Qué es
Un espresso se hace pasando agua caliente a presión por café molido fino y bien compactado. Se prepara para cada trago y se usa al tiro.

Valores de referencia (no son receta de Sepia)
Unos 18 g de café para sacar unos 36 g de espresso, en 25 a 30 segundos, a unos 9 bar de presión.

La crema
Es la capa de espuma dorada de arriba. Se forma con el gas del café recién molido. Un café molido hace tiempo casi no hace crema: por eso se muele justo antes.$t$,
   '[]'::jsonb, '[]'::jsonb, null, 60),
  ('video', 'Espresso Martini, paso a paso (Kahlúa)',
   'Video oficial de Kahlúa, con la misma proporción de Sepia: 1 de vodka, 1 de Kahlúa y 1 de espresso. En inglés, 2 minutos.',
   null, '[]'::jsonb, '[]'::jsonb, 'https://www.youtube.com/watch?v=1E4VPCGm8hc', 70),
  ('video', 'Dick Bradsell, el creador del Espresso Martini',
   'El bartender que inventó el trago lo prepara él mismo y cuenta su historia. En inglés, 4 minutos.',
   null, '[]'::jsonb, '[]'::jsonb, 'https://www.youtube.com/watch?v=eqO-S-1PHzo', 80),
  ('video', 'Cómo preparar un Carajillo',
   'En español: la versión agitada y la versión directa, con Licor 43 y espresso en partes iguales. 4 minutos.',
   null, '[]'::jsonb, '[]'::jsonb, 'https://www.youtube.com/watch?v=DM6ar6ncbeA', 90)
) v(tipo, titulo, resumen, cuerpo, ingredientes, pasos, video_url, orden)
where not exists (select 1 from public.academia a where lower(a.titulo) = lower(v.titulo));
