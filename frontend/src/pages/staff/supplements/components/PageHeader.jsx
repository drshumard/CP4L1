import React from 'react';

export default function PageHeader({ title, subtitle, children }) {
  return (
    <header className="supp-page-header">
      <div className="supp-page-heading">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="supp-page-actions">{children}</div>}
    </header>
  );
}

export function PageContainer({ children, className = '' }) {
  return <div className={`supp-page ${className}`}>{children}</div>;
}
