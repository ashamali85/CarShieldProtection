/**
 * WhatsApp "click to chat" helpers (no API account needed): a link that opens WhatsApp with the
 * customer's number and a ready message. Pure, so the browser can use it as the number is typed.
 */

/**
 * The international number WhatsApp needs (digits only), or null. Accepts Arabic digits, spaces,
 * +, 00 prefixes; an 8-digit number is taken as Kuwaiti (+965).
 */
export function whatsappNumber(input: string): string | null {
  let d = input.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = `965${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function whatsappLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Fills {placeholders} in a message template. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}
