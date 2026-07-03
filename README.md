# FocusFlight ✈️

Een focus-app die je Pomodoro-sessie inpakt als een vliegreis. Je boekt een vlucht
tussen twee echte vliegvelden, kiest een **echt toestel** (Boeing, Airbus, …) en
een **echte airline-livery**, en blijft gefocust terwijl het vliegtuig over een
**echte vluchtroute met waypoints** naar de bestemming vliegt. De **focusduur is de
echte vluchtduur** en hangt af van het gekozen toestel: dezelfde route duurt met een
trage turboprop langer dan met een 747. Bij de landing wordt je sessie gelogd en
verdien je flight miles.

Web-app / PWA, volledig lokaal (geen account, geen server). Geïnspireerd op de
iOS-app *FocusFlight – Deepfocus Timer*, maar met eigen accenten.

## Snel starten

Node draait lokaal in `~/.local/node` (staat niet in je globale PATH). Gebruik de
meegeleverde scripts:

```bash
./dev.sh      # start de dev-server op http://localhost:5173
./build.sh    # productie-build naar dist/
```

Of handmatig:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm run dev        # ontwikkelen
npm run build      # bouwen (tsc --noEmit && vite build)
npm test           # unit-tests (Vitest)
```

## Wat werkt (v1)

- **Onboarding** – kies je thuisbasis.
- **Boeken** – bestemming zoeken (met de vluchttijd per bestemming, gesorteerd van
  kort naar lang), intentie (Study/Work/Create), **echt toestel + airline-livery**
  kiezen met live preview. De vluchtduur = je focussessie en verschilt per toestel.
- **Boarding pass** – skeuomorfe kaart met seat, gate, ETA.
- **Actieve vlucht** – kaart met bewegend toestel op een echte gebogen route,
  fase-indicator (vertrek → klimmen → kruishoogte → daling → landing), timer,
  cabinegeluid, pure/minimal modus, pauze & afbreken.
- **Landing** – "veilig geland"-samenvatting + verdiende mijlen.
- **FlightLog** – geschiedenis + statistieken + CSV-export.
- **Collectie** – loyalty-tiers (Blue→Diamond) + toestellen- en livery-galerij.
- **Instellingen** – thuisbasis, geluid, strikte modus, gegevens wissen.

## Architectuur

- **Vite + React + TypeScript + Tailwind**, state via **Zustand**, opslag via
  **Dexie** (IndexedDB).
- `src/lib/geo.ts` – zelfstandige great-circle-wiskunde (afstand, sampling,
  koers, antimeridiaan-split). Geen externe geo-dependency.
- `src/lib/routeEngine.ts` – `getRoute()` gebruikt **echte gefilede routes met
  waypoints** uit `src/data/routes.json` (opgehaald door `scripts/build-routes.mjs`
  via de Flight Plan Database API). Een runtime-filter valt terug op een gebogen
  great-circle als een route ontbreekt of te ver van de directe lijn afwijkt.
- `src/lib/flight.ts` – `flightMinutes(afstand, toestel)` bepaalt de sessieduur uit
  de kruissnelheid van het toestel (langzamer toestel → langere sessie).
- `scripts/build-routes.mjs` – Node-script dat de route-catalogus (her)opbouwt:
  `node scripts/build-routes.mjs` (geen API-key nodig; wordt gethrottled).
- `src/components/FlightCanvas.tsx` – **Canvas2D-kaart/flight-tracker**: inzoombaar,
  verschuifbaar, met echte kustlijnen (`src/data/worldLand.ts`), geanimeerd toestel
  en live snelheid/hoogte/koers. Voor **AMS↔BCN** schakelt hij over op een echte
  **IFR-navigatiekaart** (`route.chart`): gedetailleerde regio-geografie +
  landsgrenzen (`src/data/regionGeo.ts`, Natural Earth 50m), waypoint-symbolen
  (VOR = zeshoek, RNAV-fix = driehoek), airway-codes en de route in SID/enroute/STAR-kleuren.
- `src/data/routeAmsBcn.ts` – gecureerde, echte **IFR-route EHAM→LEBL** (SID LEKKO 1S,
  airways UN872/857/859/727, STAR PUMAL 2W) met echte waypoint-namen, -types en -coördinaten.
- `src/components/AircraftSVG.tsx` – data-gedreven toestel-SVG dat per livery
  wordt ingekleurd (`src/data/liveries.ts`).

### Waarom Canvas2D i.p.v. een tegel-kaart (MapLibre)?

De eerste opzet gebruikte MapLibre GL (vector-tegels). Dat vereist een WebGL
**web worker**, die in sommige omgevingen (o.a. de ontwikkel-preview hier)
geblokkeerd wordt, waardoor de kaart zwart blijft. De Canvas2D-kaart heeft geen
worker/WebGL nodig, werkt overal, is veel lichter (bundle ~356 KB i.p.v. ~1,1 MB)
en toont voor een wereldwijde vluchtweergave precies het juiste detailniveau
(continenten + kustlijnen). Een MapLibre-modus kan later als optionele
"satelliet/3D"-weergave terugkomen.

## Roadmap (uit het plan)

- **Echte airways/waypoints**: `scripts/build-routes` die per stedenpaar een
  echte waypoint-route ophaalt (Flight Plan Database `/auto/generate`) en als
  statische GeoJSON in de catalogus zet.
- Grotere geluidsbibliotheek, layover/pauzes, mid-flight micro-rewards.
- Meer toestellen/livery's, achievements, seizoensroutes, stats-dashboard.
- PWA-installatie, Wake Lock, notificaties, offline.

## Juridische kanttekening — alleen voor privégebruik

Deze build gebruikt **echte merk- en airline-namen** (Boeing, Airbus, KLM, …) en
livery-kleuren, op uitdrukkelijk verzoek voor **privégebruik**. Merknamen, logo's en
kenmerkende livery's zijn merkrechtelijk (trade dress) en soms auteursrechtelijk
beschermd. **Publiceer of monetiseer deze versie niet.** Voor publicatie: vervang de
toestel-/airline-namen en livery's door fictieve varianten (het systeem is
data-gedreven, dus dat is een aanpassing in `src/data/`), en kies een eigen app-naam.

Databronnen: routes via Flight Plan Database (simulatie-/visueel gebruik, attributie);
kustlijnen © Natural Earth (publiek domein); luchthavens ontleend aan OurAirports
(publiek domein).
