import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  MCARequirement,
  MaritimeAuthority,
  getDefaultTargetId,
  getRequirementByIdForPathway,
  getTargetDays,
} from '@/constants/mcaRequirements';

export interface ServiceTypeDays {
  service_type: string;
  total_days: number;
}

export interface USCGServiceSummary {
  /** Days meeting the full 8-hour day of 46 CFR 10.107. */
  creditable: number;
  /** Of those, 12-hour days on vessels the user marked two-watch, each worth 1.5 days. */
  two_watch_days?: number;
  /** The extra half days from two_watch_days. */
  two_watch_bonus?: number;
  /** creditable + two_watch_bonus. Missing from older backends. */
  creditable_total?: number;
  /** 4 to 8 hour days on a vessel under 100 GRT, creditable at the OCMI's discretion. */
  provisional: number;
  /** 4 to 8 hour days on a vessel of 100 GRT or more. */
  short_of_standard_day: number;
  /** 4 to 8 hour days held back because the vessel has no tonnage recorded. */
  awaiting_tonnage: number;
  /** Vessels those days are waiting on. */
  vessels_awaiting_tonnage: string[];
  /** Days under 4 hours, not creditable on any reading. */
  below_minimum: number;
  standby: number;
  yard: number;
  port: number;
}

/** AMSA day count from the summary endpoint, counted under Marine Order 505. */
export interface AMSAServiceSummary {
  /** Whole days of qualifying work while the vessel was underway. */
  underway: number;
  /** Whole days gained alongside, at anchor without a watch, in yard or in port. */
  not_underway: number;
  /** Qualifying hours that do not yet make a whole 8-hour day. */
  part_day_hours: number;
  qualifying_hours: number;
  /** Days derived from logged bridge-watch hours. */
  navigational_watch: number;
  /** Days derived from logged engine-room watch hours. */
  engineering_watch: number;
}

/** Maritime NZ day count from the summary endpoint, counted under SeaCert. */
export interface MNZServiceSummary {
  actual: number;
  standby: number;
  yard: number;
  port: number;
  qualifying_total: number;
  watchkeeping: number;
  /** Hours on board, for the two certificates counted in hours. */
  hours: number;
  /** Days older than the 10-year window, which will not be accepted as they stand. */
  outside_window: number;
}

/** SAMSA day count from the summary endpoint (2021 Regulations). */
export interface SAMSAServiceSummary {
  seagoing: number;
  standby_yard: number;
  watchkeeping: number;
  hours: number;
  outside_window: number;
}

/**
 * Service on vessels tagged commercial, from the summary endpoint. MCA yacht
 * deck CoCs only credit yacht service, so the yacht-only breakdown is what
 * they are measured against.
 */
export interface CommercialServiceSummary {
  qualifying_total: number;
  vessels: string[];
  yacht_entries_by_service_type: ServiceTypeDays[];
}

/** Master (Workboat) <500 GT figures (MGN 496), from the summary endpoint. */
export interface WorkboatServiceSummary {
  sea_service: number;
  sea_service_15m: number;
  watchkeeping_15m: number;
  workboat_15m: number;
  recent_sea_service: number;
  workboats_without_length: number;
}

/** MGN 496 4.3: at least 6 months of service in the 5 years before applying. */
const WORKBOAT_RECENCY_DAYS = 180;

/** Share of the required service AMSA lets you gain while not underway. */
const AMSA_NOT_UNDERWAY_CAP = { deck: 0.15, engineering: 0.33 } as const;

interface ProgressRow {
  label: string;
  current: number;
  required: number;
  /** Maritime NZ states two certificates in hours rather than days. */
  unit?: 'days' | 'hours';
}

export interface CertificationProgressProps {
  authority: MaritimeAuthority | null;
  department: string | null;
  /** Requirement id the user is working toward; falls back to the pathway default. */
  targetId?: string | null;
  serviceTypes: ServiceTypeDays[];
  /** USCG-rules day count from the summary endpoint. Required for USCG progress. */
  uscgService?: USCGServiceSummary | null;
  /** AMSA-rules day count from the summary endpoint. Required for AMSA progress. */
  amsaService?: AMSAServiceSummary | null;
  /** MNZ-rules day count from the summary endpoint. Required for MNZ progress. */
  mnzService?: MNZServiceSummary | null;
  /** SAMSA-rules day count from the summary endpoint. Required for SAMSA progress. */
  samsaService?: SAMSAServiceSummary | null;
  /** Service on commercial vessels, used to decide what carries over to MCA yacht CoCs. */
  commercialService?: CommercialServiceSummary | null;
  /** Master (Workboat) figures. Required for the MGN 496 routes. */
  workboatService?: WorkboatServiceSummary | null;
  /**
   * Whether the user holds the record of training their authority reduces sea
   * service for: an AMSA task book, or an MNZ training record book or cadet
   * programme. It roughly halves most AMSA requirements, so measuring a holder
   * against the longer figure would tell them they are further away than they
   * are.
   */
  hasRecordBook?: boolean;
  isDark: boolean;
  /** Opens the requirements screen so the user can pick a different target. */
  onChangeTarget?: () => void;
}

/** "Corsair", "Corsair and Sea Breeze", "Corsair, Sea Breeze and 2 others". */
const formatVesselList = (names: string[]): string => {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
};

const daysFor = (serviceTypes: ServiceTypeDays[], type: string): number =>
  serviceTypes.find((s) => s.service_type === type)?.total_days ?? 0;

/**
 * MCA yacht pathways keep the split the sea-time rules are written in
 * (MSN 1858 for deck, MSN 1904 for engineering), because those two figures are
 * what an assessor looks at and the app has always shown them.
 */
const mcaRows = (serviceTypes: ServiceTypeDays[], isEngineering: boolean): ProgressRow[] => {
  const seagoing = daysFor(serviceTypes, 'actual_sea_service');
  const watchkeeping = daysFor(serviceTypes, 'watchkeeping_service');
  const additional =
    daysFor(serviceTypes, 'standby_service') + daysFor(serviceTypes, 'yard_service');

  return isEngineering
    ? [
        { label: 'Seagoing Service', current: seagoing, required: 240 },
        { label: 'Watchkeeping / UMS', current: watchkeeping, required: 180 },
      ]
    : [
        { label: 'Seagoing Service', current: seagoing, required: 250 },
        { label: 'Additional Service', current: additional, required: 115 },
      ];
};

/**
 * Progress toward the credential the user is working toward.
 *
 * Shared by the iOS and Android profile screens so the two stay at parity, and
 * so a USCG user is measured against USCG rules rather than the MCA ones that
 * used to be hard-coded here.
 */
export function CertificationProgress({
  authority,
  department,
  targetId,
  serviceTypes,
  uscgService,
  amsaService,
  mnzService,
  samsaService,
  commercialService,
  workboatService,
  hasRecordBook = false,
  isDark,
  onChangeTarget,
}: CertificationProgressProps) {
  const dept: 'deck' | 'engineering' =
    department?.toLowerCase() === 'engineering' ? 'engineering' : 'deck';
  const resolvedAuthority: MaritimeAuthority = authority ?? 'mca';

  // A saved target can belong to a pathway the user has since changed away
  // from, so it is only used when it resolves inside the current one.
  const requirement: MCARequirement | undefined = useMemo(() => {
    const saved = targetId
      ? getRequirementByIdForPathway(targetId, resolvedAuthority, dept)
      : undefined;
    if (saved) return saved;
    const fallbackId = getDefaultTargetId(resolvedAuthority, dept);
    return fallbackId ? getRequirementByIdForPathway(fallbackId, resolvedAuthority, dept) : undefined;
  }, [targetId, resolvedAuthority, dept]);

  const isUSCG = resolvedAuthority === 'uscg';
  const isAMSA = resolvedAuthority === 'amsa';
  const isMNZ = resolvedAuthority === 'mnz';
  const isSAMSA = resolvedAuthority === 'samsa';

  // Commercial-vessel days only matter for MCA, where the rules split by
  // vessel type. For a yacht-only CoC they are left out of the bars; for one
  // that accepts them they stay in and are shown as carried over.
  const commercialDays =
    resolvedAuthority === 'mca' ? commercialService?.qualifying_total ?? 0 : 0;
  const excludeCommercial = commercialDays > 0 && requirement?.commercialService === 'yacht_only';

  /** Day target for this pathway, allowing for a held task or record book. */
  const targetDays = getTargetDays(requirement, hasRecordBook);
  const targetWatchkeeping =
    hasRecordBook && requirement?.watchkeepingDaysWithRecordBook
      ? requirement.watchkeepingDaysWithRecordBook
      : requirement?.watchkeepingDays;

  /**
   * How much of the not-underway service AMSA will let this target absorb. The
   * cap is a share of the required service, not of what has been logged, so it
   * can only be worked out once the target is known.
   */
  const amsaAllowance =
    isAMSA && targetDays
      ? Math.floor(targetDays * AMSA_NOT_UNDERWAY_CAP[dept === 'engineering' ? 'engineering' : 'deck'])
      : 0;
  const amsaNotUnderwayCounted = amsaService
    ? Math.min(amsaService.not_underway, amsaAllowance)
    : 0;

  const rows: ProgressRow[] = useMemo(() => {
    if (isUSCG) {
      // Without the USCG day count from the summary endpoint there is no
      // honest number to draw. Showing 0 of 720 would read as "no service
      // logged" when the truth is "not counted yet", so render the notice
      // below instead of a bar that is wrong.
      if (!requirement?.totalDays || !uscgService) return [];
      return [
        {
          label: 'Creditable Service',
          current: uscgService.creditable_total ?? uscgService.creditable,
          required: requirement.totalDays,
        },
      ];
    }

    if (resolvedAuthority === 'mca' && requirement?.workboatRoute) {
      // Without the workboat figures there is no honest bar to draw.
      if (!workboatService) return [];
      const route = requirement.workboatRoute;
      const out: ProgressRow[] = [];
      if (route.seaServiceDays) {
        out.push({ label: 'Sea Service', current: workboatService.sea_service, required: route.seaServiceDays });
      }
      if (route.seaService15mDays) {
        out.push({ label: 'Sea Service, Vessels 15m+', current: workboatService.sea_service_15m, required: route.seaService15mDays });
      }
      out.push({ label: 'Watchkeeping, Vessels 15m+', current: workboatService.watchkeeping_15m, required: route.watchkeeping15mDays });
      out.push({ label: 'Workboat Service, 15m+', current: workboatService.workboat_15m, required: route.workboat15mDays });
      out.push({ label: 'In the Last 5 Years', current: workboatService.recent_sea_service, required: WORKBOAT_RECENCY_DAYS });
      return out;
    }

    if (resolvedAuthority === 'mca') {
      return mcaRows(
        excludeCommercial && commercialService
          ? commercialService.yacht_entries_by_service_type
          : serviceTypes,
        dept === 'engineering',
      );
    }

    if (isAMSA) {
      // Same reasoning as the USCG branch: the MCA-shaped totals in
      // `serviceTypes` are not counted under Marine Order 505, so without the
      // AMSA figure there is no honest bar to draw.
      if (!targetDays || !amsaService) return [];
      const out: ProgressRow[] = [
        {
          label: 'Qualifying Service',
          current: amsaService.underway + amsaNotUnderwayCounted,
          required: targetDays,
        },
      ];
      if (targetWatchkeeping) {
        out.push({
          label: 'In Charge of a Navigational Watch',
          current: amsaService.navigational_watch,
          required: targetWatchkeeping,
        });
      }
      return out;
    }

    if (isMNZ) {
      if (!mnzService) return [];
      // Skipper Restricted Limits and MEC 6 are stated in hours, and converting
      // them to days would invent a rule Maritime NZ did not write.
      if (requirement?.totalHours) {
        return [
          {
            label: 'Sea Service',
            current: Math.floor(mnzService.hours),
            required: requirement.totalHours,
            unit: 'hours',
          },
        ];
      }
      if (!targetDays) return [];
      const out: ProgressRow[] = [
        {
          label: 'Qualifying Service',
          current: mnzService.qualifying_total,
          required: targetDays,
        },
      ];
      if (targetWatchkeeping) {
        out.push({
          label: 'Watchkeeping Service',
          current: mnzService.watchkeeping,
          required: targetWatchkeeping,
        });
      }
      return out;
    }

    if (isSAMSA) {
      if (!samsaService) return [];
      // Small vessel skipper certificates are stated in hours.
      if (requirement?.totalHours) {
        return [{ label: 'Sea Service', current: Math.floor(samsaService.hours), required: requirement.totalHours, unit: 'hours' }];
      }
      if (!targetDays) return [];
      // Stand-by in construction or refit counts for at most a third of the service required.
      const standbyCounted = Math.min(samsaService.standby_yard, Math.floor(targetDays / 3));
      const out: ProgressRow[] = [
        { label: 'Qualifying Service', current: samsaService.seagoing + standbyCounted, required: targetDays },
      ];
      if (targetWatchkeeping) {
        out.push({ label: 'Watchkeeping Service', current: samsaService.watchkeeping, required: targetWatchkeeping });
      }
      return out;
    }

    if (!requirement?.totalDays) return [];
    const total = serviceTypes.reduce((sum, s) => sum + s.total_days, 0);
    return [{ label: 'Qualifying Service', current: total, required: requirement.totalDays }];
  }, [
    isUSCG,
    isAMSA,
    isMNZ,
    isSAMSA,
    requirement,
    uscgService,
    amsaService,
    mnzService,
    samsaService,
    serviceTypes,
    commercialService,
    workboatService,
    excludeCommercial,
    resolvedAuthority,
    dept,
    targetDays,
    targetWatchkeeping,
    amsaNotUnderwayCounted,
  ]);

  if (!requirement && rows.length === 0) return null;

  const textColor = isDark ? colors.text : colors.textLight;
  const mutedColor = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const trackColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  /**
   * Labels used in the AMSA and MNZ datasets for rows that state a condition
   * rather than a quantity of service: what you must already hold, and what the
   * certificate lets you work on. They are listed as checkpoints because the
   * app cannot measure them. Slicing off the first row the way the USCG list
   * does would not work here, where the second row is usually the alternative
   * sea-service route rather than a condition.
   */
  const CONDITION_LABELS = [
    'Prior Certificate',
    'Vessel and Area Limits',
    'Privileges',
    'Sailing Qualification',
    'Engine Competency',
  ];

  // Requirement rows the app cannot measure (capacity, tonnage, power or route
  // conditions). Listed as checkpoints rather than faked as progress bars.
  const checkpoints = !requirement
    ? []
    : isUSCG
      ? requirement.requirements.slice(1)
      : isAMSA || isMNZ
        ? requirement.requirements.filter((r) => CONDITION_LABELS.includes(r.label))
        : [];

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: textColor, flex: 1 }}>
          {requirement?.title ?? 'Certification Progress'}
        </Text>
        {onChangeTarget && (
          <TouchableOpacity
            onPress={onChangeTarget}
            style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}
            accessibilityLabel="Change target certification"
          >
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Change</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={16}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}
      </View>

      {requirement && (
        <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 14 }}>
          {requirement.regulation}
        </Text>
      )}

      {rows.length === 0 && (
        <Text style={{ fontSize: 13, color: mutedColor, lineHeight: 18 }}>
          {isUSCG && !uscgService
            ? 'Your USCG day count is not available yet. Pull to refresh, and if it stays missing your sea time is still recorded, just not totalled under the Coast Guard rules.'
            : requirement?.workboatRoute && !workboatService
              ? 'Your workboat day count is not available yet. Pull to refresh, and if it stays missing your sea time is still recorded, just not totalled under MGN 496.'
              : isAMSA && !amsaService
              ? 'Your AMSA day count is not available yet. Pull to refresh, and if it stays missing your sea time is still recorded, just not totalled under Marine Order 505.'
              : isMNZ && !mnzService
                ? 'Your Maritime NZ day count is not available yet. Pull to refresh, and if it stays missing your sea time is still recorded, just not totalled under SeaCert.'
                : isSAMSA && !samsaService
                ? 'Your SAMSA day count is not available yet. Pull to refresh, and if it stays missing your sea time is still recorded, just not totalled under the SAMSA rules.'
                : 'This certificate is not measured in days of sea service. Open the requirements list to see what it asks for.'}
        </Text>
      )}

      {rows.map((row, index) => {
        const pct = row.required > 0 ? Math.min(row.current / row.required, 1) : 0;
        const isLast = index === rows.length - 1 && checkpoints.length === 0;
        return (
          <View key={row.label} style={{ marginBottom: isLast ? 0 : 14 }}>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}
            >
              <Text style={{ fontSize: 14, color: textColor }}>{row.label}</Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: pct >= 1 ? colors.success : colors.primary,
                }}
              >
                {row.current}/{row.required} {row.unit === 'hours' ? 'hours' : 'days'}
              </Text>
            </View>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: trackColor,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.round(pct * 100)}%`,
                  backgroundColor: pct >= 1 ? colors.success : colors.primary,
                  borderRadius: 4,
                }}
              />
            </View>
          </View>
        );
      })}

      {checkpoints.length > 0 && (
        <View
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: trackColor,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, marginBottom: 8 }}>
            Also required
          </Text>
          {checkpoints.map((req) => (
            <View key={req.label} style={{ flexDirection: 'row', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: mutedColor, marginRight: 6 }}>•</Text>
              <Text style={{ flex: 1, fontSize: 13, color: mutedColor, lineHeight: 18 }}>
                {req.label}: {req.value}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 12, color: mutedColor, marginTop: 6, lineHeight: 17 }}>
            {isUSCG
              ? 'These depend on the capacity, route and tonnage you served in, so the Coast Guard evaluates them from your sea service letters rather than from this total.'
              : isAMSA
                ? 'These depend on the certificate you held and the vessels you served on, so AMSA assesses them from your sea service records rather than from this total.'
                : 'These depend on the certificate you held and the vessels you served on, so Maritime NZ assesses them from your sea service records rather than from this total.'}
          </Text>
        </View>
      )}

      {requirement?.workboatRoute && workboatService && (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: trackColor }}>
          <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}>
            Counted under MGN 496, with months at 30 days. Workboat service counts vessels you have
            marked as workboats in Settings, Vessel Sector. The 15m figures use each vessel's recorded
            length; the MCA goes by load line length. Watchkeeping counts only days you logged as
            watchkeeping service. Service must also fall after you gained your entry certificate, which
            the app cannot check.
            {workboatService.workboats_without_length > 0
              ? ` ${workboatService.workboats_without_length} ${workboatService.workboats_without_length === 1 ? 'workboat has' : 'workboats have'} no length recorded, so ${workboatService.workboats_without_length === 1 ? 'it is' : 'they are'} left out of the 15m figures. Add the length in the vessel's details.`
              : ''}
          </Text>
        </View>
      )}

      {commercialDays > 0 && requirement?.commercialService && !requirement?.workboatRoute && (
        <View
          style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: trackColor }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, marginBottom: 4 }}>
            {excludeCommercial
              ? `${commercialDays} ${commercialDays === 1 ? 'day' : 'days'} on commercial vessels not counted`
              : `Includes ${commercialDays} ${commercialDays === 1 ? 'day' : 'days'} carried over from commercial vessels`}
          </Text>
          <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}>
            {excludeCommercial
              ? `MSN 1858 only credits service on yachts toward this certificate, so time on ${formatVesselList(commercialService?.vessels ?? [])} stays in your record but is left out of these totals.`
              : `This certificate accepts service on commercial vessels, so time on ${formatVesselList(commercialService?.vessels ?? [])} counts toward it.`}
          </Text>
        </View>
      )}

      {isAMSA && amsaService && (
        <View style={{ marginTop: 14 }}>
          {amsaService.not_underway > 0 && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 12,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: trackColor,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 13, color: mutedColor, flex: 1 }}>
                Counted while not underway
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: mutedColor }}>
                {amsaNotUnderwayCounted}/{amsaAllowance} days
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}>
            Counted under Marine Order 505: a day is 8 hours of qualifying work, shorter shifts add
            together, and more than 8 hours in a 24-hour period is still one day.
            {amsaService.not_underway > amsaNotUnderwayCounted
              ? ` ${amsaService.not_underway - amsaNotUnderwayCounted} ${
                  amsaService.not_underway - amsaNotUnderwayCounted === 1 ? 'day sits' : 'days sit'
                } beyond the ${Math.round(
                  AMSA_NOT_UNDERWAY_CAP[dept === 'engineering' ? 'engineering' : 'deck'] * 100,
                )} per cent AMSA allows while the vessel is not underway, so ${
                  amsaService.not_underway - amsaNotUnderwayCounted === 1 ? 'it is' : 'they are'
                } logged but not counted here.`
              : ''}
            {amsaService.part_day_hours > 0
              ? ` ${amsaService.part_day_hours} hours are logged but do not yet make a whole day.`
              : ''}
            {hasRecordBook
              ? ' Measured against the task book figure, because you have told us you hold one.'
              : ' Measured against the figure for an applicant without a task book. Holding one roughly halves it.'}
          </Text>
        </View>
      )}

      {isMNZ && mnzService && (
        <View style={{ marginTop: 14 }}>
          {mnzService.outside_window > 0 && (
            <View
              style={{
                paddingTop: 12,
                marginBottom: 12,
                borderTopWidth: 1,
                borderTopColor: trackColor,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, marginBottom: 4 }}>
                {mnzService.outside_window}{' '}
                {mnzService.outside_window === 1 ? 'day falls' : 'days fall'} outside the 10-year
                window
              </Text>
              <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}>
                Maritime NZ accepts sea service gained in the 10 years before you apply, so this
                time stays in your record but is not counted toward the certificate.
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}>
            Counted under SeaCert, where a month is 30 days.
            {mnzService.standby + mnzService.yard > 0
              ? ` ${mnzService.actual} days are actual sea service, with ${mnzService.standby} stand-by and ${mnzService.yard} yard days making up the rest. The yacht certificates accept that combination; the others are assessed on sea service alone.`
              : ''}
            {mnzService.port > 0
              ? ` ${mnzService.port} days in port are recorded but are not sea service.`
              : ''}
            {hasRecordBook
              ? ' Measured against the shorter route, because you have told us you hold a training record book.'
              : ''}
          </Text>
        </View>
      )}

      {isUSCG && uscgService && (
        <View style={{ marginTop: 14 }}>
          {uscgService.awaiting_tonnage > 0 && (
            <View
              style={{
                paddingTop: 12,
                marginBottom: 12,
                borderTopWidth: 1,
                borderTopColor: trackColor,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, marginBottom: 4 }}>
                {uscgService.awaiting_tonnage}{' '}
                {uscgService.awaiting_tonnage === 1 ? 'day is' : 'days are'} waiting on a vessel
                tonnage
              </Text>
              <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}>
                {uscgService.vessels_awaiting_tonnage.length > 0
                  ? `Add the gross tonnage for ${formatVesselList(
                      uscgService.vessels_awaiting_tonnage,
                    )} and these days will be counted. `
                  : 'Add the gross tonnage for those vessels and these days will be counted. '}
                Between 4 and 8 hours the tonnage decides whether a day counts, so they are held
                rather than guessed at.
              </Text>
            </View>
          )}

          {(uscgService.two_watch_days ?? 0) > 0 && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 12,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: trackColor,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 13, color: mutedColor, flex: 1 }}>
                Two-watch days ({uscgService.two_watch_days} at 1.5)
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: mutedColor }}>
                +{uscgService.two_watch_bonus} days
              </Text>
            </View>
          )}

          {uscgService.provisional > 0 && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 12,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: trackColor,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 13, color: mutedColor, flex: 1 }}>
                Awaiting a Coast Guard determination
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: mutedColor }}>
                +{uscgService.provisional} days
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}>
            Counted under 46 CFR 10.107: a day is 8 hours of watchstanding or day-working,
            excluding overtime.
            {uscgService.provisional > 0
              ? ` ${uscgService.provisional} ${
                  uscgService.provisional === 1 ? 'day of' : 'days of'
                } 4 to 8 hours on vessels under 100 GRT sit outside that total. They count only if the Coast Guard accepts that your operating schedule makes the 8-hour day inappropriate, which is the OCMI's call, not ours.`
              : ''}
            {uscgService.short_of_standard_day > 0
              ? ` ${uscgService.short_of_standard_day} ${
                  uscgService.short_of_standard_day === 1 ? 'day is' : 'days are'
                } 4 to 8 hours on a vessel of 100 GRT or more, which cannot make a day.`
              : ''}
            {uscgService.below_minimum > 0
              ? ` ${uscgService.below_minimum} ${
                  uscgService.below_minimum === 1 ? 'day is' : 'days are'
                } under 4 hours, which is below the floor in any reading.`
              : ''}
            {uscgService.yard + uscgService.port + uscgService.standby > 0
              ? ' Yard, port and stand-by time stays in your logbook but is not USCG sea service.'
              : ''}
            {(uscgService.two_watch_days ?? 0) > 0
              ? ` ${uscgService.two_watch_days} ${
                  uscgService.two_watch_days === 1 ? 'day' : 'days'
                } of 12 hours or more on vessels you marked as two-watch count as 1.5 days each. Keep evidence of the vessel\u2019s two-watch authorisation for your application.`
              : ' On a vessel authorised to run two watches, a 12-hour day may count as 1.5 days. Turn on Two-watch vessel on the vessel\u2019s screen if yours is.'}
          </Text>
        </View>
      )}
    </View>
  );
}

export default CertificationProgress;
