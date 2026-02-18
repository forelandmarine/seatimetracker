# Department Pathway Implementation Summary

## Overview

The maritime sea time tracking system has been fully enhanced with comprehensive support for two distinct professional pathways: **Deck** and **Engineering**. Each pathway has different sea service requirements, qualifications, and entry types.

## Database Changes

### User Profile Enhancement
**File**: `src/db/auth-schema.ts`

Added field to `user` table:
```typescript
department: text("department"), // Department: 'deck' or 'engineering'
```

### Sea Time Entries Enhancement
**File**: `src/db/schema.ts`

Added fields to `sea_time_entries` table:
```typescript
watchkeeping_hours: decimal('watchkeeping_hours', { precision: 10, scale: 2 }),
additional_watchkeeping_hours: decimal('additional_watchkeeping_hours', { precision: 10, scale: 2 }),
is_stationary: boolean('is_stationary'),
```

## API Endpoints

### Profile Management

#### GET /api/profile
Returns current user profile including department field.

**Response** (200):
```json
{
  "id": "user-id",
  "name": "Officer Name",
  "email": "user@example.com",
  "emailVerified": false,
  "department": "deck",
  "address": null,
  "tel_no": null,
  "date_of_birth": null,
  "srb_no": null,
  "nationality": null,
  "pya_membership_no": null,
  "image": null,
  "imageUrl": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

#### PUT /api/profile
Updates any profile fields including department.

**Request Body**:
```json
{
  "department": "engineering",
  "name": "Updated Name",
  "email": "newemail@example.com",
  "srb_no": "SRB123456",
  "nationality": "British"
}
```

**Response** (200): Updated user profile object

**Validations**:
- Department must be "deck" or "engineering" (lowercase)
- At least one field required
- Email uniqueness enforced
- Invalid department returns 400 error

#### PUT /api/profile/department ⭐ NEW
Dedicated endpoint for rapid department/pathway selection (recommended for first-time setup).

**Request Body**:
```json
{
  "department": "deck"
}
```

**Response** (200): Updated user profile object

**Use Case**: Streamlined first-time setup flow:
1. User signs up with email/password
2. Frontend immediately calls PUT /api/profile/department
3. User sees department-specific UI

---

### Sea Time Entries

#### GET /api/sea-time
Returns all sea time entries with new department-specific fields.

**Response includes**:
```json
[
  {
    "id": "entry-id",
    "vessel_id": "vessel-uuid",
    "start_time": "2024-01-15T08:00:00Z",
    "end_time": "2024-01-15T12:00:00Z",
    "duration_hours": 4.5,
    "sea_days": 1,
    "status": "confirmed",
    "service_type": "actual_sea_service",
    "watchkeeping_hours": null,
    "additional_watchkeeping_hours": null,
    "is_stationary": false,
    "notes": "Underway in North Sea",
    "mca_compliant": true,
    "detection_window_hours": 4.5,
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

#### GET /api/sea-time/pending
Returns pending entries with same field enhancements.

#### GET /api/sea-time/new-entries
Returns recently created entries with same field enhancements.

#### GET /api/vessels/:vesselId/sea-time
Returns vessel-specific entries with same field enhancements.

---

## Department-Specific Sea Service Logic

### Deck Department

**Sea Service = Actual Days at Sea + Watchkeeping Service + Yard Service**

#### Entry Types
1. **Actual Sea Service** (Propulsion ≥4hrs or Sailing)
   - Log with `service_type: "actual_sea_service"`
   - `is_stationary: false`
   - `duration_hours` populated

2. **Watchkeeping Service** (Bridge Watch)
   - Log with `service_type: "watchkeeping_service"`
   - `watchkeeping_hours` populated (4hrs = 1 day)
   - `is_stationary: false`
   - Constraint: Watchkeeping days ≤ Actual sea days

3. **Yard Service** (Build/Refit/Repair)
   - Log with `service_type: "yard_service"`
   - `duration_hours` populated
   - Hard limit: 90 days per application

### Engineering Department

**Sea Service = Actual Days at Sea + Watchkeeping Service + Additional Watchkeeping + Yard Service**

#### Entry Types
1. **Actual Sea Service** (Propulsion ≥4hrs or Sailing)
   - Log with `service_type: "actual_sea_service"`
   - `is_stationary: false`
   - `duration_hours` populated

2. **Watchkeeping Service - Underway** (Engine Room Watch)
   - Log with `service_type: "watchkeeping_service"`
   - `watchkeeping_hours` populated (4hrs = 1 day)
   - `is_stationary: false`
   - Constraint: Watchkeeping days ≤ Actual sea days

3. **Additional Watchkeeping - Stationary** (At Anchor/Moored)
   - Log with `service_type: "watchkeeping_service"`
   - `additional_watchkeeping_hours` populated
   - `is_stationary: true`
   - Constraint: Cannot be logged same day as Actual Sea Service
   - Note: Only counts for Yacht-Restricted certificates

4. **Yard Service** (Build/Refit/Repair)
   - Log with `service_type: "yard_service"`
   - `duration_hours` populated
   - Hard limit: 90 days per application

---

## Frontend Integration Workflow

### Step 1: Post-Signup Department Selection
```
User Signs Up → Receives Session Token → Show Department Selector Modal
                                    ↓
                    PUT /api/profile/department
                                    ↓
                    User Enters Main App with Profile
```

### Step 2: Display Department-Specific UI
```
Get Current Profile (GET /api/profile)
         ↓
    Check Department Field
         ↓
    Load Department-Specific:
    - Entry Creation Form
    - Service Calculations
    - Reports & Summaries
```

### Step 3: Create Department-Appropriate Entries
```
Deck Officer:
- Actual Sea Days
- Watchkeeping (Bridge)
- Yard Service
  ↓ (All logged via PUT /api/sea-time/:id or POST endpoints)

Engineering Officer:
- Actual Sea Days
- Watchkeeping (Engine Room - Underway)
- Additional Watchkeeping (At Anchor/Moored)
- Yard Service
```

---

## Validation Rules

### Department Field
- **Type**: String (lowercase)
- **Valid Values**: `"deck"` or `"engineering"`
- **Required**: On first login (can be null initially, but should be set)
- **Immutable**: No, can be changed anytime
- **Scope**: User-level (applies to all vessels)

### Watchkeeping Hours
- **Type**: Decimal (10 digits, 2 decimal places)
- **Constraint**: 4 hours = 1 watchkeeping day
- **Used By**: Both departments
- **Validation**: Must be ≤ actual sea days total

### Additional Watchkeeping Hours
- **Type**: Decimal (10 digits, 2 decimal places)
- **Constraint**: 4 hours = 1 additional watchkeeping day
- **Used By**: Engineering only
- **Validation**: Only valid if `is_stationary: true`

### Is Stationary
- **Type**: Boolean
- **Meaning**: Vessel at anchor or moored (not underway)
- **Impact**: Differentiates watchkeeping type
- **Engineering Rule**: Additional watchkeeping MUST have this true

---

## Error Handling

### Department Validation Errors

**400 - Invalid Department**
```json
{
  "error": "Invalid department. Must be \"deck\" or \"engineering\""
}
```

**401 - Authentication Required**
```json
{
  "error": "Authentication required"
}
```

**401 - Session Expired**
```json
{
  "error": "Session expired"
}
```

---

## Documentation Files

1. **SEA_SERVICE_LOGIC.md** - Comprehensive specification of all sea service rules for both departments
2. **DEPARTMENT_SETUP_GUIDE.md** - Frontend integration guide with code examples
3. **IMPLEMENTATION_SUMMARY.md** - This file

---

## Files Modified

1. `src/db/auth-schema.ts` - Added department field to user table
2. `src/db/schema.ts` - Added watchkeeping fields to sea_time_entries
3. `src/routes/profile.ts` - Updated GET/PUT endpoints, added PUT /api/profile/department
4. `src/routes/sea-time.ts` - Updated all response schemas to include new fields
5. `src/index.ts` - Updated documentation comments

---

## Testing Checklist

- [ ] User can sign up and set department via PUT /api/profile/department
- [ ] GET /api/profile returns department field
- [ ] Department can be changed via PUT /api/profile
- [ ] Sea time entries include watchkeeping_hours field
- [ ] Sea time entries include additional_watchkeeping_hours field
- [ ] Sea time entries include is_stationary field
- [ ] All GET sea-time endpoints return new fields
- [ ] Department validation rejects invalid values (case-sensitive)
- [ ] Department is case-sensitive ("Deck" vs "deck")
- [ ] Changing department doesn't delete old sea time entries
- [ ] Engineering can log additional_watchkeeping_hours with is_stationary=true
- [ ] All fields support null values for backward compatibility

---

## Backward Compatibility

- Department field is nullable - existing users can function without it
- New watchkeeping fields are nullable - won't affect existing entries
- All endpoints maintain response compatibility
- No breaking changes to existing data structures
