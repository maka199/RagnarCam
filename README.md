# RagnarCam

Enkel hundmonitor med WebRTC mellan en mobil (Monitor) och en tittare (Viewer). Signaleringsservern använder WebSocket och körs lokalt.

## Funktioner
- Monitor (mobil) publicerar kamera + mikrofon via WebRTC
- Viewer tar emot strömmen i webbläsare
- Enkel rooms-modell (1 monitor + 1 viewer per rum)

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
