type OpeningHoursPointLike = {
  readonly day: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly hours?: number;
  readonly minutes?: number;
};

type OpeningHoursPeriodLike = {
  readonly open: OpeningHoursPointLike;
  readonly close?: OpeningHoursPointLike | null;
};

type OpeningHoursLike = {
  readonly periods?: readonly OpeningHoursPeriodLike[] | null;
};

export type GooglePlaceOpeningHoursStatus = {
  readonly isOpenNow: boolean | undefined;
  readonly openStatusText: string | null;
  readonly todayHoursText: string | null;
};

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export function getGooglePlaceOpeningHoursStatus(
  openingHours: OpeningHoursLike | null | undefined,
  locale: string,
  now = new Date(),
): GooglePlaceOpeningHoursStatus {
  const periods = openingHours?.periods;
  if (!periods || periods.length === 0) {
    return {
      isOpenNow: undefined,
      openStatusText: null,
      todayHoursText: null,
    };
  }

  const formatTime = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const formatWeekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
  });
  const today = now.getDay();
  const nowMinuteOfDay = now.getHours() * 60 + now.getMinutes();
  const nowMinuteOfWeek = today * MINUTES_PER_DAY + nowMinuteOfDay;
  const activePeriod = getActivePeriod(periods, nowMinuteOfWeek);
  const nextOpening = getNextOpening(periods, nowMinuteOfWeek);

  return {
    isOpenNow: Boolean(activePeriod),
    openStatusText: getOpenStatusText(
      activePeriod,
      nextOpening,
      now,
      nowMinuteOfWeek,
      formatTime,
    ),
    todayHoursText: getTodayHoursText(
      periods,
      today,
      now,
      nowMinuteOfDay,
      activePeriod,
      nextOpening,
      formatTime,
      formatWeekday,
    ),
  };
}

function getActivePeriod(
  periods: readonly OpeningHoursPeriodLike[],
  nowMinuteOfWeek: number,
): ActivePeriod | null {
  for (const period of periods) {
    const normalized = normalizePeriod(period);
    if (!normalized) {
      continue;
    }

    for (const candidateNow of [
      nowMinuteOfWeek,
      nowMinuteOfWeek + MINUTES_PER_WEEK,
    ]) {
      const isAlwaysOpen = normalized.closeMinuteOfWeek === null;
      const isOpen =
        candidateNow >= normalized.openMinuteOfWeek &&
        (isAlwaysOpen || candidateNow < normalized.closeMinuteOfWeek);
      if (isOpen) {
        return {
          ...normalized,
          activeNowMinuteOfWeek: candidateNow,
        };
      }
    }
  }

  return null;
}

function getNextOpening(
  periods: readonly OpeningHoursPeriodLike[],
  nowMinuteOfWeek: number,
): NormalizedOpening | null {
  let next: NormalizedOpening | null = null;

  for (const period of periods) {
    const normalized = normalizePeriod(period);
    if (!normalized) {
      continue;
    }

    const openMinuteOfWeek =
      normalized.openMinuteOfWeek > nowMinuteOfWeek
        ? normalized.openMinuteOfWeek
        : normalized.openMinuteOfWeek + MINUTES_PER_WEEK;
    if (!next || openMinuteOfWeek < next.openMinuteOfWeek) {
      next = {
        open: normalized.open,
        openMinuteOfWeek,
      };
    }
  }

  return next;
}

function getOpenStatusText(
  activePeriod: ActivePeriod | null,
  nextOpening: NormalizedOpening | null,
  now: Date,
  nowMinuteOfWeek: number,
  formatTime: Intl.DateTimeFormat,
): string | null {
  if (activePeriod) {
    if (activePeriod.closeMinuteOfWeek === null) {
      return $localize`:@@googlePlace.open24Hours:Open 24 hours`;
    }

    const closeDate = addMinutes(
      now,
      activePeriod.closeMinuteOfWeek - activePeriod.activeNowMinuteOfWeek,
    );
    return $localize`:@@googlePlace.openNowUntil:Open now until ${formatTime.format(closeDate)}`;
  }

  if (
    nextOpening &&
    nextOpening.open.day === now.getDay() &&
    nextOpening.openMinuteOfWeek - nowMinuteOfWeek < MINUTES_PER_DAY
  ) {
    const openDate = addMinutes(
      now,
      nextOpening.openMinuteOfWeek - nowMinuteOfWeek,
    );
    return $localize`:@@googlePlace.opensAt:Opens at ${formatTime.format(openDate)}`;
  }

  return null;
}

function getTodayHoursText(
  periods: readonly OpeningHoursPeriodLike[],
  today: number,
  now: Date,
  nowMinuteOfDay: number,
  activePeriod: ActivePeriod | null,
  nextOpening: NormalizedOpening | null,
  formatTime: Intl.DateTimeFormat,
  formatWeekday: Intl.DateTimeFormat,
): string | null {
  const todaysPeriods = periods
    .map(normalizePeriod)
    .filter(
      (period): period is NormalizedPeriod =>
        period !== null && period.open.day === today,
    )
    .sort(
      (a, b) =>
        (pointMinuteOfDay(a.open) ?? 0) - (pointMinuteOfDay(b.open) ?? 0),
    );

  if (activePeriod?.close === null) {
    return null;
  }

  if (activePeriod && todaysPeriods.length === 0) {
    return null;
  }

  const hasUpcomingToday = todaysPeriods.some(
    (period) => (pointMinuteOfDay(period.open) ?? 0) > nowMinuteOfDay,
  );
  if (
    todaysPeriods.length === 0 ||
    (!activePeriod && !hasUpcomingToday && nextOpening)
  ) {
    return getNextOpeningText(nextOpening, now, formatTime, formatWeekday);
  }

  const intervals = todaysPeriods.map((period) => {
    if (period.close === null) {
      return $localize`:@@googlePlace.open24Hours:Open 24 hours`;
    }

    const openDate = dateForPointOnToday(now, period.open);
    const closeDate = dateForClosePoint(openDate, period.open, period.close);
    return $localize`:@@googlePlace.openHoursRange:Open ${formatTime.format(openDate)}-${formatTime.format(closeDate)}`;
  });

  return intervals.join(", ");
}

function getNextOpeningText(
  nextOpening: NormalizedOpening | null,
  now: Date,
  formatTime: Intl.DateTimeFormat,
  formatWeekday: Intl.DateTimeFormat,
): string | null {
  if (!nextOpening) {
    return $localize`:@@7860418101283165917:Closed`;
  }

  const todayMinuteOfWeek = now.getDay() * MINUTES_PER_DAY;
  const openDate = addMinutes(
    startOfToday(now),
    nextOpening.openMinuteOfWeek - todayMinuteOfWeek,
  );
  return $localize`:@@3599528462269889129:Closed · Opens ${formatWeekday.format(openDate)}. ${formatTime.format(openDate)}`;
}

type NormalizedPeriod = {
  readonly open: OpeningHoursPointLike;
  readonly close: OpeningHoursPointLike | null;
  readonly openMinuteOfWeek: number;
  readonly closeMinuteOfWeek: number | null;
};

type ActivePeriod = NormalizedPeriod & {
  readonly activeNowMinuteOfWeek: number;
};

type NormalizedOpening = {
  readonly open: OpeningHoursPointLike;
  readonly openMinuteOfWeek: number;
};

function normalizePeriod(
  period: OpeningHoursPeriodLike,
): NormalizedPeriod | null {
  const openMinuteOfWeek = pointMinuteOfWeek(period.open);
  if (openMinuteOfWeek === null) {
    return null;
  }

  if (!period.close) {
    return {
      open: period.open,
      close: null,
      openMinuteOfWeek,
      closeMinuteOfWeek: null,
    };
  }

  let closeMinuteOfWeek = pointMinuteOfWeek(period.close);
  if (closeMinuteOfWeek === null) {
    return null;
  }

  if (closeMinuteOfWeek <= openMinuteOfWeek) {
    closeMinuteOfWeek += MINUTES_PER_WEEK;
  }

  return {
    open: period.open,
    close: period.close,
    openMinuteOfWeek,
    closeMinuteOfWeek,
  };
}

function pointMinuteOfWeek(point: OpeningHoursPointLike): number | null {
  const minuteOfDay = pointMinuteOfDay(point);
  if (minuteOfDay === null) {
    return null;
  }

  return point.day * MINUTES_PER_DAY + minuteOfDay;
}

function pointMinuteOfDay(point: OpeningHoursPointLike | null): number | null {
  if (!point) {
    return null;
  }

  const hour = point.hour ?? point.hours;
  const minute = point.minute ?? point.minutes ?? 0;
  if (hour === undefined) {
    return null;
  }

  return hour * 60 + minute;
}

function dateForPointOnToday(now: Date, point: OpeningHoursPointLike): Date {
  const date = new Date(now);
  date.setHours(
    point.hour ?? point.hours ?? 0,
    point.minute ?? point.minutes ?? 0,
    0,
    0,
  );
  return date;
}

function dateForClosePoint(
  openDate: Date,
  open: OpeningHoursPointLike,
  close: OpeningHoursPointLike,
): Date {
  const closeDate = new Date(openDate);
  const openMinute = pointMinuteOfDay(open);
  const closeMinute = pointMinuteOfDay(close);
  let dayOffset = close.day - open.day;
  if (dayOffset < 0) {
    dayOffset += 7;
  }
  if (
    dayOffset === 0 &&
    openMinute !== null &&
    closeMinute !== null &&
    closeMinute <= openMinute
  ) {
    dayOffset = 1;
  }

  closeDate.setDate(closeDate.getDate() + dayOffset);
  closeDate.setHours(
    close.hour ?? close.hours ?? 0,
    close.minute ?? close.minutes ?? 0,
    0,
    0,
  );
  return closeDate;
}

function startOfToday(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setSeconds(0, 0);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}
