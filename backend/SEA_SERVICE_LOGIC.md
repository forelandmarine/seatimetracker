# Sea Service Logic Specification

## Global Definitions

- **All dates are inclusive**: start date and end date both count
- **Time unit**: calendar day (00:00–23:59)
- **No overlap**: Testimonials must not overlap across vessels
- **Single vessel per day**: A person cannot be logged on more than one vessel on the same date
- **Off-rotation exclusion**: Off-rotation days must be excluded from service totals
- **Shipyard limit**: Maximum allowable shipyard service per application: 90 days

## DECK DEPARTMENT LOGIC

### Onboard Yacht Service

**Definition**: Any day signed on a yacht, regardless of vessel activity.

**Includes all sea service categories**:
- Actual Days at Sea
- Watchkeeping Service
- Yard Service

### Sea Service (Deck)

**Formula**: Sea Service = Actual Days at Sea + Watchkeeping Service + Yard Service

### Actual Day at Sea (Deck)

**Qualification Criteria**:
- Main propulsion machinery runs ≥ 4 hours within the same calendar day, OR
- Vessel is powered by wind (sail yachts only)

**Anchor/Mooring Time**:
- **Generally excluded** from Actual Days at Sea
- **Included ONLY if ALL conditions are true**:
  - Anchor time is part of an active 24-hour passage
  - Reason is operational necessity (berth wait, canal/lock transit, weather)
  - Anchor duration ≤ duration of previous voyage segment
  - Anchor is not the final end of passage
- **Always excluded** if anchoring is for rest or leisure

### Watchkeeping Service (Deck)

**Role**: Bridge watch while vessel is underway

**Eligibility Requirements**:
- Officer must hold OOW 3000 (Yachts) Certificate of Competency
- Officer must be in full charge of a navigational watch

**Accrual Rule**: Every 4 hours of watchkeeping = 1 watchkeeping day
- Hours may be accumulated across multiple days

**Constraint**: Total watchkeeping days ≤ total actual days at sea

### Yard Service (Deck)

**Definition**: Standing by a vessel during build, refit, or serious repair

**Exclusions**: Routine or general maintenance does NOT qualify

**Documentation Rule**: If > 90 days total:
- Works list and job descriptions are required

**Hard Limit**: Maximum 90 yard service days per OOW 3000 application

---

## ENGINEERING DEPARTMENT LOGIC

### Onboard Yacht Service (Engineering)

**Definition**: Any day signed on board, regardless of activity.

**Includes all sea service categories**:
- Actual Days at Sea
- Watchkeeping Service
- Additional Watchkeeping
- Yard Service

### Sea Service (Engineering)

**Formula**: Sea Service = Actual Days at Sea + Watchkeeping Service + Additional Watchkeeping + Yard Service

### Actual Day at Sea (Engineering)

**Same rules as Deck Department**:
- Main propulsion machinery runs ≥ 4 hours within the same calendar day, OR
- Vessel is powered by wind (sail yachts only)

**Anchor Time Rules**:
- **Generally excluded** from Actual Days at Sea
- **May qualify ONLY as Additional Watchkeeping** (see below)
- Same anchor constraints as Deck Department apply

### Watchkeeping Service (Engineering – Underway)

**Role**: Engine room watch while vessel is underway

**Accrual**: Every 4 hours = 1 watchkeeping day
- Accumulative across multiple days

**Role Requirements**:
- SV Engineer OOW: subsidiary capacity permitted
- SV Chief Engineer: full charge of watch or UMS (Unmanned Machinery Space) duties

**Constraint**: Watchkeeping days ≤ actual days at sea

### Additional Watchkeeping (Engineering – Stationary)

**Definition**: Engine room watchkeeping while vessel is:
- At anchor, OR
- Moored/made fast

**Vessel Power Requirement**: Vessel must be using its own power

**Qualification Rules**:
- Generators must be running
- Safe engine room watchkeeping must be maintained
- Cannot be logged on the same day as an Actual Day at Sea

**Applicability**:
- Counts ONLY for Yacht-Restricted Certificates of Competency
- Does NOT count toward full SV (Superyacht) Certificates

### Yard Service (Engineering)

**Same rules as Deck Department**:
- Standing by during build, refit, or serious repair
- Excludes routine or general maintenance
- Documentation required if > 90 days
- Hard limit: Maximum 90 yard service days per application

---

## System Implementation

### Database Fields

The `sea_time_entries` table includes:
- `watchkeeping_hours` (decimal): Hours of watchkeeping/engine room watch
- `additional_watchkeeping_hours` (decimal): Additional watchkeeping at anchor/mooring (engineering only)
- `is_stationary` (boolean): Whether vessel is stationary for this entry

### Calculation Logic

**For Watchkeeping Days**:
```
watchkeeping_days = CEIL(watchkeeping_hours / 4)
```
- Hours accumulated across multiple entries for the same day
- Each 4-hour period = 1 watchkeeping day

**For Sea Days**:
```
sea_days = CASE
  WHEN actual_day_at_sea AND duration >= 4 hours THEN 1
  WHEN watchkeeping_hours >= 4 THEN 1
  WHEN additional_watchkeeping_hours >= 4 AND is_stationary THEN 1
  ELSE 0
END
```

### Department-Specific Rules

**Deck Officers**:
- Can log: Actual Days at Sea, Watchkeeping Service, Yard Service
- Cannot log: Additional Watchkeeping
- Sea Service = Actual + Watchkeeping + Yard

**Engineering Officers**:
- Can log: Actual Days at Sea, Watchkeeping Service, Additional Watchkeeping, Yard Service
- Additional Watchkeeping counts only for restricted certificates
- Sea Service = Actual + Watchkeeping + Additional Watchkeeping + Yard

### Entry Types

When creating sea time entries, specify the department and log the appropriate hours:

**Deck Entry**:
```json
{
  "department": "deck",
  "service_type": "actual_sea_service",
  "duration_hours": 6,
  "watchkeeping_hours": null,
  "additional_watchkeeping_hours": null,
  "is_stationary": false
}
```

**Engineering - Watchkeeping (Underway)**:
```json
{
  "department": "engineering",
  "service_type": "watchkeeping_service",
  "watchkeeping_hours": 4,
  "additional_watchkeeping_hours": null,
  "is_stationary": false
}
```

**Engineering - Additional Watchkeeping (Stationary)**:
```json
{
  "department": "engineering",
  "service_type": "watchkeeping_service",
  "watchkeeping_hours": null,
  "additional_watchkeeping_hours": 4,
  "is_stationary": true
}
```

---

## Important Notes

- All times must be recorded in UTC
- Calendar days run from 00:00 to 23:59
- No overlapping entries on the same vessel for the same day
- Yard service has a hard 90-day limit per application
- Watchkeeping service documentation must clearly show:
  - Start and end times
  - Hours accumulated
  - Officer certificate held
  - Authority held (OOW, Chief Engineer, etc.)
