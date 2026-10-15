import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders untrusted Markdown safely: raw HTML is not rendered (react-markdown
// default) and unsafe URL schemes are stripped by its default urlTransform.
const components: Components = {
  h1: ({ children }) => <h1 className="mt-8 mb-3 text-2xl font-semibold tracking-tight first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-8 mb-3 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-5 mb-2 text-base font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  a: ({ href, children }) => {
    const external = typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        className="font-medium underline underline-offset-4"
        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-current/20 pl-4 text-[color:var(--text-secondary)] italic">{children}</blockquote>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} font-mono text-[13px]`}>{children}</code>
    ) : (
      <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg bg-black/5 p-4 text-[13px] leading-6 dark:bg-white/10">{children}</pre>
  ),
  hr: () => <hr className="my-8 border-current/10" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-current/20 px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-current/10 px-3 py-2 align-top">{children}</td>,
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      // eslint-disable-next-line @next/next/no-img-element -- user content from arbitrary hosts
      <img src={src} alt={alt ?? ""} loading="lazy" className="my-4 max-w-full rounded-lg" />
    ) : null,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
