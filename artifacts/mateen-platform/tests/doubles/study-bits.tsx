export const EmptyState = ({children}: {children?: React.ReactNode}) => <div>{children}</div>;
export const Notice = EmptyState;
export const LoadingList = () => <div>loading</div>;
export const ErrorState = () => <div>error</div>;