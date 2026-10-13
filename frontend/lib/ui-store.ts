// In-memory UI state (not persisted): whether the side bag is open. Same
// useSyncExternalStore idiom as the other stores in this folder.
type UiState = { cartOpen: boolean };

let state: UiState = { cartOpen: false };
const listeners = new Set<() => void>();

function setState(next: UiState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function subscribeToUi(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUiSnapshot(): UiState {
  return state;
}

export function getUiServerSnapshot(): UiState {
  return { cartOpen: false };
}

export function openCartDrawer(): void {
  if (!state.cartOpen) setState({ ...state, cartOpen: true });
}

export function closeCartDrawer(): void {
  if (state.cartOpen) setState({ ...state, cartOpen: false });
}

// The bag page and checkout already show the bag, so the drawer stays out of
// the way there.
export function cartDrawerSuppressedFor(pathname: string): boolean {
  return pathname === "/cart" || pathname.startsWith("/checkout");
}
