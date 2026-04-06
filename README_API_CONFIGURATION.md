
# SeaTime Tracker - API Configuration

## MyShipTracking API Integration

The SeaTime Tracker app uses the MyShipTracking API to fetch real-time AIS (Automatic Identification System) data for vessels.

### API Configuration

**API Endpoint:** `https://api.myshiptracking.com/api/v2/vessel`

**API Key:** `M56gZlmWzEnfaQaZfD8UiT*cKlt3^OL$^g`

### Authentication

The API key must be passed in the HTTP request header using one of these methods:
- `Authorization: Bearer M56gZlmWzEnfaQaZfD8UiT*cKlt3^OL$^g`
- `x-api-key: M56gZlmWzEnfaQaZfD8UiT*cKlt3^OL$^g`

### API Parameters

**Required:**
- `mmsi` - 9-digit Maritime Mobile Service Identity number

**Optional:**
- `response` - Either "simple" (default) or "extended" for additional details

### Example Request

```bash
curl -X GET "https://api.myshiptracking.com/api/v2/vessel?mmsi=123456789&response=extended" \
  -H "Authorization: Bearer M56gZlmWzEnfaQaZfD8UiT*cKlt3^OL$^g"
```

### Backend Configuration

The backend automatically uses the API key stored in the environment variable `MYSHIPTRACKING_API_KEY`. If not set, it defaults to the key above.

The backend handles:
1. Fetching vessel AIS data from MyShipTracking API
2. Determining if a vessel is moving (speed > 0.5 knots)
3. Creating sea time entries when vessels are detected at sea
4. Tracking vessel positions and status

### Coverage Note

Only terrestrial AIS data is supported. Coverage depends on the MyShipTracking network. Check [MyShipTracking.com](https://myshiptracking.com) for live coverage information.
