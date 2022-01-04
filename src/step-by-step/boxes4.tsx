import React, { ReactElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { connect, Provider } from "react-redux";
import { applyMiddleware, createStore, Dispatch, Store } from "redux";

function checkCollision(rect1: DOMRect, rect2: DOMRect, offsetX: number, offsetY: number) {
  return (rect1.x + offsetX < rect2.x + rect2.width &&
    rect1.x + offsetX + rect1.width > rect2.x &&
    rect1.y + offsetY < rect2.y + rect2.height &&
    rect1.height + rect1.y + offsetY > rect2.y)
}

function usePrevious<T>(current: T): { current: T } {
  const ref = useRef<T>(current);
  useEffect(() => {
    ref.current = current;
  });
  return ref;
}

const REDUX_CONTEXT: any = React.createContext(null);
const BOX_ID_ATTRIBUTE = 'box-id';

type ReduxState = {
  clicked: string[];
  moving: undefined | {
    boxId: string[];
    dx: number;
    dy: number;
  };
  rects: Map<string, DOMRect>;
  collided: string[];
}
type SetClickedAction = {
  type: 'SET_CLICKED';
  boxId: string | string[];
  multiple: boolean;
}
type MoveStartAction = {
  type: 'MOVE_START';
  boxId: string[];
}
type MoveAction = {
  type: 'MOVE';
  dx: number;
  dy: number;
}
type MoveEndAction = {
  type: 'MOVE_END';
}
type UpdateRectsAction = {
  type: 'UPDATE_RECTS';
  rects: Map<string, DOMRect>;
}
type SetCollidedAction = {
  type: 'SET_COLLIDED';
  collided: string[];
}
type ReduxAction = SetClickedAction | MoveStartAction | MoveAction | MoveEndAction | UpdateRectsAction | SetCollidedAction;
type ReduxStore = Store<ReduxState, ReduxAction>;

const reducer: any = (state: ReduxState = {
  clicked: [],
  moving: undefined,
  rects: new Map(),
  collided: []
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
  else if (action.type === 'MOVE_START') {
    return {
      ...state,
      moving: {
        boxId: action.boxId,
        dx: 0,
        dy: 0
      }
    };
  }
  else if (action.type === 'MOVE') {
    if (state.moving === undefined) return state;
    const nextMoving = {...state.moving};
    nextMoving.dx = action.dx;
    nextMoving.dy = action.dy;
    return {
      ...state,
      moving: nextMoving
    };
  }
  else if (action.type === 'MOVE_END') {
    return {
      ...state,
      moving: undefined
    };
  }
  else if (action.type === 'UPDATE_RECTS') {
    return {
      ...state,
      rects: action.rects
    }
  }
  else if (action.type === 'SET_COLLIDED') {
    return {
      ...state,
      collided: action.collided
    };
  }
  return state;
}

type Responder = {
  onMove?: (boxId: string, dx: number, dy: number) => void;
  onMoveEnd?: (boxId: string, dx: number, dy: number) => void;
}
function responderMiddleware(getResponder: () => Responder): any {
  return (store: ReduxStore) => (next: Dispatch) => (action: ReduxAction) => {
    if (action.type === 'MOVE') {
      const state = store.getState();
      next(action);
      if (!state.moving) return;
      for (const boxId of state.moving.boxId) {
        getResponder().onMove?.(boxId, state.moving.dx, state.moving.dy);
      }
    }
    else if (action.type === 'MOVE_END') {
      const state = store.getState();
      next(action);
      if (!state.moving) return;
      for (const boxId of state.moving.boxId) {
        getResponder().onMoveEnd?.(boxId, state.moving.dx, state.moving.dy);
      }
    }
    else {
      next(action);
    }
  }
}

function updateRectsMiddleware(registry: Registry): any {
  return (store: ReduxStore) => (next: Dispatch) => (action: ReduxAction) => {
    if (action.type === 'MOVE_END') {
      const rects = new Map<string, DOMRect>();
      for (const box of registry.getAll()) {
        const el = box.getRef();
        if (!el) continue;
        rects.set(box.id, el.getBoundingClientRect());
      }
      store.dispatch({
        type: 'UPDATE_RECTS',
        rects
      });
      next(action);
    }
    else {
      next(action);
    }
  }
}

function updateCollidedMiddleware(): any {
  return (store: ReduxStore) => (next: Dispatch) => (action: ReduxAction) => {
    if (action.type === 'UPDATE_RECTS') {
      next(action);
      const state = store.getState();
      const rects = state.rects;
      const collided: string[] = [];
      for (const [id1, rect1] of rects) {
        for (const [id2, rect2] of rects) {
          if (id1 === id2) continue;
          if (checkCollision(rect1, rect2, 0, 0)) {
            collided.push(id1);
            break;
          }
        }
      }
      store.dispatch({
        type: 'SET_COLLIDED',
        collided
      });
    }
    else {
      next(action);
    }
  }
}

type BoxEntry = {
  id: string;
  getRef: () => HTMLElement | null;
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



function useBoxMove(store: ReduxStore) {
  const mouseStateRef = useRef<string>('IDLE');
  const mousePositionRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  
  const mousedown = useCallback((e: MouseEvent) => {
    if (mouseStateRef.current !== 'IDLE') return;
    const target = e.target as HTMLElement;
    const box = target.closest(`[${BOX_ID_ATTRIBUTE}]`);
    if (!box) return;

    mouseStateRef.current = 'MOVE';
    mousePositionRef.current.x = e.clientX;
    mousePositionRef.current.y = e.clientY;
    store.dispatch({
      type: 'MOVE_START',
      boxId: store.getState().clicked
    });
  }, [store]);
  const mousemove = useCallback((e: MouseEvent) => {
    if (mouseStateRef.current !== 'MOVE') return;
    const dx = e.clientX - mousePositionRef.current.x;
    const dy = e.clientY - mousePositionRef.current.y;
    
    store.dispatch({
      type: 'MOVE',
      dx, dy
    });
  }, [store]);
  const mouseup = useCallback((e: MouseEvent) => {
    if (mouseStateRef.current !== 'MOVE') return;
    store.dispatch({
      type: 'MOVE_END'
    });
    mouseStateRef.current = 'IDLE';
  }, [store]);

  useLayoutEffect(() => {
    window.addEventListener('mousedown', mousedown);
    window.addEventListener('mousemove', mousemove);
    window.addEventListener('mouseup', mouseup);

    return () => {
      window.removeEventListener('mousedown', mousedown);
      window.removeEventListener('mousemove', mousemove);
      window.removeEventListener('mouseup', mouseup);
    }
  }, [mousedown, mousemove, mouseup]);
}



type BoxesRenderProps = {
  registry: Registry;
}
type BoxesProps = {
  onMove?: (boxId: string, dx: number, dy: number) => void;
  onMoveEnd?: (boxId: string, dx: number, dy: number) => void;
  children: (renderProps: BoxesRenderProps) => ReactElement;
}
export function Boxes(props: BoxesProps) {
  const {children} = props;
  
  const lastProps = usePrevious(props);
  const registry = useMemo(() => createRegistry(), []);

  const getResponder: () => Responder = useCallback(() => ({
    onMove: lastProps.current.onMove,
    onMoveEnd: lastProps.current.onMoveEnd
  }), [lastProps]);
  const middlewares: any = useMemo(() => applyMiddleware(
    responderMiddleware(getResponder),
    updateRectsMiddleware(registry),
    updateCollidedMiddleware(),
  ), [getResponder, registry]);
  const store: ReduxStore = useMemo(() => createStore(reducer, middlewares), []);
  
  const renderProps: BoxesRenderProps = useMemo(() => ({
    registry
  }), [registry]);

  useBoxClick(store);
  useBoxMove(store);

  return (
    <Provider store={store} context={REDUX_CONTEXT}>
      {children(renderProps)}
    </Provider>
  )
}


function useBoxPublisher(id: string, registry: Registry, getRef: () => HTMLElement | null) {
  const entry: BoxEntry = useMemo(() => ({id, getRef}), [id, getRef]);
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
  children: (provided: BoxProvided, setRef: (el: HTMLElement | null) => void,
             clicked: boolean, collided: boolean, offset: {x: number, y: number}) => ReactElement;
}
type BoxMappedProps = {
  clicked: boolean;
  collided: boolean;
  offset: {
    x: number;
    y: number;
  };
}
function _Box(props: BoxProps & BoxMappedProps) {
  const {id, registry, clicked, collided, offset, children} = props;
  const ref = useRef<HTMLElement | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => {
    console.log(el)
    ref.current = el;
  }, []);
  const getRef = useCallback(() => {
    return ref.current;
  }, []);

  useBoxPublisher(id, registry, getRef);
  const provided: BoxProvided = useMemo(() => ({
    [BOX_ID_ATTRIBUTE]: id
  }), [id]);

  return children(provided, setRef, clicked, collided, offset);
}
export const Box = connect(
  (state: ReduxState, props: BoxProps) => {
    const boxId = props.id;
    const clicked = state.clicked.indexOf(boxId) !== -1;
    const collided = state.collided.indexOf(boxId) !== -1;

    let dx = 0, dy = 0;
    if (state.moving && state.moving.boxId.indexOf(boxId) !== -1) {
      dx = state.moving?.dx!;
      dy = state.moving?.dy!;
    }

    return {
      clicked,
      collided,
      offset: {
        x: dx,
        y: dy
      }
    }
  },
  undefined,
  undefined,
  {
    context: REDUX_CONTEXT
  }
)(_Box)