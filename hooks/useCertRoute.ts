import { useCallback, useEffect, useMemo, useState } from 'react';
import { CertRoute, getRoutes, pickRoute } from '@/constants/certRoutes';
import {
  MaritimeAuthority,
  getDefaultTargetId,
  getRequirementByIdForPathway,
} from '@/constants/mcaRequirements';
import type { RouteSinceStart, ServiceTypeDays } from '@/components/CertificationProgress';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { warn } from '@/utils/log';

const ALL_SERVICE_TYPES = [
  'actual_sea_service',
  'watchkeeping_service',
  'standby_service',
  'yard_service',
  'service_in_port',
];

/** Every service type with its days, zero-filled, from a summary list. */
const withAllTypes = (list: ServiceTypeDays[] | undefined): ServiceTypeDays[] =>
  ALL_SERVICE_TYPES.map((service_type) => ({
    service_type,
    total_days: list?.find((s) => s.service_type === service_type)?.total_days ?? 0,
  }));

/** The figures a route needs from a summary counted from its start date. */
export const sinceStartFromSummary = (summary: any): RouteSinceStart => ({
  serviceTypes: withAllTypes(summary?.entries_by_service_type),
  yachtServiceTypes: withAllTypes(summary?.commercial_service?.yacht_entries_by_service_type),
  onboardDays: summary?.onboard_days ?? 0,
  yachtOnboardDays: summary?.yacht_onboard_days ?? 0,
  uscgService: summary?.uscg_service ?? null,
  amsaService: summary?.amsa_service ?? null,
  mnzService: summary?.mnz_service ?? null,
  samsaService: summary?.samsa_service ?? null,
  commercialService: summary?.commercial_service ?? null,
  workboatService: summary?.workboat_service ?? null,
  engineService: summary?.engine_service ?? null,
  tugService: summary?.tug_service ?? null,
});

interface Options {
  authority: MaritimeAuthority | null | undefined;
  department: string | null | undefined;
  targetId: string | null | undefined;
  /** Saved values from the profile. */
  savedRouteId: string | null | undefined;
  savedStartDate: string | null | undefined;
  /** Bumped when the screen reloads its summary, so the dated one follows. */
  refreshKey?: number;
}

/**
 * The route the user is taking to their target certificate, its start date,
 * and the summary counted from that date. Shared by the iOS and Android
 * profile screens so the two stay at parity.
 */
export function useCertRoute({ authority, department, targetId, savedRouteId, savedStartDate, refreshKey = 0 }: Options) {
  const dept: 'deck' | 'engineering' = department?.toLowerCase() === 'engineering' ? 'engineering' : 'deck';
  const resolvedAuthority: MaritimeAuthority = authority ?? 'mca';

  // Same resolution as CertificationProgress: a saved target outside this pathway falls back to the default.
  const requirementId = useMemo(() => {
    if (targetId && getRequirementByIdForPathway(targetId, resolvedAuthority, dept)) return targetId;
    return getDefaultTargetId(resolvedAuthority, dept);
  }, [targetId, resolvedAuthority, dept]);

  const [routeId, setRouteId] = useState<string | null>(savedRouteId ?? null);
  const [startDate, setStartDateState] = useState<string | null>(savedStartDate ?? null);
  const [sinceStart, setSinceStart] = useState<RouteSinceStart | null>(null);

  // Follow the saved values, and the target too: a new target saves an empty
  // route, which leaves savedRouteId unchanged if it was already empty.
  useEffect(() => {
    setRouteId(savedRouteId ?? null);
    setStartDateState(savedStartDate ?? null);
  }, [savedRouteId, savedStartDate, requirementId]);

  const routes: CertRoute[] = useMemo(() => getRoutes(requirementId), [requirementId]);
  const route = useMemo(() => pickRoute(requirementId, routeId), [requirementId, routeId]);
  const needsDate = !!route?.startDate && !!startDate;

  useEffect(() => {
    if (!needsDate) {
      setSinceStart(null);
      return;
    }
    let cancelled = false;
    seaTimeApi
      .getReportSummary({ startDate: startDate! })
      .then((data) => {
        if (!cancelled) setSinceStart(sinceStartFromSummary(data));
      })
      .catch((e) => {
        warn('[useCertRoute] could not load the dated summary', e);
        if (!cancelled) setSinceStart(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsDate, startDate, refreshKey]);

  const selectRoute = useCallback(async (id: string) => {
    const previous = { routeId, startDate };
    // A college registration date is not an Action Plan date, so a route that
    // asks for a different date starts without one.
    const next = routes.find((r) => r.id === id);
    const keepDate = !!startDate && next?.startDate?.label === route?.startDate?.label;
    setRouteId(id);
    if (!keepDate) setStartDateState(null);
    try {
      await seaTimeApi.updateUserProfile({ target_route: id, ...(keepDate ? {} : { route_start_date: null }) });
    } catch (e) {
      warn('[useCertRoute] could not save the route', e);
      setRouteId(previous.routeId);
      setStartDateState(previous.startDate);
    }
  }, [routeId, startDate, routes, route]);

  const setStartDate = useCallback(async (date: string | null) => {
    const previous = startDate;
    setStartDateState(date);
    try {
      await seaTimeApi.updateUserProfile({ route_start_date: date });
    } catch (e) {
      warn('[useCertRoute] could not save the route start date', e);
      setStartDateState(previous);
    }
  }, [startDate]);

  return { routes, route, routeId: route?.id ?? null, startDate, sinceStart, selectRoute, setStartDate };
}
