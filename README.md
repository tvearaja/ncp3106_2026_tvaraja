# FlowGuard

FlowGuard is a simple drainage monitoring and flood-risk awareness web app. The public dashboard opens without login. Staff and administrators use Supabase Auth and an approved profile to reach the monitoring workspace.

## Run locally

This is a static HTML/JavaScript app. Serve this folder over HTTP (ES modules do not work reliably from `file://`):

```powershell
py -m http.server 8000
```

Open `http://localhost:8000`. Without Supabase configuration, the dashboard shows clearly labeled sample data. Open-Meteo provides weather using the configured coordinates.

The pipe viewer uses Three.js with OrbitControls: drag to orbit, use the wheel or pinch to zoom, and switch to the SVG 2D plan from the map controls. For an actual `file://` open, a draggable perspective fallback is used because browser ES modules are restricted for local files.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `config.example.js` to `config.js` and set `supabaseUrl` and `supabaseAnonKey`. The browser must only use the anon/public key; never put a service-role key here.
4. In Supabase Auth, configure email confirmation and allowed redirect URLs for the app host.
5. Register an account, confirm the email, then approve it in the database for initial setup. Promote the first administrator with the commented SQL at the bottom of `schema.sql` after checking the user UUID.
6. For local sensor integration, write current readings to `drains` and append historical rows to `sensor_readings` using a trusted device/server integration. Do not expose a service key to sensor browsers.

Every public registration creates a `staff` profile with `pending` status. Admin or staff access requires approved status. RLS policies enforce access in the database; hiding interface controls is not the security boundary.

## Risk rules and data

`water_level` and `flow_rate` are normalized percentages from 0 to 100. High water plus low flow is critical; debris plus warning-level readings is also critical. Single abnormal readings can be warning or high risk. A stale timestamp becomes offline, separately from critical. Sensor and elevated-rain thresholds are stored in `system_settings` and can be changed by an admin. The browser evaluates the rule for display; this is not a validated flood prediction.

The sample dashboard data uses illustrative Manila coordinates. The SQL seed records use `DEMO-` codes and can be removed with `delete from public.drains where drain_code like 'DEMO-%';`. Replace sample contacts and locations before any public deployment.

## Included views

- `index.html`: public status dashboard, four-pipe SVG schematic, weather, alerts, risk status, emergency contact panel, and critical alert modal.
- `login.html` / `register.html`: Supabase email/password auth and pending staff requests.
- `portal.html`: role-aware staff/admin workspace for drain monitoring, alerts, maintenance, users, and system settings.
- `supabase/schema.sql`: tables, seed data, signup trigger, helper functions, public-safe view, and RLS policies.

The browser app polls drain status every 15 seconds. The Supabase status view contains only public drain fields; private maintenance notes, staff data, and settings remain behind authenticated RLS. Configure exact local emergency contact numbers and confirm public alert wording with local authorities before deployment.

The public dashboard now uses a schematic four-pipe diagram based on the supplied pipe-map reference. Drain marker positions follow a fixed demonstration layout; connect each sensor to its surveyed pipe position before presenting the marker layout as operational infrastructure data.

## Reference

The University Employment System repository was inspected for its responsive layouts, warm palette, bold borders and shadows, status badges, approval flow, and theme patterns. Its employee records and backend were not reused.
