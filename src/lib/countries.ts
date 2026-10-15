const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/** Codes the runtime names but that are not countries: user-assigned ones and groupings. XK (Kosovo) stays. */
const NOT_COUNTRIES = /^(?:AA|Q[M-Z]|X[A-JL-Z]|ZZ|EU|EZ|UN)$/;

/** An ISO 3166-1 alpha-2 country code ("CO", "ES"). */
export function isCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value) && !NOT_COUNTRIES.test(value) && regionNames.of(value) !== undefined;
}
