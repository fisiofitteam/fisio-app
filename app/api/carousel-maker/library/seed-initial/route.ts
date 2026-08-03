/**
 * Endpoint admin que carga los 3 carruseles de referencia iniciales que el
 * CEO pegó al arrancar el módulo. Solo actúa si la biblioteca está vacía —
 * no duplica. Ejecutable a mano desde el navegador logueado como CEO.
 *
 * GET /api/carousel-maker/library/seed-initial
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { parseCarouselText } from "@/lib/carousel-maker/parse";

type Seed = { topic: string; category: string; raw: string };

const SEEDS: Seed[] = [
  {
    topic: "Errores por los que sigues con dolor de hombro",
    category: "errores",
    raw: `Slide 1
Esto es lo que está haciendo que sigas con dolor de hombro.

Y probablemente ni siquiera te hayas dado cuenta.

Slide 2
❌ Vives en el "voy a probar"

Cada entrenamiento es una moneda al aire.

"Hoy voy a probar dominadas."

"Hoy voy a probar push press."

"Hoy voy a probar si ya puedo hacer muscle ups."

No estás tomando decisiones.

Estás improvisando.

Slide 3
❌ Buscas que alguien te quite el dolor...

...en lugar de preguntarte por qué sigue apareciendo.

Masajes.

Punción.

Electrólisis.

Infiltraciones.

Todo puede ayudarte a sentirte mejor un rato.

Pero si tu hombro sigue recibiendo exactamente el mismo estímulo que lo irrita, nada cambia.

Slide 4
❌ Tu tratamiento empieza y termina en una camilla.

Pero casi nunca revisas:

• cómo empujas una barra.

• cómo recibes un snatch.

• cómo estabilizas el hombro overhead.

• cómo te cuelgas de la barra.

El movimiento casi siempre forma parte de la solución.

Slide 5
❌ Crees que entrenar más fuerte hará que tu hombro se acostumbre.

Entonces haces una de estas dos cosas:

👉 Lo evitas todo.

o

👉 Vuelves exactamente al mismo volumen que antes.

Y ninguna de las dos ayuda.

El hombro necesita progresión, no impulsos.

Slide 6
❌ Dejas que el dolor decida cada entrenamiento.

Si hoy no molesta...

lo haces todo.

Si hoy molesta...

cancelas media sesión.

Así es imposible que tu hombro se adapte.

Necesita un criterio.

No un estado de ánimo.

Slide 7
❌ Confundes sentirte bien con estar recuperado.

Hay días que no duele.

Y piensas:

"Ya está solucionado."

Pero una cosa es que el dolor desaparezca...

y otra muy distinta que tu hombro vuelva a tolerar las exigencias del crosstraining.

Slide 8
La mayoría de atletas no siguen con dolor porque tengan una lesión muy grave.

Siguen con dolor porque llevan meses...

tomando decisiones que mantienen vivo el problema.

Cuando cambias la forma de afrontar la recuperación,

empieza a cambiar el resultado.

Slide 9
¿En cuál te has visto reflejado?

Déjamelo en comentarios.

Tengo curiosidad por saber cuál es el error que más se repite.`,
  },
  {
    topic: "Caso Anna: hombro y rodilla en competición",
    category: "caso_clinico",
    raw: `Slide 1 – Gancho (ANTES)
"¿Te imaginas tener varias competiciones… y no saber si vas a poder hacerlas por el dolor?"

Slide 2 – Problema (ANTES)
Anna llevaba meses con dolor en el hombro y la rodilla.

Entrenaba… pero cada vez con más limitaciones, molestias y dudas.

Slide 3 – Problema emocional (ANTES)
Lo peor no era el dolor.

Era la sensación de:
– No rendir como antes
– Ser un lastre para su equipo
– No saber si competir… o parar

Frustración. Miedo. Inseguridad.

Slide 4 – Cambio de enfoque (PUENTE)
El problema no era entrenar.

Era hacerlo por encima de lo que su cuerpo podía tolerar.

Sin entender:
🔹 Cuánto cargar
🔹 Cómo progresar
🔹 Qué adaptar

Slide 5 – Proceso (PUENTE)
En lugar de parar… aprendió a entrenar con sentido.

Ajustando:
✔️ Cargas
✔️ Volumen
✔️ Movimientos

Y entendiendo cuándo apretar… y cuándo no.

Slide 6 – Resultado (DESPUÉS)
Volvió a:
– Hacer gimnásticos
– Trabajar overhead
– Competir con su equipo

Sin dolor. Sin miedo. Con confianza.

Slide 7 – Cierre + CTA
No es que tu hombro o tu rodilla no tengan solución.

Es que probablemente estás entrenando sin una dirección clara.

Si te has visto reflejado, guárdalo o escríbeme "hombro".`,
  },
  {
    topic: "Motivo real del dolor de hombro en kipping",
    category: "educativo",
    raw: `Slide 1 – Gancho
Texto grande: "Este es el motivo por el que te duele el hombro al hacer kipping."
Texto pequeño: Y no tiene nada que ver con tu técnica…
Visual sugerida: Atleta colgado en una barra, gesto de dolor o incomodidad. Fondo claro, texto muy visible.

Slide 2 – Problema habitual (parte 1)
Muchos atletas sienten que "algo no va bien" al hacer gimnásticos, pero siguen repitiendo el patrón esperando que se pase solo.
Visual sugerida: Imagen de alguien entrenando con mala cara o gesto de incomodidad.

Slide 3 – Problema habitual (parte 2)
El problema no es solo el ejercicio.
Es que tu hombro no tiene la estabilidad ni el control suficiente para tolerar ese tipo de carga y velocidad.
Visual sugerida: Silueta de hombro con etiquetas: "estabilidad", "control", "carga rápida".

Slide 4 – Nuevo marco mental (parte 1)
El dolor en gimnásticos no significa que estés roto.
Significa que estás forzando un patrón que tu cuerpo aún no domina.
Visual sugerida: Fondo blanco, texto centrado, símbolo de advertencia o semáforo en ámbar (no es un "stop").

Slide 5 – Nuevo marco mental (parte 2)
No se trata de evitar el kipping.
Se trata de construir una base que lo sostenga sin dolor:
✔️ Control escapular
✔️ Carga progresiva
✔️ Confianza en la posición colgada
Visual sugerida: Ilustración simple de pirámide: base = control, centro = carga, cima = kipping sin dolor.

Slide 6 – Cierre empoderador
Tu cuerpo no necesita protección eterna.
Necesita que lo prepares con inteligencia.
Y eso empieza por entender qué está fallando.
Visual sugerida: Imagen de atleta colgado con buena técnica. Fondo claro, limpio.

Slide 7 – CTA suave
¿Te está pasando esto con el hombro?
🟡 Guárdalo para volver a leerlo
🟡 Compártelo con tu compi de entreno
🟡 O déjame un comentario si te has sentido identificado
Visual sugerida: Iconos de guardar, compartir, comentar. Tú mirando a cámara o una imagen cercana.`,
  },
];

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await (prisma as any).carouselLibraryEntry.count();
  if (existing > 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Ya hay ${existing} carrusel(es) en biblioteca. No cargo semilla para no duplicar.`,
    });
  }

  const created: string[] = [];
  for (const s of SEEDS) {
    const parsed = parseCarouselText(s.raw);
    if (parsed.slides.length === 0) continue;
    const row = await (prisma as any).carouselLibraryEntry.create({
      data: {
        topic: s.topic,
        category: s.category,
        slidesJson: JSON.stringify(parsed.slides),
        captionText: parsed.caption,
        createdById: user.id,
      },
    });
    created.push(row.id);
  }

  return NextResponse.json({ ok: true, seeded: created.length });
}
