# Third-party notices

The original application code is MIT-licensed. This does not replace the licences of the following dependencies and datasets.

| Component | Version | Licence | Source |
| --- | --- | --- | --- |
| D3 Array | 3.2.4 | ISC | https://github.com/d3/d3-array |
| D3 Geo | 3.1.1 | ISC | https://github.com/d3/d3-geo |
| TopoJSON Client | 3.1.0 | ISC | https://github.com/topojson/topojson-client |
| Natural Earth, distributed through World Atlas | World Atlas 2.0.2, 1:50m | Public domain data | https://github.com/topojson/world-atlas |

Complete library copyright and licence texts are in `assets/vendor/globe/`.

`globe-land-50m.json` is the World Atlas `land-50m.json` dataset. `globe-borders-50m.json` is an internal boundary mesh extracted from World Atlas `countries-50m.json` with `topojson.mesh(world, world.objects.countries, (a, b) => a !== b)`; coordinates are rounded to four decimal places. Coastlines are excluded from the boundary mesh to avoid drawing them twice.

Natural Earth publishes its map data in the public domain: https://www.naturalearthdata.com/about/terms-of-use/.

The travel history is supplied by Alexander Lehmann. Place names are normalized for English and German, and marker coordinates are approximate. These locations do not represent live tracking.
