import type { EngineGate, MCARequirement } from './mcaRequirements';
import { MCA_ROUTES } from './routes/mca';
import { USCG_ROUTES } from './routes/uscg';
import { AMSA_ROUTES } from './routes/amsa';
import { MNZ_ROUTES } from './routes/mnz';
import { SAMSA_ROUTES } from './routes/samsa';

/**
 * One MCA yacht progress bar, for routes that change the fixed yacht figures
 * (mcaRows in CertificationProgress). `onboard` is every day on board in any
 * service type, as MSN 1904 5.9 counts onboard yacht service.
 */
export interface YachtBar {
  label: string;
  kind: 'seagoing' | 'watch' | 'additional' | 'onboard';
  days: number;
  /** Only service on or after the route's start date counts. */
  afterStart?: boolean;
}

/** An engine gate that can be limited to service after the route's start date. */
export type RouteEngineGate = EngineGate & { afterStart?: boolean };

/**
 * One way of qualifying for a certificate: the standard route, an experienced
 * seafarer route, a graduate route and so on. The first route listed for a
 * certificate is its default and keeps the certificate's own figures, so a user
 * who never picks a route sees exactly what they saw before.
 *
 * Measured fields left out keep the certificate's own value. Only routes whose
 * service figures differ belong here: a route that changes only exams or
 * courses gives the app nothing different to measure.
 */
export interface CertRoute {
  id: string;
  /** Short name for the picker, e.g. 'Experienced Seafarer route'. */
  label: string;
  /** Who the route is for, one sentence. */
  summary: string;
  /** Where the figures come from, e.g. 'MSN 1904 4.4'. */
  source: string;
  totalDays?: number;
  watchkeepingDays?: number;
  /** The route's own task-book or record-book figures (AMSA, MNZ), used when that toggle is on. */
  totalDaysWithRecordBook?: number;
  watchkeepingDaysWithRecordBook?: number;
  totalHours?: number;
  /** Replaces the certificate's engine gates (commercial users of MCA engine routes). */
  engineGates?: RouteEngineGate[];
  /** Replaces the fixed MCA yacht bars (yacht users). */
  yachtBars?: YachtBar[];
  workboatRoute?: MCARequirement['workboatRoute'];
  tugRoute?: MCARequirement['tugRoute'];
  /**
   * The route counts some service only after a date the user enters, such as
   * registering with a college. `all` limits every figure to that date;
   * `marked` limits only the gates and bars flagged `afterStart`.
   */
  startDate?: { label: string; scope: 'all' | 'marked' };
  /** What the app cannot check on this route, shown under the bars. */
  caveat?: string;
}

const ROUTES: Record<string, CertRoute[]> = {
  ...MCA_ROUTES,
  ...USCG_ROUTES,
  ...AMSA_ROUTES,
  ...MNZ_ROUTES,
  ...SAMSA_ROUTES,
};

/** Routes for a certificate, default first. Empty when it has only one. */
export const getRoutes = (requirementId: string | undefined): CertRoute[] =>
  (requirementId && ROUTES[requirementId]) || [];

/** The chosen route, or the default when the saved one is not on this certificate. */
export const pickRoute = (
  requirementId: string | undefined,
  routeId: string | null | undefined,
): CertRoute | undefined => {
  const routes = getRoutes(requirementId);
  return routes.find((r) => r.id === routeId) ?? routes[0];
};

/** The certificate as measured on a route: the route's figures over its own. */
export const applyRoute = (
  requirement: MCARequirement | undefined,
  route: CertRoute | undefined,
): MCARequirement | undefined => {
  if (!requirement || !route) return requirement;
  // A certificate's record-book figures belong to its default route, so a route
  // with its own figure drops them unless it states its own.
  const ownTotal = route.totalDays !== undefined;
  const ownWatch = route.watchkeepingDays !== undefined;
  return {
    ...requirement,
    ...(ownTotal && { totalDaysWithRecordBook: undefined }),
    ...(ownWatch && { watchkeepingDaysWithRecordBook: undefined }),
    ...(route.totalDays !== undefined && { totalDays: route.totalDays }),
    ...(route.watchkeepingDays !== undefined && { watchkeepingDays: route.watchkeepingDays }),
    ...(route.totalDaysWithRecordBook !== undefined && { totalDaysWithRecordBook: route.totalDaysWithRecordBook }),
    ...(route.watchkeepingDaysWithRecordBook !== undefined && {
      watchkeepingDaysWithRecordBook: route.watchkeepingDaysWithRecordBook,
    }),
    ...(route.totalHours !== undefined && { totalHours: route.totalHours }),
    ...(route.workboatRoute && { workboatRoute: route.workboatRoute }),
    ...(route.tugRoute && { tugRoute: route.tugRoute }),
    ...(route.engineGates &&
      requirement.engineRoute && { engineRoute: { ...requirement.engineRoute, gates: route.engineGates } }),
  };
};

/** Every route id in the data, for tests. */
export const ALL_ROUTES = ROUTES;
