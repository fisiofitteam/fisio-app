/**
 * Sanitizador del HTML libre de la landing Prevention.
 *
 * Permite el 90% del HTML común de una landing (h1-h6, p, div, span, img,
 * a, listas, tablas, secciones, blockquote, code, hr, br, strong, em,
 * style y class inline). Bloquea:
 *   - <script>, <iframe>, <object>, <embed>, <form>, <input> — vectores XSS
 *     o de robo de credenciales.
 *   - Atributos on* (onclick, onerror, ...) que ejecutarían JS.
 *   - URLs con schemes peligrosos (javascript:, data: excepto imágenes).
 *
 * Sí permite el token literal `[[PLANS]]` que la landing usa como
 * placeholder para insertar el bloque interactivo de planes (sanitize-html
 * lo trata como texto plano, no lo toca).
 *
 * Solo servidor: sanitize-html requiere Node.
 */
import sanitizeHtml from "sanitize-html";

const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/;

export function sanitizeLandingHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      // Estructura y contenedores
      "div", "section", "article", "header", "footer", "main", "nav", "aside",
      // Encabezados y texto
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "span", "br", "hr",
      "strong", "em", "b", "i", "u", "s", "small", "sub", "sup", "mark",
      "blockquote", "code", "pre", "kbd",
      // Listas
      "ul", "ol", "li",
      // Multimedia
      "img", "picture", "source", "video", "audio",
      // Tablas
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
      // Enlaces y form básico
      "a", "button", "label",
      // Semánticos
      "details", "summary", "figure", "figcaption",
      "abbr", "cite", "time", "dfn",
    ],
    allowedAttributes: {
      "*": ["style", "class", "id", "aria-label", "aria-hidden", "role", "title"],
      a: ["href", "target", "rel", "download"],
      img: ["src", "alt", "width", "height", "loading", "decoding", "srcset", "sizes"],
      video: ["src", "poster", "controls", "autoplay", "loop", "muted", "playsinline", "width", "height", "preload"],
      audio: ["src", "controls", "autoplay", "loop", "muted", "preload"],
      source: ["src", "srcset", "type", "media", "sizes"],
      picture: [],
      button: ["type"],
      label: ["for"],
      table: ["cellpadding", "cellspacing", "border"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
      time: ["datetime"],
      details: ["open"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
      video: ["http", "https", "data"],
      audio: ["http", "https", "data"],
      source: ["http", "https", "data"],
    },
    allowProtocolRelative: true,
    allowedSchemesAppliedToAttributes: ["href", "src", "srcset"],
    // Filtro específico para data: en imágenes — solo permitimos data URIs de imagen conocidas.
    exclusiveFilter(frame) {
      if (["img", "video", "audio", "source"].includes(frame.tag)) {
        const src = frame.attribs?.src || "";
        if (src.startsWith("data:") && !IMAGE_DATA_URI.test(src)) return true;
      }
      return false;
    },
    // Los comentarios se conservan para poder soportar [[PLANS]]
    allowedClasses: undefined, // acepta cualquier class (Tailwind, custom, etc.)
    // Devuelve HTML no auto-cerrado para tags void — importante para img.
    selfClosing: ["img", "br", "hr", "source", "input", "area"],
    // Sí, permitir comments
    parser: {
      lowerCaseTags: true,
    },
    transformTags: {
      // Fuerza rel=noopener en enlaces externos target=_blank.
      a(_tag, attribs) {
        if (attribs.target === "_blank") {
          const rel = new Set((attribs.rel || "").split(/\s+/).filter(Boolean));
          rel.add("noopener");
          rel.add("noreferrer");
          attribs.rel = Array.from(rel).join(" ");
        }
        return { tagName: "a", attribs };
      },
    },
  });
}

/**
 * Marker que representa dónde insertar el bloque interactivo de planes en
 * el HTML libre. El editor lo documenta como snippet copy-paste.
 */
export const PLANS_PLACEHOLDER = "[[PLANS]]";

/**
 * Divide el HTML sanitizado en las secciones alrededor del placeholder
 * de planes. Si el placeholder no aparece, la parte de planes va al final.
 */
export function splitByPlansPlaceholder(html: string): { before: string; after: string } {
  const idx = html.indexOf(PLANS_PLACEHOLDER);
  if (idx === -1) return { before: html, after: "" };
  return {
    before: html.slice(0, idx),
    after: html.slice(idx + PLANS_PLACEHOLDER.length),
  };
}
