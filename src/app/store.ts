/**
 * Almacén de estado de la aplicación (solo UI). El núcleo de simulación no depende de él; la UI se suscribe y
 * reacciona. Observable tipado sin dependencias.
 *
 * lus-sim (decisión 13): solo el modo B, sin pestañas, casos, herramientas de medida, audio ni navegador 3D de
 * VExUS; el estado que queda es la congelación.
 */
export interface AppState {
  frozen: boolean;
}

type Listener = (state: AppState, prev: AppState) => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor(
    initial: AppState,
    /** Un oyente que lanza no corta a los demás: su error se entrega aquí. */
    private readonly onListenerError: (e: unknown) => void = () => undefined,
  ) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState>): void {
    const prev = this.state;
    const next = { ...prev, ...patch };
    let changed = false;
    for (const k of Object.keys(patch) as (keyof AppState)[]) {
      if (prev[k] !== next[k]) changed = true;
    }
    if (!changed) return;
    this.state = next;
    for (const l of this.listeners) {
      try {
        l(next, prev);
      } catch (e) {
        this.onListenerError(e);
      }
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
