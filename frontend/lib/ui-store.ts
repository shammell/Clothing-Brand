// In-memory UI state (not persisted): whether the side bag is open. Same
// useSyncExternalStore idiom as the other stores in this folder.
type UiState = { cartOpen: boolean; announcement: string };

let state: UiState = { cartOpen: false, announcement: "" };
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

const SERVER_STATE: UiState = { cartOpen: false, announcement: "" };

export function getUiServerSnapshot(): UiState {
  return SERVER_STATE;
}

export function openCartDrawer(): void {
  if (!state.cartOpen) setState({ ...state, cartOpen: true });
}

export function closeCartDrawer(): void {
  if (state.cartOpen) setState({ ...state, cartOpen: false });
}

export function addedAnnouncement(name: string, size: string, count: number): string {
  return `Added ${name}, size ${size}. Bag has ${count} ${count === 1 ? "item" : "items"}.`;
}

// Screen-reader text for the live region in the header; a fresh object each
// time so the same text announced twice still re-triggers.
export function announce(announcement: string): void {
  setState({ ...state, announcement });
}

// The bag page and checkout already show the bag, so the drawer stays out of
// the way there.
export function cartDrawerSuppressedFor(pathname: string): boolean {
  return pathname === "/cart" || pathname.startsWith("/checkout");
}
