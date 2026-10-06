import type { ReactNode } from 'react';
export const Dialog = ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null;
export const DialogContent = ({ children }: { children: ReactNode }) => <div>{children}</div>;
export const DialogTitle = ({ children }: { children: ReactNode }) => <h2>{children}</h2>;
