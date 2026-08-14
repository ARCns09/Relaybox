import sanitizeHtml from "sanitize-html";

const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export function sanitizeEmailHtml(input: string, blockRemoteImages = true): string {
  return sanitizeHtml(input, {
    allowedTags: [
      "a", "abbr", "address", "article", "aside", "b", "blockquote", "br", "caption", "center",
      "code", "col", "colgroup", "dd", "del", "details", "div", "dl", "dt", "em", "figcaption",
      "figure", "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img",
      "ins", "kbd", "li", "main", "mark", "ol", "p", "pre", "q", "s", "section", "small", "span",
      "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
    ],
    allowedAttributes: {
      "*": ["class", "style", "align", "dir", "title"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "data-remote-src", "alt", "width", "height", "title"],
      td: ["colspan", "rowspan", "width", "height", "bgcolor"],
      th: ["colspan", "rowspan", "width", "height", "bgcolor"],
      table: ["width", "height", "border", "cellpadding", "cellspacing", "bgcolor"],
      col: ["span", "width"],
      colgroup: ["span", "width"],
      font: ["color", "face", "size"],
    },
    allowedSchemes: ["http", "https", "mailto", "cid", "data"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"], a: ["http", "https", "mailto"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => ({
        tagName: "a",
        attribs: { ...attributes, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (_tag, attributes) => {
        const src = attributes.src ?? "";
        const isRemote = /^https?:\/\//i.test(src);
        if (blockRemoteImages && isRemote) {
          return { tagName: "img", attribs: { ...attributes, src: transparentPixel, "data-remote-src": src } };
        }
        return { tagName: "img", attribs: attributes };
      },
    },
    disallowedTagsMode: "discard",
    parseStyleAttributes: true,
  });
}

export function plainTextPreview(text: string, html: string | null, length = 150): string {
  const source = text || (html ? sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }) : "");
  return source.replace(/\s+/g, " ").trim().slice(0, length);
}
