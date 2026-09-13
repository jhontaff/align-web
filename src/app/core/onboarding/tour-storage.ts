function tourKey(tourId: string): string {
  return `align_onboarding_seen_${tourId}`;
}

export function hasSeenTour(tourId: string): boolean {
  return localStorage.getItem(tourKey(tourId)) === '1';
}

export function markTourSeen(tourId: string): void {
  localStorage.setItem(tourKey(tourId), '1');
}
