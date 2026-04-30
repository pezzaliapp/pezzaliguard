# PezzaliGuard

> Dashboard personale per gestire numeri spam, blacklist e whitelist.
> **100% locale, zero backend, privacy-first, installabile come PWA.**

PezzaliGuard è una Progressive Web App pensata per smartphone. Non promette di
bloccare le chiamate da sola — su iPhone, il sistema non lo permette ad alcuna
PWA. Quello che fa è **gestire e mantenere ordinato il tuo database di numeri
indesiderati**, e produrre un file `spam-numbers.json` pronto a essere consumato
in futuro da un'app iOS nativa con `CallKit / CallDirectoryExtension`.

---

## ✦ Cosa può fare

- ✅ Aggiungere numeri spam con etichetta (SPAM, Call Center, Truffa, Energia, Trading, Sospetto, Altro).
- ✅ Mantenere una **whitelist** separata di numeri sicuri (clienti, fornitori, famiglia, lavoro).
- ✅ Cercare per numero, etichetta o nota.
- ✅ Modificare ed eliminare singoli numeri.
- ✅ **Esportare** l'intero database come `spam-numbers.json` o come `.csv`.
- ✅ **Importare** da JSON o CSV (sostituisci o unisci).
- ✅ **Importare con un click liste community** (italiana curata + database GitHub pubblici via CDN).
- ✅ **Avvisare in tempo reale** sui prefissi pericolosi (Wangiri esteri, numerazioni a pagamento italiane, futuri prefissi AGCom).
- ✅ Funzionare **offline** una volta caricata la prima volta.
- ✅ Essere installata come app dallo smartphone (icona sulla home screen).
- ✅ Non chiama mai server esterni: tutti i dati restano nel browser.

## ✦ Cosa **non** può fare

- ❌ **Non blocca le chiamate su iPhone.** iOS non concede questa capacità a
  PWA, browser o web view. L'unico modo legale per bloccare/identificare
  chiamate su iPhone è una **app nativa** che registri una
  *Call Directory Extension* tramite il framework `CallKit`.
- ❌ Non sincronizza i dati tra dispositivi (è offline-first by design).
  Per spostare i dati da un dispositivo all'altro: **esporta JSON/CSV → importa**.
- ❌ Non invia notifiche push, non traccia, non profila.

---

## ✦ Installazione su smartphone

### iPhone (Safari)

1. Apri l'URL di PezzaliGuard in **Safari**.
2. Tocca il pulsante **Condividi** (📤 in basso al centro).
3. Scorri fino a **«Aggiungi a schermata Home»**.
4. Conferma. L'app comparirà come icona sulla home screen.

### Android (Chrome/Edge)

1. Apri l'URL in Chrome o Edge.
2. Compare automaticamente il banner **«Installa app»**, oppure
   menù ⋮ → **«Installa app»** / **«Aggiungi a schermata Home»**.
3. Conferma.

Una volta installata, l'app si apre a tutto schermo, senza barra del browser,
e funziona anche **senza connessione internet**.

---

## ✦ Pubblicare su GitHub Pages (gratis, zero costi)

Tutto il progetto è statico: bastano un repository pubblico e GitHub Pages.

### Passo 1 — Crea il repository

```bash
# Sul tuo PC, dentro la cartella del progetto:
git init
git add .
git commit -m "PezzaliGuard initial commit"
git branch -M main
git remote add origin https://github.com/<TUO-UTENTE>/pezzaliguard.git
git push -u origin main
```

### Passo 2 — Abilita GitHub Pages

1. Apri il repository su GitHub.
2. **Settings** → **Pages**.
3. **Source**: scegli `Deploy from a branch`.
4. **Branch**: `main`, cartella `/ (root)`.
5. **Save**.

Dopo qualche secondo l'URL è disponibile a:

```
https://<TUO-UTENTE>.github.io/pezzaliguard/
```

### Passo 3 — Apri quell'URL su smartphone, installa la PWA, fine.

> 💡 Tutti i path dell'app sono **relativi** (`./`, `service-worker.js`,
> `manifest.json`, `icons/...`), quindi funziona sia su un dominio root
> sia in qualsiasi sottocartella di GitHub Pages senza modifiche.

### Custom domain (opzionale)

Se vuoi usare un tuo dominio (`guard.pezzaliapp.it` per esempio):

1. Aggiungi un file `CNAME` con dentro il dominio.
2. Configura un record DNS `CNAME` verso `<TUO-UTENTE>.github.io`.
3. **Settings** → **Pages** → imposta il custom domain.

---

## ✦ Prefissi pericolosi

Quando aggiungi (o modifichi) un numero, l'app analizza il prefisso in tempo
reale e mostra un banner di avviso sotto il campo se il numero rientra in
una di queste categorie:

| Categoria | Severità | Esempi prefissi |
|---|---|---|
| **Truffa Wangiri (estero)** | 🔴 danger | `+255` (Tanzania), `+370` (Lituania), `+371` (Lettonia), `+375` (Bielorussia), `+381` (Serbia), `+563` (Cile) |
| **Numerazione italiana a pagamento** | 🟡 warning | `+39 899`, `+39 144`, `+39 166` |
| **Marketing AGCom** (delibera 21/26/CIR) | 🔵 info | *In attesa della pubblicazione ufficiale dei prefissi* |

L'elenco completo è consultabile in **Strumenti → Prefissi pericolosi**.

### Estendere la lista

Tutto vive in `community-lists/prefix-warnings.json`. Puoi:

- aggiungere nuovi prefissi nella sezione `prefixes`
- creare nuove categorie in `categories` (con `severity: danger | warning | info`)
- popolare `agcom-marketing` quando AGCom pubblicherà i prefissi a 3 cifre

Il matcher è **greedy**: se hai sia `+39` che `+39 899`, vince il più lungo.
Il formato del prefisso è cosmetico (`+39 899` o `+39899` sono equivalenti):
prima del confronto viene normalizzato in cifre.

---

## ✦ Liste community

PezzaliGuard può importare con un click database pubblici di numeri spam.
Apri **Strumenti → Liste community** per vedere le liste disponibili.

Sono di due tipi:

- **Locali (badge "Locale")** — incluse nel pacchetto, scaricate insieme alla
  PWA, importabili anche offline. Esempio: la *Lista italiana curata* con i
  numeri pubblicamente segnalati come truffe (segnalazioni Unione Consumatori,
  Cesvol, Polizia Postale).
- **Remote (badge "CDN")** — scaricate al volo da CDN pubblici (jsDelivr) che
  servono repository GitHub open-source. Servono internet e una conferma
  esplicita prima del download (per privacy: il tuo IP è visibile al CDN).

Tutte le liste vengono **unite** ai tuoi numeri (duplicati aggiornati, niente
viene cancellato). I dati restano sempre solo sul tuo dispositivo: dopo il
download, la lista vive in `localStorage` come tutti gli altri numeri.

### Aggiungere una nuova lista

Modifica `community-lists/index.json` aggiungendo una voce:

```json
{
  "id": "mia-lista",
  "name": "La mia lista",
  "description": "Cosa contiene",
  "source": "github.com/mio-utente/mio-repo",
  "url": "https://cdn.jsdelivr.net/gh/mio-utente/mio-repo@main/lista.csv",
  "format": "csv-numbers-only",
  "default_action": "identify",
  "category": "italia",
  "size_hint": "~100 numeri",
  "external": true,
  "warning": "Avviso privacy mostrato all'utente prima del download"
}
```

Formati supportati:

- `pezzaliguard-json` — JSON con la stessa struttura di `spam-numbers.json`
- `csv` — CSV con header `number,label,action,notes` (come `import.example.csv`)
- `csv-numbers-only` / `txt` — un numero per riga, righe che iniziano con
  `#` o `//` ignorate, virgola o punto-e-virgola separano numero da commento

---

## ✦ Privacy

PezzaliGuard è progettata con privacy by design.

| Cosa | Risposta |
|---|---|
| Dove sono i miei dati? | Solo nel browser, in `localStorage`, sul tuo dispositivo. |
| Server / cloud? | **Nessuno.** L'app è statica. |
| Account? | **Nessuno.** Niente login, niente email. |
| Tracking / analytics? | **Nessuno.** |
| Cookie? | **Nessuno.** L'app non legge né scrive cookie. |
| API esterne? | Solo Google Fonts (caching offline via service worker). Funziona anche senza internet. |
| Chi vede i miei numeri? | Solo tu, dal tuo dispositivo. |

> Vuoi un **backup**? Tools → Esporta JSON. Salvalo dove vuoi (iCloud Drive,
> Drive, USB, mail a te stesso). Per ripristinarlo: Tools → Importa JSON.
>
> Cancellando i dati del browser per il sito di PezzaliGuard si cancella
> tutto il database. Tieni un export.

---

## ✦ Schema dati

### Formato JSON di export — `spam-numbers.json`

Questo è **il formato cardine**: è quello che la futura app iOS nativa
leggerà per popolare la propria *Call Directory Extension*.

```json
{
  "version": "1.0.0",
  "updated": "2025-01-15",
  "identify": [
    { "number": 390212345678, "label": "SPAM - Telemarketing" }
  ],
  "block": [
    390298765432
  ],
  "whitelist": [
    { "number": 393331234567, "label": "Cliente" }
  ]
}
```

**Convenzioni:**

- `number`: numero in formato E.164 **senza `+`**, come intero JSON.
  Per l'Italia: `39` + numero locale (es. `0212345678` → `390212345678`).
- `identify`: numeri che vengono **etichettati** in chiamata
  (l'utente vede l'etichetta ma può rispondere).
- `block`: numeri da **rifiutare automaticamente**.
- `whitelist`: numeri sicuri, che la futura app iOS deve **escludere**
  da blocco/identificazione anche se per errore comparissero altrove.

### Formato CSV di import — `import.csv`

Header obbligatorio (puoi importare anche senza header,
in quel caso le colonne devono essere in quest'ordine):

```csv
number,label,action,notes
+39 02 1234 5678,SPAM - Telemarketing,identify,Operatore finto Enel
+39 02 9876 5432,Truffa,block,
+39 333 1234567,Cliente,whitelist,Mario Rossi
```

- `action` accetta: `identify`, `block`, `whitelist`.
- Il `number` viene normalizzato automaticamente:
  spazi/trattini/parentesi vengono rimossi, e se manca il prefisso
  internazionale viene assunto **+39**.

I file `spam-numbers.example.json` e `import.example.csv` nel repository
sono pronti da provare.

---

## ✦ Come la futura app iOS nativa userà questo JSON

iOS espone due framework specifici per gestire chiamate spam:

- **`CallKit`** — riconosce un numero in arrivo e mostra un'etichetta personalizzata.
- **`Call Directory Extension`** — un'estensione che fornisce al sistema
  una lista di numeri da **bloccare** e una lista da **identificare**, in formato
  ordinato e numerico.

Una possibile pipeline (lato app iOS nativa):

```
spam-numbers.json   ──▶  parse JSON
                          │
                          ├──▶  block[]    →  CXCallDirectoryManager.addBlockingEntry(withNextSequentialPhoneNumber:)
                          │
                          ├──▶  identify[] →  CXCallDirectoryManager.addIdentificationEntry(withNextSequentialPhoneNumber:label:)
                          │
                          └──▶  whitelist[] è applicata come filtro: nessun blocco né identificazione per questi numeri.
```

**Vincoli iOS importanti** che la PWA aiuta a rispettare:

- Le entry passate a `Call Directory Extension` devono essere **ordinate
  numericamente in modo crescente**. PezzaliGuard memorizza i numeri come
  digit-only proprio per facilitare il sort lato nativo.
- I numeri devono essere `CXCallDirectoryPhoneNumber` (in pratica: `Int64`).
  Per questo l'export JSON usa il numero come intero.
- La *whitelist* non è una primitiva iOS: la futura app dovrà semplicemente
  **non aggiungere** quei numeri a block/identify, anche se un altro import
  li contenesse.

In altre parole: la PWA è il **CMS dei tuoi numeri**, l'app nativa è il
**runtime** che li applica al sistema operativo.

---

## ✦ Struttura del progetto

```
pezzaliguard/
├── index.html                  ← markup principale, mobile-first
├── style.css                   ← tema scuro, layout responsive, bottom nav
├── app.js                      ← tutta la logica (storage, CRUD, import/export)
├── manifest.json               ← manifest PWA (relative paths)
├── service-worker.js           ← cache offline, network-first per HTML
├── README.md                   ← questo file
├── spam-numbers.example.json   ← esempio del formato di export
├── import.example.csv          ← esempio del formato di import
├── icons/
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable.png       ← per Android adaptive icons
│   └── apple-touch-icon.png
└── community-lists/
    ├── index.json              ← directory delle liste disponibili
    ├── italia-spam.json        ← lista italiana curata (locale)
    └── prefix-warnings.json    ← prefissi pericolosi + struttura AGCom
```

Nessuna dipendenza npm. Nessun build step. Push e funziona.

---

## ✦ Sviluppo locale

Serve un piccolo server statico (i service worker non funzionano da `file://`):

```bash
# Python 3
cd pezzaliguard
python -m http.server 8080

# oppure con Node
npx serve .
```

Poi apri `http://localhost:8080`.

Per testare il comportamento offline: DevTools → **Application** → **Service
Workers** → spunta «Offline» e ricarica. La PWA deve continuare a funzionare.

---

## ✦ Licenza & note

Progetto personale di gestione database — non è un servizio anti-spam
generalista, non si sostituisce a soluzioni native del sistema operativo,
non promette risultati di blocco reali finché non viene affiancato a
un'app iOS nativa con CallKit.

---

**Autore**: Alessandro Pezzali — parte del progetto **PezzaliApp**
🔗 [alessandropezzali.it](https://alessandropezzali.it) · [pezzaliapp.com](https://pezzaliapp.com)

Made with ❤️ in Italia — privacy first.
