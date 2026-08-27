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
  creditable: number;
  standby: number;
  yard: number;
  port: number;
  short_of_eight_hours: number;
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
      if (!requirement?.totalDays) return [];
      return [
        {
          label: 'Creditable Service',
          current: uscgService?.creditable ?? 0,
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
          Day-by-day progress is not available for this pathway yet. Open the requirements list
          to see the service this endorsement asks for.
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
        <Text style={{ fontSize: 12, color: mutedColor, marginTop: 14, lineHeight: 17 }}>
          Counted under 46 CFR 10.107: a day is 8 hours of watchstanding or day-working.
          {uscgService.short_of_eight_hours > 0
            ? ` ${uscgService.short_of_eight_hours} logged ${
                uscgService.short_of_eight_hours === 1 ? 'day is' : 'days are'
              } under 8 hours and not counted here.`
            : ''}
          {uscgService.yard + uscgService.port + uscgService.standby > 0
            ? ` Yard, port and stand-by time is kept in your logbook but is not USCG sea service.`
            : ''}
        </Text>
      )}
    </View>
  );
}

export default CertificationProgress;
