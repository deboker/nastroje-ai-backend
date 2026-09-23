import type { PropsWithChildren, ReactNode } from 'react';

type SectionCardProps = PropsWithChildren<{
  title: string;
  description?: string;
  actions?: ReactNode;
}>;

export function SectionCard({ title, description, actions, children }: SectionCardProps) {
  return (
    <section className="nastroje-card">
      <header className="nastroje-card__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="nastroje-card__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
