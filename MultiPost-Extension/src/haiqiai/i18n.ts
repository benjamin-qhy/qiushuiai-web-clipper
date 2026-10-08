import messages from "./messages.json";
export function message(key: keyof typeof messages): string {
  return globalThis.chrome?.i18n?.getMessage(key) || messages[key].message;
}
