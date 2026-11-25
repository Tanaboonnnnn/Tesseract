import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";

/** App route for an entity ref, or null when there is no page for it. */
export function refRoute(ref: string): string | null {
  const [kind, id] = ref.split("/");
  switch (kind) {
    case "notes":
    case "projects":
    case "learning":
      return `/${kind}/${id}`;
    case "skills":
      return `/skills?skill=${id}`;
    default:
      return null;
  }
}

const WIKILINK = /\[\[([^\]\n]+)\]\]/g;

/**
 * Safe Markdown: raw HTML is not rendered (notes may be written by an AI), only http(s)/mailto
 * and internal wiki links survive. `[[target]]` / `[[target|label]]` become in-app links.
 */
export function Markdown({ text, wikilinks = [] }: { text: string; wikilinks?: { text: string; ref: string | null }[] }) {
  const refs = new Map(wikilinks.map((w) => [w.text, w.ref]));
  const source = text.replace(WIKILINK, (_, inner: string) => {
    const label = (inner.split("|")[1] ?? inner.split("|")[0]!).trim().replace(/[[\]]/g, "");
    const ref = refs.get(inner);
    return `[${label}](wiki:${ref ? encodeURIComponent(ref) : "missing"})`;
  });

  return (
    <div className="prose-note">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith("wiki:") ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href = "", children }) => {
            if (href.startsWith("wiki:")) {
              const ref = decodeURIComponent(href.slice(5));
              const route = ref === "missing" ? null : refRoute(ref);
              return route ? (
                <Link to={route} className="wikilink">
                  {children}
                </Link>
              ) : (
                <span className="wikilink-missing" title="No page for this link yet">
                  {children}
                </span>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
