import { ReactElement, useLayoutEffect, useMemo, useRef } from "react";

type BoxEntry = {
  id: string;
}
type Registry = {
  register(entry: BoxEntry): void;
  unregister(entry: BoxEntry): void;
  getAll(): readonly BoxEntry[];
}
function createRegistry(): Registry {
  const registry: BoxEntry[] = [];

  function register(box: BoxEntry): void {
    console.log('Register', box.id);
    registry.push(box);
  }
  function unregister(box: BoxEntry): void {
    console.log('Unregister', box.id);
    const idx = registry.indexOf(box);
    registry.splice(idx, 1);
  }
  function getAll(): readonly BoxEntry[] {
    return registry;
  }

  return {
    register,
    unregister,
    getAll
  };
}




type BoxesRenderProps = {
  registry: Registry;
}
type BoxesProps = {
  children: (renderProps: BoxesRenderProps) => ReactElement
}
export function Boxes(props: BoxesProps) {
  const {children} = props;
  
  const registry = useMemo(() => createRegistry(), []);
  const renderProps: BoxesRenderProps = useMemo(() => ({
    registry
  }), [registry]);

  return children(renderProps);
}


function useBoxPublisher(id: string, registry: Registry) {
  const entry: BoxEntry = useMemo(() => ({id}), [id]);
  const lastEntryRef = useRef<BoxEntry | null>(null);

  useLayoutEffect(() => {
    registry.register(entry);
    lastEntryRef.current = entry;

    return () => {
      const lastEntry = lastEntryRef.current!;
      registry.unregister(lastEntry);
    }
  }, [entry, registry]);
}
type BoxProps = {
  id: string;
  registry: Registry;
  children: ReactElement;
}
export function Box(props: BoxProps) {
  const {id, registry, children} = props;

  useBoxPublisher(id, registry);

  return children;
}