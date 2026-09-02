# SimDPG smoke test

A copy-paste checklist to confirm the systems are working — in particular the
Milestone 3 DCI API conventions (error envelope, pagination, `X-Request-ID`,
DCI webhook events + event log, and OpenAPI docs).

Everything below runs from the repo root. Lines beginning with `#` are comments;
expected output is shown under each command.

## 0. Install, build, lint

```bash
npm install
npm run build         # builds packages, all 7 systems, the portal, and the simulation
npm run lint          # redocly lint of all 7 openapi.yaml specs — must end "🎉" (warnings OK)
npm run check:routes  # boots each app and diffs its routes against its openapi.yaml
```

- `npm run build` exits 0.
- `npm run lint` prints **"Your API descriptions are valid. 🎉"** (a few
  `info-license-strict` warnings are expected and fine).
- `npm run check:routes` prints a `✓` line per system and **"All systems' routes
  match their OpenAPI specs."** (this is how spec drift is caught — if you add a
  route without documenting it, this step fails).

## 1. Start the systems

In one terminal:

```bash
npm run reset          # optional: wipe all SQLite DBs for a clean run
npm run dev:systems    # starts identity:3001, civil-registry:3002, health:3003, benefits:3004, notifications:3005, payments:3006, social-registry:3007
```

Leave it running and open a second terminal for the checks below.

## 2. Health checks

```bash
for p in 3001 3002 3003 3004 3005 3006 3007; do curl -s localhost:$p/health; echo; done
```

Expected — one line per system, each reporting its database as well as itself:

```json
{"status":"ok","system":"identity","version":"0.1.0","database":"ok"}
{"status":"ok","system":"civil-registry","version":"0.1.0","database":"ok"}
{"status":"ok","system":"health","version":"0.1.0","database":"ok"}
{"status":"ok","system":"benefits","version":"0.1.0","database":"ok"}
{"status":"ok","system":"notifications","version":"0.1.0","database":"ok"}
{"status":"ok","system":"payments","version":"0.1.0","database":"ok"}
{"status":"ok","system":"social-registry","version":"0.1.0","database":"ok"}
```

`"database": "empty"` means the system is up but holds no data (seed it with
`npm run setup`); `"error"` means the database is broken — see
[section 14](#14-database-health-and-the-alert-banner).

## 3. OpenAPI docs & spec (every system)

```bash
for p in 3001 3002 3003 3004 3005 3006 3007; do
  echo -n "port $p: "
  curl -s -o /dev/null -w "docs=%{http_code} spec=" localhost:$p/docs
  curl -s -o /dev/null -w "%{http_code}\n" localhost:$p/openapi.yaml
done
```

Expected: `docs=200 spec=200` for every port. Open
<http://localhost:3001/docs> in a browser to see the interactive reference.

## 4. Create a citizen — `X-Request-ID` is echoed

```bash
curl -s -i -X POST localhost:3001/citizens \
  -H 'Content-Type: application/json' \
  -d '{"given_name":"Ada","family_name":"Byron","date_of_birth":"1990-12-10","sex":"female"}' \
  | grep -iE 'HTTP/|X-Request-ID'
```

Expected: `HTTP/1.1 201 Created` and an `X-Request-ID:` header (a fresh UUID).

## 5. Pagination envelope on list endpoints

```bash
curl -s 'localhost:3001/citizens?per_page=5'
```

Expected shape — `{ data: [...], meta: { page, per_page, total } }`:

```json
{"data":[{ "national_id":"SIM-000001", ... }],"meta":{"page":1,"per_page":5,"total":1}}
```

## 6. Error envelope (404)

```bash
curl -s localhost:3001/citizens/does-not-exist
```

Expected — the DCI error envelope:

```json
{"error":{"code":"NOT_FOUND","message":"Citizen not found","details":null}}
```

## 7. Validation error envelope (400)

```bash
curl -s -X POST localhost:3001/citizens -H 'Content-Type: application/json' -d '{"given_name":"X"}'
```

Expected — `VALIDATION_ERROR` with per-field `details`:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Request validation failed","details":[{"path":"family_name","message":"Required"}, ...]}}
```

## 8. Inbound `X-Request-ID` is honoured

```bash
curl -s -i -H 'X-Request-ID: trace-abc-123' 'localhost:3001/citizens?per_page=1' | grep -i 'x-request-id'
```

Expected: `X-Request-ID: trace-abc-123` (the id you sent, echoed back).

## 9. Webhook event log

The citizen you created in step 4 was recorded as a webhook event. Because no
`WEBHOOK_URL` is configured, its delivery status is `skipped`:

```bash
curl -s 'localhost:3001/admin/webhooks?per_page=1'
```

Expected — a `{ data, meta }` page whose first event is a DCI envelope
(`{ id, type, source, time, data }`) with `"type":"citizen.created"` and
`"status":"skipped"`.

## 10. Webhook delivery to a real target (optional)

Confirms events are actually POSTed to `WEBHOOK_URL`. In a third terminal start a
tiny listener:

```bash
node -e 'require("http").createServer((q,s)=>{let b="";q.on("data",c=>b+=c);q.on("end",()=>{console.log("got",JSON.parse(b).type,"xrid="+q.headers["x-request-id"]);s.end("ok")})}).listen(4999,()=>console.log("listening on 4999"))'
```

Then run a throwaway identity instance pointed at it (requires `npm run build`
to have produced `dist/`):

```bash
PORT=3101 WEBHOOK_URL=http://localhost:4999/hook node systems/identity/dist/index.js &
sleep 1
curl -s -o /dev/null -X POST localhost:3101/citizens \
  -H 'Content-Type: application/json' \
  -d '{"given_name":"Grace","family_name":"Hopper","date_of_birth":"1980-01-01","sex":"female"}'
sleep 1
curl -s 'localhost:3101/admin/webhooks?per_page=1'   # status should now be "delivered"
```

Expected: the listener prints `got citizen.created xrid=<uuid>`, and the webhook
log shows `"status":"delivered"`. Stop the throwaway instance and listener with
`kill %1 %2` (or close the terminals).

## 11. Cross-system spot check

```bash
for entry in civil-registry:3002 health:3003 benefits:3004 notifications:3005 payments:3006 social-registry:3007; do
  name=${entry%%:*}; port=${entry##*:}
  echo "== $name =="
  curl -s "localhost:$port/admin/webhooks?per_page=1"; echo   # {data,meta}
  curl -s "localhost:$port/admin/stats"; echo                 # record counts
done
```

Expected: each system returns a `{ data, meta }` webhook page and a stats object.

## 12. Portal (optional, end-to-end)

```bash
npm run dev          # systems + portal on http://localhost:3000
```

- **Staff → Search citizens**: search by name returns the citizen from step 4.
- **Staff → Citizen timeline**: shows the registration event.
- **Staff → Systems catalog**: the new "API conventions" section lists the
  `/docs`, `/openapi.yaml`, and `/admin/webhooks` links for each system.

## 13. Stochastic behaviour (latency, failures, rate limiting)

Off by default:

```bash
curl -s localhost:3001/admin/behavior; echo    # "enabled": false, preset "off"
```

Make Identity flaky for one minute, then watch it:

```bash
curl -s -X PUT localhost:3001/admin/behavior \
  -H 'content-type: application/json' \
  -d "{\"preset\":\"flaky\",\"source\":\"smoke test\",\"expires_at\":\"$(date -u -d '+60 seconds' +%Y-%m-%dT%H:%M:%SZ)\"}"; echo

for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s %header{x-simdpg-injected}\n" \
    "localhost:3001/citizens?per_page=1"
done
```

Expected: responses take a few hundred ms and vary; roughly 1 in 10 is a `503`
tagged `failure`, whose body is the normal error envelope with
`"injected": true`.

Health and admin are never affected — both should return in a millisecond:

```bash
curl -s -o /dev/null -w "health %{http_code} %{time_total}s\n" localhost:3001/health
curl -s -o /dev/null -w "admin  %{http_code} %{time_total}s\n" localhost:3001/admin/stats
```

Throttling is deterministic:

```bash
curl -s -X PUT localhost:3001/admin/behavior -H 'content-type: application/json' \
  -d '{"rate_limit":{"max":3,"window_ms":2000}}' -o /dev/null
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "%{http_code} retry-after=%header{retry-after}\n" \
    "localhost:3001/citizens?per_page=1"
done
curl -s localhost:3001/admin/behavior; echo   # counters: requests / rate_limited
curl -s -X DELETE localhost:3001/admin/behavior; echo   # back to default
```

Expected: three `200`s then `429`s with a `Retry-After`, and after the `DELETE`,
`"enabled": false`.

### Applied for the length of a simulation (needs the portal)

```bash
npm run dev      # systems + portal
```

On **Staff → Simulations → Start new simulation**, pick a **System behaviour**
preset (e.g. Flaky), create the run, then generate and start it. While it runs:

```bash
curl -s localhost:3000/api/systems/behavior; echo    # all seven report enabled
```

Expected: every system carries the same config with `source: "simulation <id>"`
and an `expires_at`; the run's detail page shows a **System behaviour** table with
counters climbing. Stop the run, then check again — all seven report
`"enabled": false`, and calls to the systems are fast again.

## 14. Database health and the alert banner

A database that never got its tables (or lives on a volume that isn't mounted)
doesn't throw — it just returns nothing. These checks prove that state is
reported rather than rendered as a population of zero.

```bash
curl -s localhost:3001/admin/db-health; echo      # one system
curl -s localhost:3000/api/health/database; echo  # everything, needs the portal
```

Expected: each system reports `"status":"ok"` with row counts, and the portal
reports `"status":"ok"` for itself and all seven systems (HTTP 200).

Now break one on purpose and watch it get caught:

```bash
node -e "new (require('better-sqlite3'))('systems/identity/data/identity.sqlite').exec('DROP TABLE addresses')"
curl -s localhost:3001/admin/db-health; echo
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/health/database
```

Expected: identity reports `"status":"error"` naming the missing table, the
portal answers **503**, and every portal page (including the citizen-facing
home page) shows a red banner at the top naming the Identity service, the
problem, and `npm run db:seed -w @simdpg/identity`. Run that command and the
banner clears within a minute — or press **Check again**.

Stopping a system instead of breaking its database gives the same banner with
"not answering"; deleting all population data (Staff → Population → Delete)
gives the amber "no data" version.

## Teardown

```bash
# stop dev:systems / dev with Ctrl-C, then optionally:
npm run reset
```
