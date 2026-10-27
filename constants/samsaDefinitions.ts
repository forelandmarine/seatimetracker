import type { ServiceDefinition } from './mcaRequirements';

/**
 * How SAMSA counts service, from the Merchant Shipping (Training, Certification
 * and Safe Manning) Regulations 2021 and Marine Notice 20 of 2016.
 */
export const SAMSA_SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    title: 'A day of service',
    description:
      'Any calendar day signed on, from engagement to discharge with both days included. There is no minimum number of hours, and days in port on articles count. 30 days make a month.',
    department: 'both',
  },
  {
    title: 'Stand-by, construction and refit',
    description:
      'Counts in full, but never for more than a third of the service a certificate needs.',
    department: 'both',
  },
  {
    title: 'Watchkeeping',
    description:
      'At least 8 hours of watchkeeping in every 24. For engineers on ships with an unmanned engine room, 24 hours on duty in every 72.',
    department: 'both',
  },
  {
    title: 'Yacht service',
    description:
      'Yachts used only for sport or recreation are not trading ships. Superyacht service counts in full for a certificate endorsed Non-Trading; an unrestricted certificate on yacht service is decided case by case by a senior examiner.',
    department: 'both',
  },
  {
    title: 'Ten-year window',
    description: 'Service more than 10 years old does not count.',
    department: 'both',
  },
];
