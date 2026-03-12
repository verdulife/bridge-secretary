declare global {
  interface Window {
    Telegram: {
      WebApp: any;
    };
  }
}

export const tg = window.Telegram.WebApp;

export function init() {
  tg.ready();
  tg.expand();
}

export function getInitData(): string {
  return tg.initData;
}

export function getUser() {
  return tg.initDataUnsafe?.user;
}

export function onThemeChange(callback: () => void) {
  tg.onEvent("themeChanged", callback);
}

export function showAlert(message: string): Promise<void> {
  return new Promise(resolve => tg.showAlert(message, resolve));
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise(resolve => tg.showConfirm(message, (ok: boolean) => resolve(ok)));
}

export function haptic(type: "light" | "medium" | "heavy" | "success" | "error" | "warning") {
  if (type === "success" || type === "error" || type === "warning") {
    tg.HapticFeedback.notificationOccurred(type);
  } else {
    tg.HapticFeedback.impactOccurred(type);
  }
}