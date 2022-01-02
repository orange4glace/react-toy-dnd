import React, { ReactElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { connect, Provider } from "react-redux";
import { applyMiddleware, createStore, Dispatch, Store } from "redux";

function usePrevious<T>(current: T): { current: T } {
  const ref = useRef<T>(current);
  useEffect(() => {
    ref.current = current;
  });
  return ref;
}

const BOX_ID_ATTRIBUTE = 'box-id';
const REDUX_CONTEXT: any = React.createContext(null);

type ReduxState = {
  clicked: string | undefined;
  moving: undefined | {
    boxId: string;
    dx: number;
    dy: number;
    rects: Map<string, DOMRect>;
    collision: boolean;
  }
}

type ClickAction = {
  type: 'CLICK';
  boxId: string;
}
type MoveStartAction = {
  type: 'MOVE_START';
  boxId: string;
  rects: Map<string, DOMRect>;
}
type MoveAction = {
  type: 'MOVE';
  dx: number;
  dy: number;
}
type MoveEndAction = {
  type: 'MOVE_END';
}
type SetCollisionStateAction = {
  type: 'SET_COLLISION_STATE',
  collision: boolean
}
type ReduxAction = ClickAction | MoveStartAction | MoveAction | MoveEndAction | SetCollisionStateAction;
type ReduxStore = Store<ReduxState, ReduxAction>;

const ReduxReducer: any = (state: ReduxState = {
  clicked: undefined,
  moving: undefined
}, action: ReduxAction): ReduxState => {
  if (action.type === 'CLICK') {
    const boxId = action.boxId;
    return {
      ...state,
      clicked: boxId
    }
  }
  if (action.type === 'MOVE_START') {
    const boxId = action.boxId;
    return {
      ...state,
      moving: {
        boxId,
        dx: 0,
        dy: 0,
        rects: action.rects,
        collision: false
      }
    }
  }
  if (action.type === 'MOVE') {
    return {
      ...state,
      moving: {
        ...state.moving!,
        dx: action.dx,
        dy: action.dy
      }
    }
  }
  if (action.type === 'MOVE_END') {
    return {
      ...state,
      moving: undefined
    }
  }
  if (action.type === 'SET_COLLISION_STATE') {
    if (state.moving === undefined) return state;
    return {
      ...state,
      moving: {
        ...state.moving,
        collision: action.collision
      }
    }
  }
  return state;
};

function collisionCheck(rect1: DOMRect, rect2: DOMRect, offsetX: number, offsetY: number) {
  return (rect1.x + offsetX < rect2.x + rect2.width &&
    rect1.x + offsetX + rect1.width > rect2.x &&
    rect1.y + offsetY < rect2.y + rect2.height &&
    rect1.height + rect1.y + offsetY > rect2.y)
}
function collisionCheckerMiddleware(): any {
  return (store: ReduxStore) => (next: Dispatch) => (action: ReduxAction) => {
    if (action.type === 'MOVE_START' || action.type === 'MOVE') {
      next(action);
      const state = store.getState();
      if (!state.moving) {
        throw new Error('Should be in moving state');
      }
      const rects = state.moving.rects;
      const movingRect = state.moving.rects.get(state.moving.boxId);
      const offsetX = state.moving.dx;
      const offsetY = state.moving.dy;
      if (!movingRect) return;
      for (const [id, rect] of rects.entries()) {
        if (!rect) continue;
        if (id === state.moving.boxId) continue;
        if (collisionCheck(movingRect, rect, offsetX, offsetY)) {
          store.dispatch({
            type: 'SET_COLLISION_STATE',
            collision: true
          });
          return;
        }
      }
      store.dispatch({
        type: 'SET_COLLISION_STATE',
        collision: false
      });
    }
    else {
      next(action);
    }
  }
}

type Responder = {
  onMove?: (id: string, dx: number, dy: number) => void;
  onMoveEnd?: (id: string, dx: number, dy: number) => void;
}
function responderMiddleware(getResponder: () => Responder): any {
  return (store: ReduxStore) => (next: Dispatch) => (action: ReduxAction) => {
    const responder = getResponder();
    if (action.type === 'MOVE') {
      next(action);
      const state = store.getState();
      if (!state.moving) return;
      responder.onMove?.(state.moving.boxId, state.moving.dx, state.moving.dy);
    }
    if (action.type === 'MOVE_END') {
      const state = store.getState();
      if (!state.moving) return;
      responder.onMoveEnd?.(state.moving.boxId, state.moving.dx, state.moving.dy);
      next(action);
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
type BoxRegistry = {
  register(box: BoxEntry): void;
  unregister(box: BoxEntry): void;
  getAll(): readonly BoxEntry[];
}
function createBoxRegistry(): BoxRegistry {
  const registry: BoxEntry[] = [];
  const register = (box: BoxEntry) => {
    console.log('register', box);
    registry.push(box);
  }
  const unregister = (box: BoxEntry) => {
    const idx = registry.indexOf(box);
    registry.splice(idx, 1);
  }
  const getAll = () => {
    return registry;
  }
  return {
    register,
    unregister,
    getAll
  };
}



function useClick(store: ReduxStore) {
  const mousedown = useMemo(() => (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Check if target is box,
    // If so, get the ID of box
    const closestBox = target.closest(`[${BOX_ID_ATTRIBUTE}]`);
    if (!closestBox) {
      return;
    }
    const boxId = closestBox.getAttribute(BOX_ID_ATTRIBUTE)!;
    store.dispatch({
      type: 'CLICK',
      boxId
    });
  }, [store]);

  useLayoutEffect(() => {
    window.addEventListener('mousedown', mousedown);
    return () => {
      window.removeEventListener('mousedown', mousedown);
    }
  }, [mousedown])
}



function useTranslate(store: ReduxStore, registry: BoxRegistry) {
  const isDragging = useRef<boolean>(false);
  const dragStartOffset = useRef<[number, number]>([0, 0]);

  const mousedown = useMemo(() => (e: MouseEvent) => {
    if (isDragging.current) return;

    const target = e.target as HTMLElement;
    // Check if target is box,
    // If so, get the ID of box
    const closestBox = target.closest(`[${BOX_ID_ATTRIBUTE}]`);
    if (!closestBox) {
      return;
    }
    const boxId = closestBox.getAttribute(BOX_ID_ATTRIBUTE)!;

    // Start dragging
    isDragging.current = true;
    dragStartOffset.current = [e.clientX, e.clientY];

    const rects = new Map<string, DOMRect>();
    const boxes = registry.getAll();
    for (const box of boxes) {
      const el = box.getRef();
      if (!el) continue;
      rects.set(box.id, el.getBoundingClientRect());
    }

    store.dispatch({
      type: 'MOVE_START',
      boxId,
      rects
    });
  }, [store, registry]);

  const mousemove = useMemo(() => (e: MouseEvent) => {
    if (!isDragging.current) return;

    const dx = e.clientX - dragStartOffset.current[0];
    const dy = e.clientY - dragStartOffset.current[1];
    store.dispatch({
      type: 'MOVE',
      dx, dy
    });
  }, [store]);

  const mouseup = useMemo(() => (e: MouseEvent) => {
    if (!isDragging.current) return;

    isDragging.current = false;
    store.dispatch({
      type: 'MOVE_END',
    });
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




type BoxRenderProps = {
  registry: BoxRegistry
}
type BoxesProps = {
  onMove?: (id: string, dx: number, dy: number) => void;
  onMoveEnd?: (id: string, dx: number, dy: number) => void;
  children: (renderProps: BoxRenderProps) => ReactElement;
}
export function Boxes(props: BoxesProps) {
  const {children} = props;

  const lastProps = usePrevious(props);

  const getResponder: () => Responder = useCallback(() => ({
    onMove: lastProps.current.onMove,
    onMoveEnd: lastProps.current.onMoveEnd
  }), [lastProps]);

  const boxRegistry = useMemo(() => createBoxRegistry(), []);
  const middlewares: any = useMemo(() => applyMiddleware(
    collisionCheckerMiddleware(),
    responderMiddleware(getResponder)
  ), [getResponder])
  const store: Store<ReduxState, ReduxAction> = useMemo(() => createStore(ReduxReducer, middlewares), [middlewares]);

  useClick(store);
  useTranslate(store, boxRegistry);

  const renderProps = useMemo(() => ({
    registry: boxRegistry
  }), [boxRegistry]);

  return (
    <Provider store={store} context={REDUX_CONTEXT}>
      {children(renderProps)}
    </Provider>
  )
}



function useBoxPublisher(id: string, registry: BoxRegistry, getRef: () => HTMLElement | null) {
  const entry: BoxEntry = useMemo(() => ({
    id,
    getRef
  }), [id, getRef]);
  
  useLayoutEffect(() => {
    registry.register(entry);
    return () => {
      registry.unregister(entry);
    }
  }, [entry, registry]);
}
type BoxContentRenderProps = {
  [BOX_ID_ATTRIBUTE]: string;
}
type BoxProps = {
  id: string;
  registry: BoxRegistry;
  children: (renderProps: BoxContentRenderProps, clicked: boolean, collided: boolean, offset: {x: number, y: number}, innerRef: (el: HTMLElement | null) => void) => ReactElement;
}
type BoxMappedProps = {
  clicked: boolean;
  collided: boolean;
  dx: number;
  dy: number;
}
function _Box(props: BoxProps & BoxMappedProps) {
  const {id, registry, clicked, collided, dx, dy, children} = props;

  const ref = useRef<HTMLElement | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => {
    ref.current = el;
  }, [ref]);
  const getRef = useCallback(() => ref.current, [ref]);

  useBoxPublisher(id, registry, getRef);
  
  const renderProps: BoxContentRenderProps = useMemo(() => ({
    [BOX_ID_ATTRIBUTE]: id
  }), [id]);
  const offset = useMemo(() => ({
    x: dx,
    y: dy
  }), [dx, dy]);

  return (
    <>
      {children(renderProps, clicked, collided, offset, setRef)}
      {clicked && <ClickedGizmo getRef={getRef}/>}
    </>
  )
}

export const Box = connect(
  (state: ReduxState, props: BoxProps) => {
    const boxId = props.id;
    const clicked = state.clicked === boxId;
    const collided = !!(clicked && state.moving?.collision);

    let dx = 0, dy = 0;
    if (state.moving?.boxId === boxId) {
      dx = state.moving.dx;
      dy = state.moving.dy;
    }

    return {
      clicked, collided, dx, dy
    };
  },
  undefined,
  undefined,
  {
    context: REDUX_CONTEXT
  }
)(_Box);

function useRAF(cb: () => void) {
  const rafIdRef = useRef(0);

  useEffect(() => {
    const raf = () => {
      cb();
      rafIdRef.current = requestAnimationFrame(raf);
    };
    rafIdRef.current = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafIdRef.current);
    }
  }, [cb]);
}
type ClickedGizmoProps = {
  getRef: () => HTMLElement | null
}
function ClickedGizmo(props: ClickedGizmoProps) {
  const {getRef} = props;

  const [style, setStyle] = useState({
    left: `0px`,
    top: `0px`,
    width: `0px`,
    height: `0px`
  });

  const update = useCallback(() => {
    const el = getRef();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setStyle({
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }, [getRef]);
  useRAF(update);

  return (
    <div style={{
      position: 'fixed',
      border: '4px solid Tomato',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      ...style
    }}></div>
  )
}