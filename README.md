# RagnarCam

Enkel hundmonitor med WebRTC mellan en mobil (Monitor) och en tittare (Viewer). Signaleringsservern använder WebSocket och körs lokalt.

## Funktioner
- Monitor (mobil) publicerar kamera + mikrofon via WebRTC
- Viewer tar emot strömmen i webbläsare
- Enkel rooms-modell (1 monitor + 1 viewer per rum)
 - Autoinspelning av klipp vid rörelse/ljud (lagras lokalt på servern)

## Kör lokalt
Öppna två terminaler:

Terminal 1 – server (port 4000):

```bash
cd server
npm install
npm start
```

Terminal 2 – klient (Vite dev server på port 5173, tillgänglig på LAN):

```bash
cd client
npm install
npm run dev
```

Vite är konfigurerad med `server.host = true` så du kan nå klienten från andra enheter på samma nätverk via `http://<DIN_LAN_IP>:5173`.

## Användning på mobiler och surfplattor
1. Starta både server och klient som ovan.
2. Öppna på din mobil/surfplatta: `http://<DIN_LAN_IP>:5173` (ersätt med datorns IP, t.ex. `192.168.1.15`).
3. Skriv ett rumsnamn, välj “Starta som Monitor” på enheten som ska sända.
4. På en annan enhet (mobil/platta/dator), öppna samma adress, skriv samma rum och välj “Anslut som Viewer”.

Tips för kamera/mikrofon:
- iOS Safari kräver HTTPS för getUserMedia i många fall. För lokala tester kan det fungera via HTTP om du kör på LAN, men för bästa kompatibilitet använd en reverse proxy med HTTPS eller Vite dev med certifikat.
- Android Chrome brukar tillåta HTTP på lokalt nät (insecure origins treated as secure kan variera). Om du inte får prompt för kamera/mikrofon, prova HTTPS.

## HTTPS (frivilligt men rekommenderas på mobil)
För bättre kompatibilitet på mobiler, kör klienten över HTTPS (self-signed cert går bra):

Exempel via mkcert + vite (snabbt spår):
1. Installera `mkcert` lokalt och skapa cert för ditt LAN-namn/IP.
2. Lägg in cert i Vite config (`server.https`).
3. Surfa till `https://<DIN_LAN_IP>:5173` från mobilen och acceptera certifikatet.

## Kända begränsningar / nästa steg
- Endast 1:1 (en monitor, en viewer) per rum.
- Ingen persistens – rumsstatus ligger i minnet på signaleringsservern.
- Ingen TURN-server – över Internet/NAT kan P2P fallera. På samma LAN ska det fungera med publika STUN.

För produktion via Internet, lägg till en TURN-server (t.ex. coturn) och riktig domän med TLS.

## Deploy på Render (remote åtkomst)

Alternativ A: En tjänst som både kör signalering och statiska klientfiler.

1. Bygg klienten och kopiera till servern:
	- Kör lokalt: `cd server && npm run build:client`
	- Det skapar `server/client-dist/` med byggda filer.
2. Skapa en Web Service på Render med root = `server/`.
	- Build Command: `npm install && npm run build:client`
	- Start Command: `node index.js`
3. Miljövariabler (om du har TURN):
	- `ICE_SERVERS` (JSON) eller
	- `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`

Servern servar `/config` (ICE) och statiskt innehåll från `client-dist`. WebSocket använder samma origin (wss) i prod.

Alternativ B: Två tjänster (en för klient, en för signalering), sätt `VITE_SIGNALING_ORIGIN` i klientens build.

1. Deploya signaleringsservern (server/)
2. Deploya klienten (client/) som statisk site. Vid build, ange env:
	- `VITE_SIGNALING_ORIGIN=https://din-signalering.example.com`
3. Klienten kopplar då sin WS mot angiven origin (wss).

### Fast rum (ROOM_ID)
- Om du sätter `ROOM_ID` (eller `ROOM`) som env i Render så tvingar servern alla anslutningar till det rummet.
- Klienten kan förifylla rummet via URL `?room=<namn>` eller env `VITE_DEFAULT_ROOM` (vid build).

## Autoinspelning (rörelse/ljud)

Monitor-sidan har en checkbox “Autoinspelning (rörelse/ljud)”. När den är på:
- En enkel rörelsedetektering körs via canvas-frame-diff på en nedskalad bild.
- Ljudnivå mäts via Web Audio (RMS). Om rörelse eller ljud överstiger tröskelvärden startas en inspelning.
- Standard: fasta klipp på 60 sekunder.
- Valbart: kryssa i “Förläng medan det är aktivitet” för rullande stopp — klippet fortsätter då medan det är aktivitet och stoppas när det varit lugnt i X ms (calm timeout), dock aldrig längre än maxlängd.
- Standardinställningar: maxlängd 60 s, cooldown 10 s (calm timeout används bara om “Förläng…” är på).
- Alla trösklar och tider kan justeras i UI:t under “Inspelningsinställningar”.

Klipp lagras på serverns filsystem under `server/clips/<room>/` och exponeras som URLs under `/clips/<room>/<fil>`. Viewer-sidan har en “Klipp”-sektion som listar och spelar upp klipp. API:n är:
- `GET /api/clips/:room` – listar senaste klipp
- `POST /api/upload-clip?room=...&ts=...&ext=webm|mp4` – rå binär kropp (Content-Type matchar filtyp)

Viktigt om Render (gratisnivå): Render’s filsystem är ephemeralt och kan nollställas vid omdeploy/omstart. Det innebär att klipp inte är garanterat persistenta utan kostnad. Om du behöver beständig lagring, koppla upp mot ett kostnadsfritt eller lågkostnads-objektlager (t.ex. S3 kompatibelt). Vi kan lägga till en enkel S3-uppladdning senare om du vill.

### Flera monitorer?
I nuläget är rumsmodellen 1:1 (en monitor + en viewer per rum). Vill du köra flera monitorer samtidigt använder du separata rum (t.ex. “vardagsrum”, “hall”, “kök”) och öppnar motsvarande viewer för varje rum. 

Framtida förbättring: Det går att bygga ut servern för flera monitorer i samma rum med val/byte i viewer, men det kräver utökad signalering (lista källor, selektera monitor, hantera kopplingar). Säg till om du vill att vi prioriterar det.

### Spara klipp till din enhet
- I Viewer finns knappar för “Ladda ner” (hämtar filen lokalt) och “Dela” (via Web Share API om enheten stöder det). På iOS/Android öppnas då systemets delningsdialog.
- Om “Dela” inte stöds kan du alltid klicka fil-länken och använda webbläsarens egna “Spara”/“Ladda ned”.
- Filformat är `.webm` (WebM/Opus/VP8/VP9). Det fungerar utmärkt i Android/Chrome och moderna desktop-browser. iOS kan ha begränsat stöd för `.webm` efter nedladdning—spela klippet i appen, öppna i Safari eller dela till VLC/Infuse.

### Inspelningsformat
- Monitorn spelar in i WEBM. Detta är mest kompatibelt som webb-API idag och fungerar bra i moderna webbläsare. På iOS kan uppspelning av nedsparade `.webm`-filer vara begränsad – använd inline-uppspelning i appen eller dela till VLC/Infuse om behövs.
