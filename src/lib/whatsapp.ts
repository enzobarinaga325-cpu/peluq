import { formatDateLong } from "./format";

/**
 * Normaliza a formato internacional para wa.me. Asume Argentina (54) y celular (9).
 * Pedimos en el formulario que carguen el número con código de área, sin 0 ni 15,
 * porque ese prefijo local no se puede reconstruir de forma confiable en el resto de los casos.
 */
export function normalizePhoneForWhatsApp(raw: string, countryCode = "54"): string {
  let digits = raw.replace(/\D/g, "");
  digits = digits.replace(/^0/, "");
  if (digits.startsWith(countryCode)) {
    const rest = digits.slice(countryCode.length);
    return rest.startsWith("9") ? countryCode + rest : countryCode + "9" + rest;
  }
  return countryCode + "9" + digits;
}

export function buildReminderMessage(opts: {
  clientName: string;
  employeeName: string;
  serviceName: string;
  date: string;
  startTime: string;
}): string {
  const { clientName, employeeName, serviceName, date, startTime } = opts;
  return (
    `Hola ${clientName}! Te escribimos para recordarte tu turno de ${serviceName} ` +
    `con ${employeeName} el ${formatDateLong(date)} a las ${startTime.slice(0, 5)} hs. ` +
    `Cualquier cosa avisanos. ¡Te esperamos!`
  );
}

export function waLink(phone: string, message: string): string {
  const normalized = normalizePhoneForWhatsApp(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
