/**
 * Copies text to the clipboard. `navigator.clipboard` only exists on secure
 * pages (https or localhost): on a LAN address over http, the text is copied
 * from a hidden field instead.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (permission, focus): try the other way.
    }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    // Deprecated, but the only way to copy on a page served over http.
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
