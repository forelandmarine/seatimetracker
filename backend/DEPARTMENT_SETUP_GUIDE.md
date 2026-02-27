# Department Pathway Setup Guide

## Overview

The maritime sea time tracking system supports two distinct professional pathways: **Deck** and **Engineering**. Each pathway has different sea service requirements and qualifications. Users must select their pathway either during initial signup or shortly after.

## Department Pathways

### Deck Department
Officers working on vessel bridges responsible for navigation and ship operations.

**Sea Service Formula**: Actual Days at Sea + Watchkeeping Service + Yard Service

**Key Roles**:
- Watch-keeping officers (OOW 3000 certificate holders)
- Bridge operations and navigation management

### Engineering Department
Officers working in engine rooms responsible for propulsion systems and machinery maintenance.

**Sea Service Formula**: Actual Days at Sea + Watchkeeping Service + Additional Watchkeeping + Yard Service

**Key Roles**:
- Engine room watchkeeping officers
- Chief engineers
- UMS (Unmanned Machinery Space) operators

## API Integration Guide

### 1. User Signup with Department Selection

When a new user signs up, capture their department preference:

```bash
POST /api/auth/sign-up/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password",
  "name": "Officer Name"
}
```

After successful signup, they receive a session token and should immediately proceed to Step 2.

### 2. Set Department/Pathway (After Signup)

**Dedicated Endpoint** (Recommended for first-time setup):

```bash
PUT /api/profile/department
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "department": "deck"
}
```

Response:
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
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:05:00Z"
}
```

**Alternative**: Use the general profile update endpoint:

```bash
PUT /api/profile
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "department": "engineering"
}
```

### 3. Get Current User Profile (Including Department)

```bash
GET /api/profile
Authorization: Bearer <session-token>
```

Response includes `department` field indicating the user's pathway:
```json
{
  "id": "user-id",
  "name": "Officer Name",
  "email": "user@example.com",
  "department": "engineering",
  ...
}
```

### 4. Update Department Later

Users can change their department pathway at any time:

```bash
PUT /api/profile/department
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "department": "deck"
}
```

## Frontend Implementation Example

### React/TypeScript Flow

```typescript
// After successful signup
async function setupDepartment(sessionToken: string, department: 'deck' | 'engineering') {
  const response = await fetch('/api/profile/department', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ department }),
  });

  if (!response.ok) {
    throw new Error('Failed to set department');
  }

  const updatedProfile = await response.json();
  return updatedProfile;
}

// In your signup flow
async function handleSignup(email: string, password: string, name: string) {
  // Step 1: Create account
  const signupResponse = await fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  const { user, session } = await signupResponse.json();

  // Step 2: Show department selection modal/screen
  const selectedDepartment = await showDepartmentSelector();

  // Step 3: Set department
  const profile = await setupDepartment(session.token, selectedDepartment);

  // Step 4: Continue with main app
  navigateToMainApp(session.token, profile);
}
```

## Department-Specific UI Considerations

### Deck Department UI
- Show sea service breakdowns by: Actual Days at Sea, Watchkeeping Service, Yard Service
- Watchkeeping entry form with OOW 3000 certificate validation
- Anchor/mooring time guidance per specification
- Yard service documentation warnings (>90 days requires job descriptions)

### Engineering Department UI
- Show sea service breakdowns by: Actual Days at Sea, Watchkeeping Service, Additional Watchkeeping, Yard Service
- Separate watchkeeping entry forms:
  - **Underway**: Engine room watch with role selection (OOW, Chief Engineer, UMS)
  - **Stationary**: Additional watchkeeping at anchor/moored with generator status
- Restrict "Additional Watchkeeping" logging to restricted certificate holders
- Same yard service documentation warnings as Deck

## Sea Time Entry Creation by Department

### Deck Officer Sea Time Entry

When a Deck officer creates a sea time entry via the frontend or API:

```json
{
  "vessel_id": "vessel-uuid",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T18:00:00Z",
  "duration_hours": "10",
  "service_type": "actual_sea_service",
  "is_stationary": false,
  "notes": "10 hours underway in English Channel"
}
```

### Engineering Officer Sea Time Entry - Underway Watchkeeping

```json
{
  "vessel_id": "vessel-uuid",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "watchkeeping_hours": "4",
  "service_type": "watchkeeping_service",
  "is_stationary": false,
  "notes": "4 hours engine room watch underway, Chief Engineer capacity"
}
```

### Engineering Officer Sea Time Entry - Additional Watchkeeping

```json
{
  "vessel_id": "vessel-uuid",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "additional_watchkeeping_hours": "4",
  "service_type": "watchkeeping_service",
  "is_stationary": true,
  "notes": "4 hours additional watchkeeping at anchor, generators running, Yacht-Restricted Certificate"
}
```

## Field Validation Rules

### Department Values
- `"deck"` - Lowercase, for bridge/navigation officers
- `"engineering"` - Lowercase, for engine room officers

### Department Update Constraints
- Required during first signup flow
- Can be changed at any time via PUT /api/profile/department
- Changing department does NOT delete existing sea time entries (allows portfolio across departments)

## Important Notes

1. **Default Value**: Department is initially `null` if not set during signup
2. **Optional Until Setup**: Users can complete profile setup before selecting department
3. **Pathway-Specific Logic**: Frontend should enforce department-specific validation rules when creating sea time entries
4. **Historical Records**: Changing department does not affect previously logged sea time (users may work both roles across their career)

## API Error Codes

| Code | Error | Meaning |
|------|-------|---------|
| 400 | Invalid department | Department must be "deck" or "engineering" |
| 401 | Authentication required | Missing or invalid session token |
| 401 | Session expired | Token has expired, re-login required |
| 401 | User not found | User associated with token no longer exists |

## See Also

- [Sea Service Logic Specification](./SEA_SERVICE_LOGIC.md) - Detailed requirements for each department
- Profile Endpoints Documentation
- Sea Time Entries API Documentation
