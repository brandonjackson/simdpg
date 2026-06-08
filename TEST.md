# SimDPG smoke test

A copy-paste checklist to confirm the systems are working — in particular the
Milestone 3 DCI API conventions (error envelope, pagination, `X-Request-ID`,
DCI webhook events + event log, and OpenAPI docs).

Everything below runs from the repo root. Lines beginning with `#` are comments;
expected output is shown under each command.

## 0. Install, build, lint

```bash
npm install
npm run build         # builds packages, all 6 systems, the portal, and the simulation
npm run lint          # redocly lint of all 6 openapi.yaml specs — must end "🎉" (warnings OK)
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
npm run dev:systems    # starts identity:3001, civil-registry:3002, health:3003, benefits:3004, notifications:3005
```

Leave it running and open a second terminal for the checks below.

## 2. Health checks

```bash
for p in 3001 3002 3003 3004 3005; do curl -s localhost:$p/health; echo; done
```

Expected — one line per system:

```json
{"status":"ok","system":"identity","version":"0.1.0"}
{"status":"ok","system":"civil-registry","version":"0.1.0"}
{"status":"ok","system":"health","version":"0.1.0"}
{"status":"ok","system":"benefits","version":"0.1.0"}
{"status":"ok","system":"notifications","version":"0.1.0"}
```

## 3. OpenAPI docs & spec (every system)

```bash
for p in 3001 3002 3003 3004 3005; do
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
for entry in civil-registry:3002 health:3003 benefits:3004 notifications:3005; do
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

## Teardown

```bash
# stop dev:systems / dev with Ctrl-C, then optionally:
npm run reset
```
