import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  MCARequirement,
  MaritimeAuthority,
  getDefaultTargetId,
  getRequirementByIdForPathway,
} from '@/constants/mcaRequirements';

export interface ServiceTypeDays {
  service_type: string;
  total_days: number;
}

export interface USCGServiceSummary {
  /** Days meeting the full 8-hour day of 46 CFR 10.107. */
  creditable: number;
  /** 4 to 8 hour days on a vessel under 100 GRT, creditable at the OCMI's discretion. */
  provisional: number;
  /** 4 to 8 hour days on a vessel of 100 GRT or more, or of unknown tonnage. */
  short_of_standard_day: number;
  /** Days under 4 hours, not creditable on any reading. */
  below_minimum: number;
  standby: number;
  yard: number;
  port: number;
}

interface ProgressRow {
  label: string;
  current: number;
  required: number;
}

export interface CertificationProgressProps {
  authority: MaritimeAuthority | null;
  department: string | null;
  /** Requirement id the user is working toward; falls back to the pathway default. */
  targetId?: string | null;
  serviceTypes: ServiceTypeDays[];
  /** USCG-rules day count from the summary endpoint. Required for USCG progress. */
  uscgService?: USCGServiceSummary | null;
  isDark: boolean;
  /** Opens the requirements screen so the user can pick a different target. */
  onChangeTarget?: () => void;
}

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
          current: uscgService.creditable,
          required: requirement.totalDays,
        },
      ];
    }

    if (resolvedAuthority === 'mca') return mcaRows(serviceTypes, dept === 'engineering');

    // AMSA and Maritime NZ entries carry no machine-readable day target yet, so
    // show the headline total where the data has one and nothing otherwise.
    if (!requirement?.totalDays) return [];
    const total = serviceTypes.reduce((sum, s) => sum + s.total_days, 0);
    return [{ label: 'Qualifying Service', current: total, required: requirement.totalDays }];
  }, [isUSCG, requirement, uscgService, serviceTypes, resolvedAuthority, dept]);

  if (!requirement && rows.length === 0) return null;

  const textColor = isDark ? colors.text : colors.textLight;
  const mutedColor = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const trackColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  // Requirement rows the app cannot measure (capacity, tonnage or route
  // conditions). Listed as checkpoints rather than faked as progress bars.
  const checkpoints = isUSCG && requirement ? requirement.requirements.slice(1) : [];

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
            : 'Day-by-day progress is not available for this pathway yet. Open the requirements list to see the service this endorsement asks for.'}
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
                {row.current}/{row.required} days
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
            These depend on the capacity, route and tonnage you served in, so the Coast Guard
            evaluates them from your sea service letters rather than from this total.
          </Text>
        </View>
      )}

      {isUSCG && uscgService && (
        <View style={{ marginTop: 14 }}>
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
                } 4 to 8 hours on a vessel of 100 GRT or more, or one whose tonnage you have not recorded. Adding the tonnage may move ${
                  uscgService.short_of_standard_day === 1 ? 'it' : 'them'
                } into the line above.`
              : ''}
            {uscgService.below_minimum > 0
              ? ` ${uscgService.below_minimum} ${
                  uscgService.below_minimum === 1 ? 'day is' : 'days are'
                } under 4 hours, which is below the floor in any reading.`
              : ''}
            {uscgService.yard + uscgService.port + uscgService.standby > 0
              ? ' Yard, port and stand-by time stays in your logbook but is not USCG sea service.'
              : ''}
            {' On a vessel authorised to run two watches, a 12-hour day may count as 1.5 days. That depends on the vessel\u2019s authorisation, so it is never applied here.'}
          </Text>
        </View>
      )}
    </View>
  );
}

export default CertificationProgress;
