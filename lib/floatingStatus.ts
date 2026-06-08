export const FLOATING_STATUS_EVENT = 'floatingStatus';

export interface FloatingStatusDetail {
  kind: 'success' | 'error';
  message: string;
}

export const showFloatingStatus = (detail: FloatingStatusDetail): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<FloatingStatusDetail>(FLOATING_STATUS_EVENT, {
    detail,
  }));
};
