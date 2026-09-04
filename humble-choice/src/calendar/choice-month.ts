const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type MonthSlug = `${(typeof MONTH_NAMES)[number]}-${number}`;

/** Humble Choice membership pages start here; earlier months live on Monthly URLs. */
export const EARLIEST_MEMBERSHIP_MONTH: MonthSlug = "December-2019";

/** Humble Monthly product pages start here; October 2015 and earlier 404. */
export const EARLIEST_CHOICE_MONTH: MonthSlug = "November-2015";

const slugPattern = new RegExp(
  `^(${MONTH_NAMES.join("|")})-(\\d{4})$`,
);

export const choiceMonthSlugFromDate = (
  date: Date,
  timeZone = "America/Los_Angeles",
): MonthSlug => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    year: "numeric",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  if (!month || !year) {
    throw new Error("Unable to format Humble Choice month slug");
  }
  return `${month}-${year}` as MonthSlug;
};

export const parseMonthSlug = (slug: string) => {
  const match = slugPattern.exec(slug);
  if (!match) {
    return null;
  }
  return {
    monthName: match[1] as (typeof MONTH_NAMES)[number],
    monthIndex: MONTH_NAMES.indexOf(match[1] as (typeof MONTH_NAMES)[number]),
    year: Number(match[2]),
  };
};

export const compareMonthSlugs = (left: MonthSlug, right: MonthSlug) => {
  const parsedLeft = parseMonthSlug(left);
  const parsedRight = parseMonthSlug(right);
  if (!parsedLeft || !parsedRight) {
    throw new Error(`Invalid Humble Choice slug: ${left} / ${right}`);
  }
  return (
    parsedLeft.year * 12 +
    parsedLeft.monthIndex -
    (parsedRight.year * 12 + parsedRight.monthIndex)
  );
};

export const shiftMonthSlug = (slug: MonthSlug, delta: number): MonthSlug => {
  const parsed = parseMonthSlug(slug);
  if (!parsed) {
    throw new Error(`Invalid Humble Choice slug: ${slug}`);
  }
  const date = new Date(Date.UTC(parsed.year, parsed.monthIndex + delta, 1));
  return `${MONTH_NAMES[date.getUTCMonth()]}-${date.getUTCFullYear()}` as MonthSlug;
};

export const monthIdFromSlug = (slug: MonthSlug) => {
  const parsed = parseMonthSlug(slug);
  if (!parsed) {
    throw new Error(`Invalid Humble Choice slug: ${slug}`);
  }
  return `${parsed.year}-${String(parsed.monthIndex + 1).padStart(2, "0")}`;
};

export const membershipUrlFromSlug = (slug: string) =>
  `https://www.humblebundle.com/membership/${slug}`;

export const monthlyUrlFromSlug = (slug: string) => {
  const parsed = parseMonthSlug(slug);
  if (!parsed) {
    throw new Error(`Invalid Humble Choice slug: ${slug}`);
  }
  return `https://www.humblebundle.com/monthly/p/${parsed.monthName.toLowerCase()}_${parsed.year}_monthly`;
};

export const nearbyMonthSlugs = (now = new Date()) => {
  const current = choiceMonthSlugFromDate(now);
  return [shiftMonthSlug(current, -1), current, shiftMonthSlug(current, 1)];
};

export const backfillMonthSlugs = (current: MonthSlug, count: number) => {
  return Array.from({ length: count }, (_, index) =>
    shiftMonthSlug(current, -index),
  );
};
