"use client";

import { useId, useState } from "react";
import { Activity, CalendarDays, ClipboardList, Dumbbell, Frown, Meh, MessageCircle, Smile, Video, Zap } from "lucide-react";
import "./metodo-app-preview.css";

/**
 * Public product illustrations. Local exploration only: no patient data or API calls.
 * Labels follow PatientHomeDark, ShoulderPatientBattery, WodAdapter,
 * PatientDailyLogForm and PatientWodHistory. These are not patient screenshots.
 */
export function MetodoAppPreview({ phase }: { phase: number }) {
  const [detail, setDetail] = useState(false);
  const [readiness, setReadiness] = useState<number | null>(null);
  const id = useId();
  if (phase < 0 || phase > 3) return null;
  const tabs = (labels: [string, string]) => <div className="map-tabs" role="group" aria-label="Explorar la vista de ejemplo">
    {labels.map((label,index)=><button type="button" key={label} aria-pressed={detail === (index===1)} aria-controls={`${id}-detail`} onClick={()=>setDetail(index===1)}>{label}</button>)}
  </div>;

  return <figure className="map-example">
    <div className="map-screen">
      <div className="map-brand"><Zap size={19} fill="currentColor" aria-hidden="true" /><span>FisioFitTeam</span><span className="map-app-label">Tu app</span></div>
      {phase === 0 && <div className="map-view">
        <div className="map-view-heading"><ClipboardList size={23} aria-hidden="true" /><h4>Valoraciones</h4></div>
        <p className="map-intro">Vídeos de los test</p>
        {tabs(["Vídeos", "Sensaciones"])}
        <div id={`${id}-detail`} key={String(detail)} className="map-explore-panel" aria-live="polite">
          {detail ? <><div className="map-field"><span>Tus sensaciones en este test</span><div className="map-empty-field">Dolor durante el test</div></div><div className="map-field"><span>Comentarios</span><div className="map-empty-field">Qué has notado al hacerlo</div></div></> : <div className="map-video-placeholder"><Video size={40} strokeWidth={1.3} aria-hidden="true" /><span>Tu vídeo del movimiento</span><span className="map-video-hint">El fisio puede revisar tu ejecución</span></div>}
        </div>
        <div className="map-note"><MessageCircle size={19} aria-hidden="true" /><span>Revisión de tu fisioterapeuta</span></div>
      </div>}
      {phase === 1 && <div className="map-view">
        <div className="map-view-heading"><Zap size={23} aria-hidden="true" /><h4>Adaptar WOD</h4></div>
        <p className="map-question">¿Cómo estás hoy?</p>
        <div className="map-readiness" role="group" aria-label="Prueba el selector de estado, sin guardar datos">
          {[{title:"Hoy estoy peor",Icon:Frown,tone:"red"},{title:"Estoy como siempre",Icon:Meh,tone:"amber"},{title:"Hoy me siento bien",Icon:Smile,tone:"green"}].map(({title,Icon,tone},index)=><button type="button" key={title} aria-pressed={readiness===index} onClick={()=>setReadiness(index)}><Icon className={`map-${tone}`} size={26} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <div className="map-readiness-explanation" aria-live="polite">{readiness===null ? "Prueba a elegir un estado." : readiness===0 ? "Tu estado cuenta al adaptar el WOD con las pautas de tu fisio." : readiness===1 ? "La adaptación parte de tu estado habitual y tus niveles pautados." : "Un buen día también se tiene en cuenta, dentro de tus pautas."}</div>
        <div className="map-note"><ClipboardList size={19} aria-hidden="true" /><span>Tus niveles, pautados por tu fisio</span></div>
      </div>}
      {phase === 2 && <div className="map-view">
        <div className="map-view-heading"><CalendarDays size={23} aria-hidden="true" /><h4>Mi semana</h4></div>
        <p className="map-intro">Plan de los próximos días</p>
        {tabs(["Semana", "Sesión"])}
        <div id={`${id}-detail`} key={String(detail)} className="map-explore-panel" aria-live="polite">{detail ? <><div className="map-session"><Dumbbell size={31} strokeWidth={1.4} aria-hidden="true" /><span>Sesión de hoy</span><strong>A entrenar</strong></div><div className="map-session-details"><span>Ejercicios</span><span>Vídeos</span><span>Registro</span></div></> : <><div className="map-week" aria-label="Días de la semana">{["L", "M", "X", "J", "V", "S", "D"].map(day=><span key={day}>{day}</span>)}</div><div className="map-week-description"><CalendarDays size={29} strokeWidth={1.4} aria-hidden="true" /><span>Consulta el trabajo de tu semana y abre cada sesión.</span></div></>}</div>
        <div className="map-note"><CalendarDays size={19} aria-hidden="true" /><span>El trabajo que pauta tu fisio</span></div>
      </div>}
      {phase === 3 && <div className="map-view">
        <div className="map-view-heading"><Activity size={23} aria-hidden="true" /><h4>Mis sensaciones</h4></div>
        <p className="map-intro">Registrar al terminar</p>
        {tabs(["Registro", "Historial"])}
        <div id={`${id}-detail`} key={String(detail)} className="map-explore-panel" aria-live="polite">{detail ? <div className="map-history"><ClipboardList size={35} strokeWidth={1.4} aria-hidden="true" /><strong>Mi historial de WODs</strong><span>Entrenamientos, cargas y sensaciones, en el mismo lugar.</span><small>Sin registros en este ejemplo.</small></div> : <><div className="map-log-fields"><div><span>Dolor durante el WOD</span><span>Sin registrar</span></div><div><span>RPE percibido</span><span>Sin registrar</span></div></div><div className="map-field"><span>Comentarios</span><div className="map-empty-field">Cómo te has sentido</div></div></>}</div>
        <div className="map-note"><MessageCircle size={19} aria-hidden="true" /><span>Información para tu fisioterapeuta</span></div>
      </div>}
    </div>
    <figcaption>Vista interactiva de ejemplo</figcaption>
  </figure>;
}
