const IST = "Asia/Kolkata";
const LOCALE = "en-IN";

// Supabase/PostgREST can return timestamps without a timezone designator.
// Without it, JS Date() treats the string as local time instead of UTC.
// This helper appends 'Z' when no timezone info is present so it's always parsed as UTC.
const parseUTC = (dateVal) => {
  if (typeof dateVal !== "string") return new Date(dateVal);
  const s = dateVal.trim();
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
};

export const fmtDate = (dateVal, opts = {}) =>
  parseUTC(dateVal).toLocaleDateString(LOCALE, { timeZone: IST, ...opts });

export const fmtTime = (dateVal, opts = {}) =>
  parseUTC(dateVal).toLocaleTimeString(LOCALE, { timeZone: IST, ...opts });

export const fmtDateTime = (dateVal, opts = {}) =>
  parseUTC(dateVal).toLocaleString(LOCALE, { timeZone: IST, ...opts });

export const istDay = (dateVal) =>
  parseInt(new Intl.DateTimeFormat(LOCALE, { timeZone: IST, day: "numeric" }).format(parseUTC(dateVal)), 10);

export const istMonth = (dateVal) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: IST, month: "short" }).format(parseUTC(dateVal));
