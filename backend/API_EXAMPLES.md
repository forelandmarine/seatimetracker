# API Request/Response Examples

## Department Setup Flow

### 1. User Signs Up

**Request**:
```bash
POST /api/auth/sign-up/email
Content-Type: application/json

{
  "email": "sarah.captain@maritime.co.uk",
  "password": "secure-password-123",
  "name": "Sarah Captain"
}
```

**Response** (200):
```json
{
  "user": {
    "id": "user-abc123",
    "email": "sarah.captain@maritime.co.uk",
    "name": "Sarah Captain",
    "emailVerified": false,
    "image": null,
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  },
  "session": {
    "id": "session-xyz789",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2024-02-14T10:00:00Z"
  }
}
```

### 2. Set Department - Deck Officer

**Request**:
```bash
PUT /api/profile/department
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "department": "deck"
}
```

**Response** (200):
```json
{
  "id": "user-abc123",
  "name": "Sarah Captain",
  "email": "sarah.captain@maritime.co.uk",
  "emailVerified": false,
  "image": null,
  "imageUrl": null,
  "address": null,
  "tel_no": null,
  "date_of_birth": null,
  "srb_no": null,
  "nationality": null,
  "pya_membership_no": null,
  "department": "deck",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:02:30Z"
}
```

### 3. Set Department - Engineering Officer

**Request**:
```bash
PUT /api/profile/department
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "department": "engineering"
}
```

**Response** (200):
```json
{
  "id": "user-eng456",
  "name": "James Engineer",
  "email": "james.engineer@maritime.co.uk",
  "emailVerified": false,
  "image": null,
  "imageUrl": null,
  "address": null,
  "tel_no": null,
  "date_of_birth": null,
  "srb_no": null,
  "nationality": null,
  "pya_membership_no": null,
  "department": "engineering",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:02:30Z"
}
```

### 4. Get Current Profile

**Request**:
```bash
GET /api/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200):
```json
{
  "id": "user-abc123",
  "name": "Sarah Captain",
  "email": "sarah.captain@maritime.co.uk",
  "emailVerified": false,
  "image": null,
  "imageUrl": null,
  "address": null,
  "tel_no": "+44 20 7123 4567",
  "date_of_birth": null,
  "srb_no": "SRB/2023/00456",
  "nationality": "British",
  "pya_membership_no": "PYA/2023/1234",
  "department": "deck",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-16T14:30:00Z"
}
```

---

## Sea Time Entry Examples

### Deck Officer - Actual Sea Service Entry

**Request** (Creating via manual entry or AIS-detected):
```bash
POST /api/logbook/manual-entry
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "vessel_id": "vessel-uuid-001",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T18:00:00Z",
  "service_type": "actual_sea_service",
  "is_stationary": false,
  "notes": "10 hours underway, English Channel to North Sea"
}
```

**Response** (200 - Pending Entry):
```json
{
  "id": "entry-001",
  "vessel_id": "vessel-uuid-001",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T18:00:00Z",
  "duration_hours": 10,
  "sea_days": 1,
  "status": "pending",
  "service_type": "actual_sea_service",
  "watchkeeping_hours": null,
  "additional_watchkeeping_hours": null,
  "is_stationary": false,
  "notes": "10 hours underway, English Channel to North Sea",
  "mca_compliant": true,
  "detection_window_hours": 10,
  "start_latitude": "50.123456",
  "start_longitude": "-2.345678",
  "end_latitude": "51.654321",
  "end_longitude": "-1.234567",
  "vessel": {
    "id": "vessel-uuid-001",
    "vessel_name": "Superyacht Horizon",
    "mmsi": "319296900",
    "callsign": "YHO",
    "flag": "GB",
    "is_active": true
  },
  "created_at": "2024-01-15T10:00:00Z"
}
```

### Deck Officer - Bridge Watchkeeping Entry

**Request**:
```bash
POST /api/logbook/manual-entry
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "vessel_id": "vessel-uuid-001",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "service_type": "watchkeeping_service",
  "watchkeeping_hours": 4,
  "is_stationary": false,
  "notes": "Bridge watch under OOW 3000 certificate, full charge of navigation"
}
```

**Response** (200):
```json
{
  "id": "entry-002",
  "vessel_id": "vessel-uuid-001",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "duration_hours": 4,
  "sea_days": 1,
  "status": "pending",
  "service_type": "watchkeeping_service",
  "watchkeeping_hours": 4,
  "additional_watchkeeping_hours": null,
  "is_stationary": false,
  "notes": "Bridge watch under OOW 3000 certificate, full charge of navigation",
  "mca_compliant": true,
  "detection_window_hours": 4,
  "created_at": "2024-01-15T10:05:00Z"
}
```

### Engineering Officer - Engine Room Watchkeeping (Underway)

**Request**:
```bash
POST /api/logbook/manual-entry
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "vessel_id": "vessel-uuid-002",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "service_type": "watchkeeping_service",
  "watchkeeping_hours": 4,
  "is_stationary": false,
  "notes": "Engine room watch, Chief Engineer capacity, vessel underway"
}
```

**Response** (200):
```json
{
  "id": "entry-003",
  "vessel_id": "vessel-uuid-002",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "duration_hours": 4,
  "sea_days": 1,
  "status": "pending",
  "service_type": "watchkeeping_service",
  "watchkeeping_hours": 4,
  "additional_watchkeeping_hours": null,
  "is_stationary": false,
  "notes": "Engine room watch, Chief Engineer capacity, vessel underway",
  "mca_compliant": true,
  "detection_window_hours": 4,
  "created_at": "2024-01-15T10:10:00Z"
}
```

### Engineering Officer - Additional Watchkeeping (At Anchor)

**Request**:
```bash
POST /api/logbook/manual-entry
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "vessel_id": "vessel-uuid-002",
  "start_time": "2024-01-15T14:00:00Z",
  "end_time": "2024-01-15T18:00:00Z",
  "service_type": "watchkeeping_service",
  "additional_watchkeeping_hours": 4,
  "is_stationary": true,
  "notes": "Engine room watchkeeping at anchor, generators running, Yacht-Restricted Certificate holder"
}
```

**Response** (200):
```json
{
  "id": "entry-004",
  "vessel_id": "vessel-uuid-002",
  "start_time": "2024-01-15T14:00:00Z",
  "end_time": "2024-01-15T18:00:00Z",
  "duration_hours": 4,
  "sea_days": 1,
  "status": "pending",
  "service_type": "watchkeeping_service",
  "watchkeeping_hours": null,
  "additional_watchkeeping_hours": 4,
  "is_stationary": true,
  "notes": "Engine room watchkeeping at anchor, generators running, Yacht-Restricted Certificate holder",
  "mca_compliant": true,
  "detection_window_hours": 4,
  "created_at": "2024-01-15T10:15:00Z"
}
```

### Yard Service Entry

**Request** (Both Deck and Engineering):
```bash
POST /api/logbook/manual-entry
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "vessel_id": "vessel-uuid-003",
  "start_time": "2024-01-20T00:00:00Z",
  "end_time": "2024-01-20T23:59:59Z",
  "service_type": "yard_service",
  "is_stationary": true,
  "notes": "Standing by vessel during refit - engine overhaul"
}
```

**Response** (200):
```json
{
  "id": "entry-005",
  "vessel_id": "vessel-uuid-003",
  "start_time": "2024-01-20T00:00:00Z",
  "end_time": "2024-01-20T23:59:59Z",
  "duration_hours": 24,
  "sea_days": 1,
  "status": "pending",
  "service_type": "yard_service",
  "watchkeeping_hours": null,
  "additional_watchkeeping_hours": null,
  "is_stationary": true,
  "notes": "Standing by vessel during refit - engine overhaul",
  "mca_compliant": true,
  "detection_window_hours": 24,
  "created_at": "2024-01-20T10:00:00Z"
}
```

---

## Error Examples

### Invalid Department Selection

**Request**:
```bash
PUT /api/profile/department
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "department": "Deck"
}
```

**Response** (400):
```json
{
  "error": "Invalid department. Must be \"deck\" or \"engineering\""
}
```

### Missing Authentication

**Request**:
```bash
GET /api/profile
```

**Response** (401):
```json
{
  "error": "Authentication required"
}
```

### Session Expired

**Request**:
```bash
PUT /api/profile/department
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "department": "engineering"
}
```

**Response** (401):
```json
{
  "error": "Session expired"
}
```

---

## Retrieving Sea Time Entries

### Get All Sea Time Entries

**Request**:
```bash
GET /api/sea-time
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 - Array of entries):
```json
[
  {
    "id": "entry-001",
    "vessel_id": "vessel-uuid-001",
    "start_time": "2024-01-15T08:00:00Z",
    "end_time": "2024-01-15T18:00:00Z",
    "duration_hours": 10,
    "sea_days": 1,
    "status": "confirmed",
    "service_type": "actual_sea_service",
    "watchkeeping_hours": null,
    "additional_watchkeeping_hours": null,
    "is_stationary": false,
    "notes": "10 hours underway",
    "mca_compliant": true,
    "detection_window_hours": 10,
    "created_at": "2024-01-15T10:00:00Z"
  },
  {
    "id": "entry-002",
    "vessel_id": "vessel-uuid-001",
    "start_time": "2024-01-15T08:00:00Z",
    "end_time": "2024-01-15T12:00:00Z",
    "duration_hours": 4,
    "sea_days": 1,
    "status": "confirmed",
    "service_type": "watchkeeping_service",
    "watchkeeping_hours": 4,
    "additional_watchkeeping_hours": null,
    "is_stationary": false,
    "notes": "Bridge watch",
    "mca_compliant": true,
    "detection_window_hours": 4,
    "created_at": "2024-01-15T10:05:00Z"
  }
]
```

### Get Pending Sea Time Entries

**Request**:
```bash
GET /api/sea-time/pending
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 - Pending entries only):
```json
[
  {
    "id": "entry-005",
    "vessel_id": "vessel-uuid-003",
    "start_time": "2024-01-20T00:00:00Z",
    "end_time": "2024-01-20T23:59:59Z",
    "duration_hours": 24,
    "sea_days": 1,
    "status": "pending",
    "service_type": "yard_service",
    "watchkeeping_hours": null,
    "additional_watchkeeping_hours": null,
    "is_stationary": true,
    "notes": "Yard service - refit",
    "mca_compliant": true,
    "detection_window_hours": 24,
    "created_at": "2024-01-20T10:00:00Z"
  }
]
```

---

## Update Department After Signup

**Request**:
```bash
PUT /api/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "department": "engineering",
  "nationality": "Norwegian",
  "srb_no": "SRB/2024/00789"
}
```

**Response** (200):
```json
{
  "id": "user-abc123",
  "name": "Sarah Captain",
  "email": "sarah.captain@maritime.co.uk",
  "emailVerified": false,
  "image": null,
  "imageUrl": null,
  "address": null,
  "tel_no": null,
  "date_of_birth": null,
  "srb_no": "SRB/2024/00789",
  "nationality": "Norwegian",
  "pya_membership_no": null,
  "department": "engineering",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-16T15:30:00Z"
}
```
