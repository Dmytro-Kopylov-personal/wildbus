export type Listener<T = unknown> = (payload: T, topic: string) => void;
export type Unsubscribe = () => void;
