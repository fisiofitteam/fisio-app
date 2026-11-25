/** Public copy is explicit: no patient records, clinical notes or source IDs cross this boundary. */
export const ZONES = ["Hombro", "Lumbar", "Rodilla", "Otros"] as const;
export const SECTION_IDS = ["hero", "empathy", "founder", "education", "method", "results", "fit", "faq", "cta", "tools"] as const;
export type SectionId = typeof SECTION_IDS[number];
export type Section = { visible: boolean; eyebrow: string; title: string; body: string; items: { title: string; body: string }[] };
export type Media = { url: string; alt: string; poster: string };
export type Story = { id: string; sourceType: "evidence" | "success"; sourceId: string; sourceVersion: string; name: string; title: string; quote: string; before: string; after: string; zone: typeof ZONES[number]; visible: boolean; authorized: boolean; authorizationNote: string; authorizedAt: string; authorizedBy: string };
export type PublicStory = Pick<Story, "id" | "name" | "title" | "quote" | "before" | "after" | "zone"> & { mediaUrl: string; kind: "image" | "video" | "text" };
export type MetodoConfig = {
  published: boolean; sections: Record<SectionId, Section>;
  media: { hero: Media; team: Media; athlete: Media; clinician: Media; introduction: Media };
  buttons: { discover: string; contact: string; secondary: string };
  whatsapp: { number: string; message: string };
  seo: { title: string; description: string; image: string };
  stories: Story[]; tools: { title: string; body: string; url: string; visible: boolean }[];
};
export type PublicMetodo = Omit<MetodoConfig, "stories"> & { stories: PublicStory[] };
const section = (eyebrow: string, title: string, body = "", items: Section["items"] = []): Section => ({ visible: true, eyebrow, title, body, items });
export const DEFAULT_METODO: MetodoConfig = {
  published: true,
  sections: {
    hero: section("FISIOTERAPIA PARA ATLETAS DE CROSSTRAINING", "Vuelve a disfrutar del crosstraining sin que el dolor decida cómo entrenas.", "Ayudamos a atletas que llevan meses entrenando con dolor a recuperar sus movimientos mediante un proceso de fisioterapia y entrenamiento adaptado a sus necesidades."),
    empathy: section("SABEMOS QUE NO ES SOLO EL DOLOR", "Quieres volver a entrenar con confianza.", "Y sentir que avanzas, en lugar de negociar con las mismas molestias cada semana.", [
      { title: "Llevas meses adaptando entrenamientos.", body: "Cambias un ejercicio, bajas el peso… pero sigues sin saber cómo volver." },
      { title: "Hay movimientos que ya evitas.", body: "A veces por dolor. Otras, por miedo a que vuelva a aparecer." },
      { title: "Has probado tratamientos.", body: "Quizá has sentido alivio, pero no el cambio duradero que buscabas." },
      { title: "Sientes que pierdes capacidad física.", body: "Te cuesta reconocerte en lo que ahora puedes hacer." },
      { title: "No quieres dejar el deporte que te gusta.", body: "Quieres encontrar una forma de seguir y recuperar tus objetivos." },
    ]),
    founder: section("EL EQUIPO DETRÁS DE TU PROCESO", "Tu recuperación tiene un equipo detrás.", "Somos un equipo de fisioterapeutas especializado en crosstraining. Unimos valoración, ejercicio y entrenamiento adaptado para construir contigo un proceso que encaje en tu vida y en tu deporte. Tu fisioterapeuta sigue tu evolución y ajusta el trabajo contigo."),
    education: section("ADAPTAR ES PARTE DEL CAMINO", "Seguir entrenando. Recuperar lo que te falta.", "Adaptar puede ayudarte a entrenar dentro de tus posibilidades. Para volver a un movimiento, a menudo también necesitamos trabajar las capacidades que ese movimiento exige.", [
      { title: "Evitar temporalmente", body: "Apartar un movimiento puede ser útil en un momento concreto. Necesitamos entender cuándo y cómo retomarlo." },
      { title: "Adaptar el entrenamiento", body: "Ajustar ejercicios, cargas y volumen para encontrar opciones que puedas tolerar." },
      { title: "Recuperar capacidades", body: "Trabajar de forma progresiva para acercarte a los movimientos y cargas que quieres recuperar." },
    ]),
    method: section("ASÍ TRABAJAMOS", "Un proceso con dirección. Y alguien a tu lado.", "Acompañamiento profesional, seguimiento de tu evolución y ajustes individualizados durante el proceso.", [
      { title: "Entendemos tu caso", body: "Valoramos tu situación, historial, síntomas, objetivos y limitaciones deportivas." },
      { title: "Adaptamos tu entrenamiento", body: "Buscamos que puedas seguir entrenando dentro de tus posibilidades mientras trabajamos en tu recuperación." },
      { title: "Recuperamos capacidades", body: "Diseñamos un proceso individualizado de ejercicio terapéutico, fuerza y exposición progresiva a los movimientos que necesitas recuperar." },
      { title: "Volvemos a tus objetivos deportivos", body: "Trabajamos para que recuperes capacidad, confianza y autonomía en tu entrenamiento." },
    ]),
    results: section("HISTORIAS REALES", "Detrás de cada movimiento, hay una persona.", "Experiencias compartidas con autorización por atletas que han trabajado con nosotros. Cada caso y cada evolución son diferentes."),
    fit: section("¿ES FISIOFITTEAM PARA TI?", "No buscas otro parche. Buscas un proceso.", "No ofrecemos soluciones milagrosas ni protocolos universales. Nuestro enfoque requiere tu participación activa y se adapta a tu situación.", [
      { title: "Llevas tiempo conviviendo con dolor.", body: "" }, { title: "Quieres seguir practicando crosstraining.", body: "" },
      { title: "Buscas una estrategia individualizada.", body: "" }, { title: "Estás dispuesto a implicarte en tu recuperación.", body: "" },
      { title: "Valoras el acompañamiento especializado.", body: "" },
    ]),
    faq: section("RESOLVEMOS TUS DUDAS", "Antes de dar el siguiente paso.", "", [
      { title: "¿Cómo funciona la fisioterapia online?", body: "Empezamos valorando tu caso y tus objetivos. Utilizamos la app para organizar el trabajo, recoger tus sensaciones y revisar vídeos cuando es necesario. Tu fisioterapeuta sigue tu evolución y ajusta el proceso contigo. Si tu caso necesita atención presencial, te lo indicaremos." },
      { title: "¿Tengo que dejar de entrenar?", body: "No tiene por qué. Buscamos opciones y ajustes que puedas tolerar según tu situación. No siempre podrás mantener todos los movimientos o cargas desde el primer día; lo decidiremos a partir de tu valoración." },
      { title: "¿Y si ya he probado otros tratamientos?", body: "Revisaremos qué has probado, qué te ha ayudado y qué sigue limitándote. Esa información nos permite valorar si nuestro enfoque puede encajar contigo, sin prometerte un resultado concreto." },
      { title: "¿El entrenamiento se adapta a mi situación?", body: "Sí. Partimos de tus capacidades, síntomas, material disponible y objetivos. Revisamos los ajustes a medida que evoluciona tu caso." },
      { title: "¿Tendré un fisioterapeuta que supervise mi evolución?", body: "Sí. El acompañamiento profesional y la revisión de tu evolución forman parte del proceso. Al hablar contigo te explicaremos cómo se organiza el seguimiento del programa que encaje con tu caso." },
      { title: "¿Cómo puedo saber si podéis ayudarme?", body: "Cuéntanos tu situación por WhatsApp. El equipo te hará algunas preguntas para entenderla y valorar contigo el siguiente paso. Si no somos la opción adecuada, te lo diremos." },
    ]),
    cta: section("EMPECEMOS POR ESCUCHARTE", "¿Y si el siguiente paso no fuera dejar de entrenar, sino aprender a recuperarte mientras entrenas?", "Cuéntanos tu situación. Nuestro equipo valorará contigo si nuestro enfoque puede ayudarte a recuperar los movimientos y objetivos deportivos que ahora tienes limitados."),
    tools: { ...section("RECURSOS PARA TI", "Conoce mejor tu entrenamiento."), visible: false },
  },
  media: { hero: {url:"",alt:"Atleta entrenando crosstraining",poster:""}, team: {url:"",alt:"El equipo de FisioFitTeam",poster:""}, athlete: {url:"",alt:"Ales practicando crosstraining",poster:""}, clinician: {url:"",alt:"Ales trabajando como fisioterapeuta",poster:""}, introduction: {url:"",alt:"Ales presenta la metodología de FisioFitTeam",poster:""} },
  buttons: { discover: "Descubre cómo trabajamos", contact: "Quiero contaros mi caso", secondary: "Prefiero hablar con el equipo" },
  whatsapp: { number: "", message: "Hola, equipo de FisioFitTeam. He estado viendo vuestra metodología y me gustaría contaros mi caso para saber si podéis ayudarme." },
  seo: { title: "Nuestro método | FisioFitTeam", description: "Fisioterapia y entrenamiento adaptado para atletas de crosstraining con dolor persistente. Conoce cómo trabajamos y cuéntanos tu caso.", image: "" },
  stories: [], tools: [ {title:"Adaptador de WODs",body:"Explora opciones para tu entrenamiento.",url:"/adaptador-wod",visible:false}, {title:"Autotest de hombro",body:"Conoce mejor tus movimientos.",url:"/autotest-hombro",visible:false}, {title:"Semáforo del dolor",body:"Reflexiona sobre cómo te encuentras.",url:"/semaforo",visible:false}, {title:"Comunidad Hombro Antifrágil",body:"",url:"",visible:false} ],
};
const object = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const text = (v: unknown, fallback = "", max = 4000) => typeof v === "string" ? v.trim().slice(0, max) : fallback;
// Migrate only untouched historical defaults. Custom copy, including the old brand,
// remains exactly under editorial control; there is no blanket string replacement.
const LEGACY_FOUNDER = {
  eyebrow: "DE ATLETAS PARA ATLETAS",
  title: "Conocemos el box. Y lo que cuesta volver.",
  body: "Soy Ales, fisioterapeuta y fundador de FisioFitCross. Nuestra especialización nace de unir la experiencia clínica con la práctica del crosstraining. Entendemos lo que te exige una sesión y lo que significa para ti poder disfrutarla. Por eso trabajamos contigo: para construir un proceso que tenga sentido en tu vida y en tu deporte.",
};
export function youtubeId(value: string) {
  try { const u = new URL(value); if (!["youtube.com","www.youtube.com","youtu.be","www.youtube-nocookie.com"].includes(u.hostname)) return null; const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") || u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1]; return id && /^[\w-]{11}$/.test(id) ? id : null; } catch { return null; }
}
export function mediaUrl(value: unknown, video = true): string {
  if (typeof value !== "string" || value.length > 1800) return "";
  if (value === "/box.jpg") return value;
  try { const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password) return "";
    if (video && youtubeId(value)) return `https://www.youtube.com/watch?v=${youtubeId(value)}`;
    if (/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(u.hostname) && !/\.svg(?:$|\?)/i.test(u.pathname)) return u.toString();
  } catch { /* invalid or private URL */ } return "";
}
export function toolUrl(value: unknown) {
  if (typeof value !== "string") return "";
  if (/^\/(?:adaptador-wod|autotest-hombro|semaforo)(?:\/[a-z-]+)?$/.test(value)) return value;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && ["chat.whatsapp.com","www.skool.com","skool.com"].includes(u.hostname) ? u.toString() : ""; } catch { return ""; }
}
export function normalizeMetodo(input: unknown): MetodoConfig {
  const raw = object(input), sections = object(raw.sections), media = object(raw.media);
  const result = structuredClone(DEFAULT_METODO);
  result.published = typeof raw.published === "boolean" ? raw.published : true;
  for (const id of SECTION_IDS) {
    const v = object(sections[id]), d = result.sections[id];
    result.sections[id] = { visible: typeof v.visible === "boolean" ? v.visible : d.visible, eyebrow: text(v.eyebrow,d.eyebrow,120), title:text(v.title,d.title,300),body:text(v.body,d.body),items:Array.isArray(v.items) ? v.items.slice(0,20).map((i: unknown)=>{const x=object(i);return {title:text(x.title,"",300),body:text(x.body)};}).filter((i: {title:string})=>i.title) : d.items };
  }
  for (const key of Object.keys(result.media) as (keyof MetodoConfig["media"])[]) {const v=object(media[key]);result.media[key]={url:mediaUrl(v.url,key==="introduction"||key==="hero"),alt:text(v.alt,result.media[key].alt,200),poster:mediaUrl(v.poster,false)};}
  const b=object(raw.buttons), w=object(raw.whatsapp), seo=object(raw.seo);
  for (const key of Object.keys(result.buttons) as (keyof MetodoConfig["buttons"])[]) result.buttons[key]=text(b[key],result.buttons[key],100);
  const digits=text(w.number).replace(/\D/g,""); result.whatsapp={number:/^\d{7,15}$/.test(digits)?digits:"",message:text(w.message,result.whatsapp.message,1200)};
  result.seo={title:text(seo.title,result.seo.title,100),description:text(seo.description,result.seo.description,300),image:mediaUrl(seo.image,false)};
  const founder=object(sections.founder);
  for(const key of ["eyebrow","title","body"] as const)if(founder[key]===LEGACY_FOUNDER[key])result.sections.founder[key]=DEFAULT_METODO.sections.founder[key];
  if(object(sections.fit).eyebrow==="¿ES FISIOFITCROSS PARA TI?")result.sections.fit.eyebrow=DEFAULT_METODO.sections.fit.eyebrow;
  if(object(media.introduction).alt==="Ales explica la metodología de FisioFitCross")result.media.introduction.alt=DEFAULT_METODO.media.introduction.alt;
  if(w.message==="Hola, equipo de FisioFitCross. He estado viendo vuestra metodología y me gustaría contaros mi caso para saber si podéis ayudarme.")result.whatsapp.message=DEFAULT_METODO.whatsapp.message;
  if(seo.title==="Nuestro método | FisioFitCross")result.seo.title=DEFAULT_METODO.seo.title;
  if(Array.isArray(raw.tools))result.tools=raw.tools.slice(0,12).map((v:unknown)=>{const x=object(v);return{title:text(x.title,"",100),body:text(x.body,"",500),url:toolUrl(x.url),visible:x.visible===true};});
  if(Array.isArray(raw.stories))result.stories=raw.stories.slice(0,24).map((v:unknown)=>{const x=object(v);return{id:text(x.id,"",64),sourceType:x.sourceType==="success"?"success" as const:"evidence" as const,sourceId:text(x.sourceId,"",80),sourceVersion:text(x.sourceVersion,"",40),name:text(x.name,"",100),title:text(x.title,"",250),quote:text(x.quote,"",1600),before:text(x.before,"",600),after:text(x.after,"",600),zone:ZONES.includes(x.zone)?x.zone:"Otros",visible:x.visible===true,authorized:x.authorized===true,authorizationNote:text(x.authorizationNote,"",500),authorizedAt:text(x.authorizedAt,"",40),authorizedBy:text(x.authorizedBy,"",80)};});
  return result;
}
export function publicStory(story: Story, media: {url: string;kind:string}): PublicStory {
  return {id:story.id,name:story.name,title:story.title,quote:story.quote,before:story.before,after:story.after,zone:story.zone,mediaUrl:mediaUrl(media.url),kind:media.kind==="image"?"image":media.kind==="video"?"video":"text"};
}
export function whatsappUrl(number: string, message: string, reference = "") {
  if(!/^\d{7,15}$/.test(number))return "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message+(reference?`\nReferencia: ${reference}`:""))}`;
}
