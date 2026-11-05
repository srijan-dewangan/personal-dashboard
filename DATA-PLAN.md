# Data Plan

## Context provenance
- `i want a todo list, focus timer, daily goals tracker, quicl notes, bookmarks and whatever else do you plan` (verbatim user request; defines the five core modules plus open latitude for extras)
- `A single page with your calendar, tasks, weather, and quick notes.` (assistant proposal in parent conversation; user did not reject weather — included as a lightweight weather widget, not full calendar/Gmail integration since Google Calendar is not connected)
- `daily refresh for weather and to reset daily goals` (refresh trigger from build handoff; drives the dailyReset cron action)
- User timezone is Asia/Kolkata / IST (from message tag); default weather city is Delhi, user-editable in the UI, so no location is assumed permanently.

## Tested sources
### Open-Meteo Forecast + Geocoding (no API key)
**Used by**: `getWeather`, `refreshWeather`, `dailyReset`, `setLocation` actions (server-side fetch, cached in DB)
**Test command**: `curl -s "https://api.open-meteo.com/v1/forecast?latitude=28.6139&longitude=77.2090&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FKolkata&forecast_days=3"` and `curl -s "https://geocoding-api.open-meteo.com/v1/search?name=Delhi&count=1"`
**Sample output**: Forecast returned `current.temperature_2m: 22.7°C, weather_code: 0, humidity 72%`, daily max/min arrays for 3 days. Geocoding returned Delhi lat 28.65, lon 77.23, timezone Asia/Kolkata.
**Processing**: Map WMO weather_code to label + icon name server-side; cache full JSON in `weather_cache` with fetched_at; serve cache if <3h old, otherwise refetch. Location stored in `settings` (city, lat, lon) and editable by user.

## Long-term data behavior
- **Refresh policy**: Scheduled daily cron (space_action) calls `dailyReset`: ensures today's daily goals exist by cloning the most recent day's goal definitions with progress 0, and refreshes the weather cache. Weather also refreshes on demand via UI button and when cache is stale on dashboard load.
- **Growth**: Todos, notes, bookmarks, habits accumulate until user deletes them; focus_sessions append-only (only date + minutes retained for stats); goal rows are per-day so history grows one set per day; weather_cache keeps only the latest row.
- **Ordering**: Todos — incomplete first, then priority, then newest; Notes — pinned first, then updated_at desc; Bookmarks — category then newest; Goals — creation order; Habits — creation order.
- **Time semantics**: Dates for goals/habits use Asia/Kolkata calendar day (YYYY-MM-DD stored as text) so "today" matches the user; focus session timestamps are instants rendered viewer-local.

## Rejected approaches
- **Tried**: Gmail / Google Calendar live integration suggested in parent conversation
  **Why rejected**: Google Calendar is not connected and the user's verbatim request lists only self-contained modules; a manual dashboard that works immediately is more honest than empty connector placeholders. Weather via Open-Meteo covers the ambient-info need without any account.
- **Tried**: LocalStorage-only client state
  **Why rejected**: Data must persist across devices and survive the daily cron reset; server DB via actions is the durable contract.

Imagery not needed: this is a utility dashboard (lists, timer, progress) with no visual subjects; identity comes from typography, color, and iconography, not photos.
