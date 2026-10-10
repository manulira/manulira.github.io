# El skill de marca quedó desactualizado

El skill `sepia-coffee-brand` de tu cuenta describe **la identidad anterior**
de la marca:

| El skill decía | Lo que bloqueaste en esta conversación |
|---|---|
| Paleta vino y crema: `#7D4047`, `#F1ECE6`, `#2E2E2E` | Sky Blue `#C8D9E6`, Beige `#F5EFEB`, Navy `#2F4156`, Teal `#567C8D`, Blanco |
| Playfair Display (serif editorial) | Poppins + DM Sans |
| «Sepia Coffee Co» | **sepia coffee**, siempre en minúsculas |
| Un grano de café como punto de la i | El caminante |
| «Nunca azules fríos» | La paleta es azul |

Mientras siga así, cada vez que pidas algo de marca en una conversación nueva
va a salir con la paleta vino: el skill se carga solo y se presenta como la
fuente de verdad.

## Qué hice

Reescribí el archivo en esta sesión, con la identidad correcta, el idioma
(tuteo chileno, nada de voseo), el dato de que tuestan ustedes y el de que no
hay cafetería física. La versión vieja quedó al lado como
`SKILL-v1-respaldo.md`.

**Pero ese archivo está en una carpeta `synced/`**, o sea que se sincroniza
desde tu cuenta. Es muy probable que mi cambio se pierda en la próxima
sincronización.

## Qué tienes que hacer tú

Actualizar el skill en el origen, no en el contenedor:

1. Entra a claude.ai → Configuración → Skills
2. Abre `sepia-coffee-brand`
3. Reemplaza el contenido con el de `ia/skill-marca.md` de este repositorio
4. Guarda

Son dos minutos y te ahorra tener que corregir la paleta cada vez.
