interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-start md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="portal-label mb-2 text-copy-muted">{eyebrow}</p>}
        <h1 className="portal-heading text-2xl tracking-tight md:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-copy-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3 md:pt-1">{actions}</div>
      )}
    </div>
  );
}
