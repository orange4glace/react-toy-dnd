import React, { ReactElement, useLayoutEffect, useMemo, useRef } from "react";
import { connect, Provider } from "react-redux";
import { createStore, Store } from "redux";

const REDUX_CONTEXT: any = React.createContext(null);
const BOX_ID_ATTRIBUTE = 'box-id';

type ReduxState = {
  clicked: string[];
}
type SetClickedAction = {
  type: 'SET_CLICKED';
  boxId: string | string[];
  multiple: boolean;
}
type ReduxAction = SetClickedAction;
type ReduxStore = Store<ReduxState, ReduxAction>;

const reducer: any = (state: ReduxState = {
  clicked: []
}, action: ReduxAction): ReduxState => {
  console.log(action);
  if (action.type === 'SET_CLICKED') {
    const boxId = Array.isArray(action.boxId) ? action.boxId : [action.boxId];
    let hasAll = boxId.length > 0;
    for (const id of boxId) {
      hasAll = hasAll && state.clicked.indexOf(id) !== -1;
    }
    const nextClicked = (action.multiple || hasAll) ? [...state.clicked] : [];
    for (const id of boxId) {
      if (boxId && nextClicked.indexOf(id) !== -1) continue;
      nextClicked.push(id);
    }
    return {
      ...state,
      clicked: nextClicked
    }
  }
  return state;
}


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



function useBoxClick(store: ReduxStore) {
  const mousedown = useMemo(() => (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const box = target.closest(`[${BOX_ID_ATTRIBUTE}]`);
    if (!box) {
      store.dispatch({
        type: 'SET_CLICKED',
        boxId: [],
        multiple: false
      });
      return;
    }
    const boxId = box.getAttribute(BOX_ID_ATTRIBUTE)!;
    store.dispatch({
      type: 'SET_CLICKED',
      boxId,
      multiple: e.shiftKey
    });
  }, [store]);

  useLayoutEffect(() => {
    window.addEventListener('mousedown', mousedown);

    return () => {
      window.removeEventListener('mousedown', mousedown);
    }
  }, [mousedown])
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
  const store: ReduxStore = useMemo(() => createStore(reducer), []);
  const renderProps: BoxesRenderProps = useMemo(() => ({
    registry
  }), [registry]);

  useBoxClick(store);

  return (
    <Provider store={store} context={REDUX_CONTEXT}>
      {children(renderProps)}
    </Provider>
  )
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
type BoxProvided = {
  [BOX_ID_ATTRIBUTE]: string;
}
type BoxProps = {
  id: string;
  registry: Registry;
  children: (provided: BoxProvided, clicked: boolean) => ReactElement;
}
type BoxMappedProps = {
  clicked: boolean
}
function _Box(props: BoxProps & BoxMappedProps) {
  const {id, registry, clicked, children} = props;

  useBoxPublisher(id, registry);
  const provided: BoxProvided = useMemo(() => ({
    [BOX_ID_ATTRIBUTE]: id
  }), [id]);

  return children(provided, clicked);
}
export const Box = connect(
  (state: ReduxState, props: BoxProps) => {
    const boxId = props.id;
    const clicked = state.clicked.indexOf(boxId) !== -1;

    return {
      clicked
    }
  },
  undefined,
  undefined,
  {
    context: REDUX_CONTEXT
  }
)(_Box)