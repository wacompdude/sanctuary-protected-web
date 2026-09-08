import type { LegalDocument } from "@/lib/legal/types";

function renderText(text: string) {
  return text.split("\n").map((line, index) => (
    <span key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </span>
  ));
}

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <article className="legal-document max-w-3xl text-[0.975rem] leading-relaxed">
      {document.intro ? (
        <p className="text-foreground">{document.intro}</p>
      ) : null}
      {document.sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-8 pt-10">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {section.title}
          </h2>
          <div className="mt-4 space-y-4">
            {section.blocks.map((block, index) => {
              if (block.type === "p") {
                return (
                  <p key={index} className="text-foreground/90">
                    {renderText(block.text)}
                  </p>
                );
              }
              if (block.type === "ul") {
                return (
                  <ul key={index} className="list-disc space-y-2 pl-5 text-foreground/90">
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                );
              }
              if (block.type === "callout") {
                return (
                  <div
                    key={index}
                    className="rounded-md border border-amber-700/40 bg-amber-50 px-4 py-3 dark:bg-amber-950/30"
                    role="note"
                  >
                    <p className="font-semibold text-foreground">
                      {block.callout.title}
                    </p>
                    <p className="mt-2 text-foreground/90">{block.callout.body}</p>
                  </div>
                );
              }
              return (
                <p
                  key={index}
                  className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 font-mono text-sm"
                >
                  {block.text}
                </p>
              );
            })}
          </div>
        </section>
      ))}
    </article>
  );
}
