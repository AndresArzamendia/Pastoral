<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# REGLA OBLIGATORIA: registro de cambios

Después de **cada** cambio que hagas en este proyecto (código, contenido, base de
datos, estilos, despliegue), agrega una entrada al archivo `CAMBIOS.txt` de la
raíz del repositorio.

Requisitos de la entrada:
- Número consecutivo `[Nº]`, empezando en `[1]`, del más reciente al más antiguo.
- Fecha y hora exactas del cambio.
- Título corto del cambio.
- `Realizado por:` con el **nombre de la persona que pide el cambio** (el
  proyecto lo firma la persona, no la herramienta). Ejemplos:
  `Realizado por: Lucas Nuñez` o `Realizado por: Andres Arzamendia(Cambios)`.
  Cuando el cambio lo pida otra persona, se anota su nombre y no el de la
  herramienta.
- Qué se hizo, archivo por archivo, de forma concreta.
- Verificación realizada y resultado.
- Versión del Worker en Cloudflare, si hubo despliegue.

No borres ni edites entradas anteriores.
