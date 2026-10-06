import type { ReactNode } from 'react';
export const Logo = () => <span>مَتِين</span>;
export const SkeletonBlock = () => <div>loading</div>;
export const ErrorState = ({ message, onRetry }: { message?: string; onRetry?: () => void }) => <button onClick={onRetry} data-testid="fixture-error">{message || 'error'}</button>;
export const LoadingList = SkeletonBlock;
export const EmptyState = ({ title }: { title?: string }) => <div data-testid="fixture-empty">{title}</div>;
export const PageHeader = ({ title, children }: { title: string; children: ReactNode }) => <header>{title}{children}</header>;
export const Notice = ({ children }: { children: ReactNode }) => <div>{children}</div>;
