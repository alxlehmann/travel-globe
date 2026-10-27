Travel globe dependencies (served locally)

d3-array 3.2.4 — https://github.com/d3/d3-array — ISC
d3-geo 3.1.1 — https://github.com/d3/d3-geo — ISC
topojson-client 3.1.0 — https://github.com/topojson/topojson-client — ISC
Licence texts are included alongside each library.

assets/data/globe-land-50m.json: World Atlas 2.0.2 land-50m.json,
derived from Natural Earth 1:50m physical land geometry (public domain).
https://github.com/topojson/world-atlas
https://www.naturalearthdata.com/about/terms-of-use/

assets/data/travel-places.json: user's supplied travel list, normalized
English/German names and approximate geographic coordinates.
Lakolk is the locality on Rømø; Elton is the Russian village near Lake Elton;
Geirangerfjord is a point within the fjord, not an additional city.

assets/data/globe-borders-50m.json: internal country boundary mesh extracted
from World Atlas 2.0.2 countries-50m.json (Natural Earth, public domain).
Coastlines are excluded; shared country borders are drawn only once.
