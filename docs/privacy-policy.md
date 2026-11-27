# Privacy policy (template)

> **Template only.** Fill in the `[...]`, check it against what your deployment
> actually logs, and have a lawyer review it. Delete anything that is not true of your
> setup — an inaccurate policy is worse than none.

**Who is responsible.** `[Company / your name]`, `[address]`, `[e-mail]` (“we”).

**What we collect**

| Data | Why | Kept |
| --- | --- | --- |
| Account name and e-mail | to sign you in and contact you about the service | until you delete the account |
| Password | authentication — stored only as a salted hash by Django | until you delete the account |
| Session cookie | keeps you signed in; it is a session cookie, not advertising | until you sign out or it expires |
| Maps you upload, their place fields and georeference | to give them back to your devices | until you delete them or your account |
| Waypoints and tracks | to sync them between your devices | until you delete them or your account |
| Server logs (IP, user agent, requested URL, time) | security and debugging | `[N]` days |

We do **not** use advertising or analytics cookies, and we do not sell data.

**Where it is stored.** On `[hosting provider, country]`, in a Docker volume on that
server. `[If you use Cloudflare Tunnel: connections pass through Cloudflare, Inc. —
see their privacy terms.]`

**Who else sees it.** `[Hosting provider]` as our processor; `[payment processor]` for
billing (if paid plans exist); nobody else, unless the law requires it.

**Map data we serve you.** Base map tiles rendered from OpenStreetMap data are
© OpenStreetMap contributors, ODbL 1.0. Serving a tile does not tell the OpenStreetMap
Foundation or anyone else who you are; we render the tiles ourselves. USGS layers are
public domain. See `/licences/`.

**Your rights.** You can export everything we hold about you (`Tools → Account →
Export my data`) and delete your account (`Tools → Account → Delete my account`), which
removes your maps, waypoints, tracks and login. `[If GDPR applies: you also have the
right to rectification, restriction, objection and to complain to a supervisory
authority. Name yours.]`

**Backups.** `[Yes/no — if yes: backups are kept for N days, so deleted data leaves the
live service immediately and backups within N days.]`

**Children.** The service is not intended for children under `[16]`.

**Changes.** We will announce material changes `[N]` days before they take effect.

**Contact.** `[e-mail]`.
