# Third-party licences

HuntMap itself is your code. It bundles or talks to the following; this file is what
you need to keep with any distribution and to reference from your own licence page.

## Bundled software (in `vendor/`)

| Component | Version | Licence | Used for |
| --- | --- | --- | --- |
| pdf.js | 3.11.174 | Apache-2.0 (`vendor/pdfjs/LICENSE`) | rendering PDF maps |
| UTIF.js | 3.1.0 | MIT | decoding TIFF scans |
| pako | 2.1.0 | MIT | Deflate-compressed TIFF |

## Server dependencies

| Component | Licence |
| --- | --- |
| Django | BSD-3-Clause |
| gunicorn | MIT |
| whitenoise | Apache-2.0 |
| SQLite | public domain |

## Map data and tiles

| Source | Licence | Commercial use | Attribution required |
| --- | --- | --- | --- |
| OpenStreetMap data (self-rendered tiles) | ODbL 1.0 | **Yes** | “© OpenStreetMap contributors”, linked to <https://www.openstreetmap.org/copyright> |
| OpenStreetMap community tile servers (`tile.openstreetmap.org`) | ODbL data, OSMF tile policy | **No for paid/high-volume use** — self-host instead | as above |
| OpenTopoMap (their tile server) | CC-BY-SA 4.0, donated servers | **No for paid use** — render your own | “© OpenStreetMap, SRTM · © OpenTopoMap (CC-BY-SA)” |
| USGS The National Map (topo, imagery) | public domain | **Yes** | “Map services and data available from U.S. Geological Survey, National Geospatial Program.” |
| Esri World Imagery / World Topo (the legacy public endpoints) | proprietary (Esri terms) | **Not without an Esri agreement**; not redistributable | Esri, Maxar, Earthstar Geographics |

Notes that matter if you charge money:

* Tiles rendered from OpenStreetMap data are a **Produced Work**. You must show
  “© OpenStreetMap contributors” where the map is shown, linked to the copyright
  page, and you may not hide it behind a menu or a toggle. HuntMap does this in the
  map footer and in **Tools → Licences**.
* The **share-alike** part of the ODbL applies to a *database* derived from OSM
  data, not to your app or to your users' waypoints. If you publish a modified OSM
  extract or a vector tile archive, that database has to stay ODbL.
* The OSMF tile policy is written for the community servers. It warns commercial
  services explicitly: access may be withdrawn at any time, and offline/prefetch is
  prohibited. Do not point a paid app at it.
* USGS asks (does not require) for the acknowledgement above; it costs nothing to
  include and it is already in the app's attribution for those layers.
