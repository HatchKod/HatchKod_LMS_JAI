const IST = "Asia/Kolkata";
const LOCALE = "en-IN";

export const fmtDate = (dateVal, opts = {}) =>
  new Date(dateVal).toLocaleDateString(LOCALE, { timeZone: IST, ...opts });

export const fmtTime = (dateVal, opts = {}) =>
  new Date(dateVal).toLocaleTimeString(LOCALE, { timeZone: IST, ...opts });

export const fmtDateTime = (dateVal, opts = {}) =>
  new Date(dateVal).toLocaleString(LOCALE, { timeZone: IST, ...opts });

export const istDay = (dateVal) =>
  parseInt(new Intl.DateTimeFormat(LOCALE, { timeZone: IST, day: "numeric" }).format(new Date(dateVal)), 10);

export const istMonth = (dateVal) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: IST, month: "short" }).format(new Date(dateVal));
