/* ============================================================
   DATOS CURIOSOS CATÓLICOS — "Dato del día"
   ============================================================
   EDITABLE EN BLOC DE NOTAS: este archivo ya no guarda los datos
   inline. Todo el contenido vive en  src/data/datosCuriosos.json
   (el "bloc de notas" con la lista ordenada y comentada que puedes
   abrir con el Bloc de Notas de Windows y editar). Este módulo solo
   la expone tipada para el widget y la API.

   Cómo editar: abre  src/data/datosCuriosos.json  con el Bloc de
   Notas, agrega/modifica un objeto dentro del array  [...]  siguiendo
   el formato de los demás (id único, cat, color, ico, title, body,
   src y link) y guarda. Al desplegar, el sitio muestra los nuevos
   datos automáticamente — sin tocar código.

   Fuentes usadas para armar el catálogo: vatican.va (Vatican News,
   Liturgia del día), Catecismo de la Iglesia Católica y documentos
   del Concilio Vaticano II.
   ============================================================ */

import curiosidades from '@/data/datosCuriosos.json';

export interface Curiosity {
  id: string;
  cat: string;
  ico: string;
  color: string;
  title: string;
  body: string;
  src: string;
  link?: string;
  /** Conmemoración litúrgica (día del santo) para resolver su biografía. */
  comm?: string;
  /** Fecha en que se recuerda al santo (subtítulo). */
  day?: string;
}

export const CURIOSITIES: Curiosity[] = curiosidades as Curiosity[];
