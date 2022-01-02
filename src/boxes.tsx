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
  clicked: string[];
  moving: undefined | {
    boxId: string[];
    dx: number;
    dy: number;
  }
  rects: Map<string, DOMRect>;
}

type ClickAction = {
  type: 'CLICK';
  boxId: string | string[] | undefined;
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
type PublishRectMapAction = {
  type: 'PUBLISH_RECT_MAP',
}
type SetRectMapAction = {
  type: 'SET_RECT_MAP',
  rects: Map<string, DOMRect>;
}
type ReduxAction = ClickAction | MoveStartAction | MoveAction | MoveEndAction | PublishRectMapAction | SetRectMapAction;
type ReduxStore = Store<ReduxState, ReduxAction>;

const ReduxReducer: any = (state: ReduxState = {
  clicked: [],
  moving: undefined,
  rects: new Map()
}, action: ReduxAction): ReduxState => {
  if (action.type === 'CLICK') {
    const boxId = action.boxId === undefined ? [] : Array.isArray(action.boxId) ? action.boxId : [action.boxId];
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
  if (action.type === 'MOVE_START') {
    const boxId = action.boxId;
    return {
      ...state,
      moving: {
        boxId,
        dx: 0,
        dy: 0,
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
  if (action.type === 'SET_RECT_MAP') {
    return {
      ...state,
      rects: action.rects
    }
  }
  return state;
};

function checkCollision(rect1: DOMRect, rect2: DOMRect, offsetX: number, offsetY: number) {
  return (rect1.x + offsetX < rect2.x + rect2.width &&
    rect1.x + offsetX + rect1.width > rect2.x &&
    rect1.y + offsetY < rect2.y + rect2.height &&
    rect1.height + rect1.y + offsetY > rect2.y)
}

function rectMapPublisherMiddleware(registry: BoxRegistry): any {
  return (store: ReduxStore) => (next: Dispatch) => (action: ReduxAction) => {
    if (action.type === 'PUBLISH_RECT_MAP') {
      const rects = new Map<string, DOMRect>();
      const boxes = registry.getAll();
      for (const box of boxes) {
        const el = box.getRef();
        if (!el) continue;
        rects.set(box.id, el.getBoundingClientRect());
      }
      store.dispatch({
        type: 'SET_RECT_MAP',
        rects
      });
      next(action);
    }
    next(action);
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
      for (const boxId of state.moving.boxId) {
        responder.onMove?.(boxId, state.moving.dx, state.moving.dy);
      }
    }
    if (action.type === 'MOVE_END') {
      const state = store.getState();
      if (!state.moving) return;
      for (const boxId of state.moving.boxId) {
        responder.onMoveEnd?.(boxId, state.moving.dx, state.moving.dy);
      }
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
      store.dispatch({
        type: 'CLICK',
        boxId: undefined,
        multiple: false,
      });
      return;
    }
    const boxId = closestBox.getAttribute(BOX_ID_ATTRIBUTE)!;
    store.dispatch({
      type: 'CLICK',
      boxId,
      multiple: e.shiftKey,
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

    store.dispatch({
      type: 'MOVE_START',
      boxId: store.getState().clicked,
    });
  }, [store]);

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
    responderMiddleware(getResponder),
    rectMapPublisherMiddleware(boxRegistry),
  ), [getResponder, boxRegistry])
  const store: Store<ReduxState, ReduxAction> = useMemo(() => createStore(ReduxReducer, middlewares), [middlewares]);

  useClick(store);
  useTranslate(store, boxRegistry);

  const renderProps = useMemo(() => ({
    registry: boxRegistry
  }), [boxRegistry]);

  return (
    <Provider store={store} context={REDUX_CONTEXT}>
      <BoxRangeSelector store={store}/>
      {children(renderProps)}
    </Provider>
  )
}



function useBoxRangeSelector(store: ReduxStore): [boolean, {x: number, y: number, w: number, h: number}] {
  const originMousePositionRef = useRef({x: 0, y: 0});
  const stateRef = useRef('IDLE');

  const [active, setActive] = useState(false);
  const [rect, setRect] = useState({x: 0, y: 0, w: 0, h: 0});

  const mousemove = useMemo(() => (e: MouseEvent) => {
    if (stateRef.current !== 'MOVE') return;
    const x1 = Math.min(originMousePositionRef.current.x, e.clientX);
    const x2 = Math.max(originMousePositionRef.current.x, e.clientX);
    const y1 = Math.min(originMousePositionRef.current.y, e.clientY);
    const y2 = Math.max(originMousePositionRef.current.y, e.clientY);

    setRect({x: x1, y: y1, w: x2 - x1, h: y2 - y1});
    
    const rect1 = new DOMRect(x1, y1, x2 - x1, y2 - y1);
    const rects = store.getState().rects;
    const clicked: string[] = [];
    for (const [id, rect2] of rects) {
      if (checkCollision(rect1, rect2, 0, 0)) {
        clicked.push(id);
      }
    }
    store.dispatch({
      type: 'CLICK',
      boxId: clicked,
      multiple: false
    });
  }, [store]);
  const mouseup = useMemo(() => (e: MouseEvent) => {
    stateRef.current = 'IDLE';
    setActive(false);
  }, []);
  const mousedown = useMemo(() => (e: MouseEvent) => {
    if (stateRef.current !== 'IDLE') return;

    const target = e.target as HTMLElement;
    // Check if target is box,
    // If so, get the ID of box
    const closestBox = target.closest(`[${BOX_ID_ATTRIBUTE}]`);
    if (closestBox) return;

    originMousePositionRef.current = {x: e.clientX, y: e.clientY};
    stateRef.current = 'MOVE';

    setActive(true);
    setRect({x: 0, y: 0, w: 0, h: 0});
    store.dispatch({
      type: 'PUBLISH_RECT_MAP'
    });

    window.addEventListener('mousemove', mousemove);
    window.addEventListener('mouseup', mousemove);
    window.addEventListener('mouseup', mouseup);
  }, [mousemove, mouseup, store]);

  useLayoutEffect(() => {
    window.addEventListener('mousedown', mousedown);
    return () => window.removeEventListener('mousedown', mousedown);
  }, [mousedown]);

  return [active, rect];
}
type BoxRangeSelectorType = {
  store: ReduxStore
}
function BoxRangeSelector(props: BoxRangeSelectorType) {
  const {store} = props;

  const [active, rect] = useBoxRangeSelector(store);

  return active ?
    <div style={{
      position: 'fixed',
      pointerEvents: 'none',
      opacity: '.3',
      background: 'RosyBrown',
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h
    }}/> :
    <></>
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
  children: (renderProps: BoxContentRenderProps, clicked: boolean, offset: {x: number, y: number}, innerRef: (el: HTMLElement | null) => void) => ReactElement;
}
type BoxMappedProps = {
  clicked: boolean;
  dx: number;
  dy: number;
}
function _Box(props: BoxProps & BoxMappedProps) {
  const {id, registry, clicked, dx, dy, children} = props;

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
      {children(renderProps, clicked, offset, setRef)}
      {clicked && <ClickedGizmo getRef={getRef}/>}
    </>
  )
}

export const Box = connect(
  (state: ReduxState, props: BoxProps) => {
    const boxId = props.id;
    const clicked = state.clicked.indexOf(boxId) !== -1;

    let dx = 0, dy = 0;
    if (state.moving?.boxId.indexOf(boxId) !== -1) {
      dx = state.moving?.dx || 0;
      dy = state.moving?.dy || 0;
    }

    return {
      clicked, dx, dy
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