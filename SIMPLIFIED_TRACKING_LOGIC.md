
# Simplified Vessel Tracking Logic

## Overview
The tracking system has been simplified to focus on detecting vessel movement over 4-hour observation windows.

## How It Works

### 1. Active Vessel Tracking
- **Only active vessels are tracked** (vessels with `is_active = true`)
- Inactive vessels are completely ignored by the scheduler

### 2. Observation Windows
- The system checks vessel positions **every 4 hours**
- Each check compares the current position with the position from 4 hours ago

### 3. Movement Detection
- If the vessel has moved **more than 0.1 degrees** (latitude or longitude), movement is detected
- Movement threshold: `max(|lat_diff|, |lng_diff|) > 0.1 degrees`

### 4. Entry Creation
When movement is detected:
- A **pending sea time entry** is created with:
  - `start_time`: timestamp from 4 hours ago
  - `end_time`: current timestamp
  - `start_latitude/start_longitude`: position from 4 hours ago
  - `end_latitude/end_longitude`: current position
  - `duration_hours`: 4 (the observation window)
  - `status`: 'pending' (awaiting user review)
  - `notes`: "Movement detected: vessel moved [X] degrees over 4 hours"

### 5. User Review
- All detected movements are sent to the **Confirmations page** for user review
- Users can confirm or reject each entry
- Users can add notes and select service type when confirming

## What Was Removed
The following complex logic has been removed:
- ❌ 24-hour analysis windows
- ❌ Multiple movement period detection
- ❌ MCA compliance automatic checks
- ❌ Sea days automatic calculations
- ❌ 2-hour sliding windows
- ❌ GPS drift detection
- ❌ Calendar day duplicate checks
- ❌ Automatic entry status determination

## Simple Algorithm
```
Every 4 hours, for each active vessel:
1. Get current AIS position
2. Get AIS position from 4 hours ago
3. Calculate position difference
4. If difference > 0.1 degrees:
   → Create pending entry for user review
5. If difference ≤ 0.1 degrees:
   → Do nothing (vessel hasn't moved significantly)
```

## Benefits
- **Simpler logic**: Easy to understand and debug
- **User control**: All entries require user confirmation
- **Transparent**: Users see exactly what movement was detected
- **Flexible**: Users decide which entries count as sea time
- **No false positives**: Complex automatic logic removed
