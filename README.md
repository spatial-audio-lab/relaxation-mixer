# Przestrzeń Relaksu

**Binauralny mikser relaksacyjny z dźwiękiem przestrzennym 3D**

Aplikacja webowa łącząca prowadzone medytacje z binauralnymi krajobrazami dźwiękowymi
i punktowymi źródłami audio rozstawianymi wokół słuchacza. Część ekosystemu narzędzi
**Spatial Audio Lab**, zbudowana zgodnie z *SAL Design Manifest v3.0*.

**Na żywo:** https://spatial-audio-lab.github.io/relaxation-mixer/

> **Wymaga słuchawek.** Cały efekt przestrzenny opiera się na różnicy między kanałami —
> na głośnikach zniknie.

---

## 1. Funkcje

### Medytacje prowadzone
- Biblioteka trzypoziomowa: temat → podtemat → sesja, ładowana z `manifest.json`.
- Panoramowanie głosu (lewa / środek / prawa) modelem `equalpower` — bez zabarwiania barwy mowy.
- Przewijanie suwakiem, klawiaturą (±5 s / ±30 s / Home / End) i przyciskami ±15 s.
- **Wznawianie od zapamiętanej pozycji** — sekcja „Kontynuuj" pokazuje, ile zostało.
- **Media Session API**: tytuł, wykonawca i okładka na ekranie blokady, reakcja
  na przycisk pauzy na słuchawkach i sterowanie z Centrum sterowania.

### Mikser tła
- Sceny ambientowe (binauralne stereo), płynny crossfade, głośność per scena.
- Punktowe dźwięki 3D z pełnym HRTF: azymut, elewacja i odległość ustawiane na radarze
  albo w arkuszu edycji pozycji. Twardy limit 5 jednoczesnych panerów.
- Timer usypiania z gongiem początku i końca.

### Oznakowanie i dostępność
- Moduł logotypów KPO / UE na ekranie powitalnym i w modalu „O projekcie".
- Cele dotykowe ≥ 44 px, widoczny fokus klawiatury, `role="slider"` na pasku postępu
  z `aria-valuetext` podającym czas, pełna obsługa `prefers-reduced-motion`, zoom niezablokowany.

---

## 2. Architektura audio

Graf jest wspólny dla wszystkich źródeł:

```
głos ──┐
       ├─→ spatialBus ─┬─→ dryGain ──────────────────┐
obiekty┘               └─→ reverbSend → convolver → wetGain ─┤
                                                             ├─→ masterGain → destination
sceny ─────────────────→ ambientBus ─────────────────────────┘
```

**Materiały długie są strumieniowane, nie dekodowane.** Głos (3–13 min) i sceny (6–12 min)
idą przez `<audio>` + `createMediaElementSource()`. Wcześniejsze `decodeAudioData()`
trzymało w pamięci nieskompresowany float32 — 13-minutowy plik to ~307 MB, scena ~285 MB —
i wymagało pobrania całego pliku przed pierwszym dźwiękiem.

Zmierzone (Chromium, serwer lokalny z obsługą Range): **od kliknięcia medytacji do gotowego
odtwarzacza 7,2 s → 0,14 s**.

Krótsze obiekty 3D zostają na `AudioBuffer`, bo tylko `AudioBufferSourceNode` zapętla
próbkowo dokładnie — pętla na elemencie `<audio>` ma słyszalny szew. Ich bufory są
zwalniane przy wyłączeniu dźwięku.

Głos używa panera `equalpower`, obiekty tła — `HRTF`. Na urządzeniach z ≤ 4 rdzeniami
obiekty też schodzą na `equalpower` (tryb oszczędny wykrywany przez `hardwareConcurrency`).

---

## 3. Struktura projektu

```
relaxation-mixer/
├── index.html          # struktura widoków
├── styles.css          # style (tokeny SAL Design Manifest v3.0)
├── script.js           # logika: audio, biblioteka, UI, radar 3D
├── manifest.json       # BIBLIOTEKA — tu dodaje się treści, nie w kodzie
├── app.webmanifest     # MANIFEST APLIKACJI (PWA) — to co innego niż powyższy
├── favicon.svg
├── favicon.ico
├── LICENSE
└── assets/
    ├── audio/
    │   ├── voice/      # medytacje prowadzone
    │   ├── scenes/     # sceny tła (binauralne stereo)
    │   ├── objects/    # punktowe źródła 3D (mono)
    │   └── timer/      # gongi startu i końca timera
    ├── brand/          # ikony (wspólny pakiet marki Spatial Audio Lab)
    ├── covers/         # okładki sesji (.webp)
    ├── kpo-belka.jpg   # moduł logotypów KPO / UE
    └── logo-cutout.png
```

**Dwa pliki o mylnie podobnych nazwach**: `manifest.json` to biblioteka medytacji
(treść aplikacji), a `app.webmanifest` to manifest instalacyjny PWA (nazwa, kolory, ikony).
Nie mylić przy edycji.

### Instalacja na ekranie głównym

Aplikacja jest instalowalna: `app.webmanifest` + pakiet ikon dają właściwą ikonę, nazwę
i uruchamianie na pełnym ekranie (`display: standalone`), zamiast pustego kwadratu
i paska przeglądarki. Ikony: 192 i 512 px `purpose: any` (pełne pole, ostre krawędzie
zgodnie z manifestem) oraz 512 px `purpose: maskable` z zapasem na przycięcie do koła
lub squircle'a przez Androida.

**Aplikacja nie działa offline** — nie ma service workera. Instalacja daje wygodę
uruchamiania, nie tryb samolotowy.

`scope` to katalog aplikacji, więc przycisk `← Hub` wychodzi poza zakres i otwiera Hub
w przeglądarce — celowo, bo Hub jest osobnym miejscem, nie ekranem tej aplikacji.

---

## 4. Dodawanie treści

Cała biblioteka pochodzi z `manifest.json` — **kodu nie trzeba dotykać.**

```json
{
  "id": "nowa-sesja",
  "title": "Nowa sesja",
  "author": "Oskar Hamerski",
  "group": "Mindfulness",
  "subgroup": "Oddech",
  "duration": "12 MIN",
  "description": "Krótki opis widoczny w odtwarzaczu",
  "cover": "assets/covers/nowa-sesja.webp",
  "src": { "webm": "assets/audio/voice/nowa-sesja.webm",
           "mp3":  "assets/audio/voice/nowa-sesja.mp3" }
}
```

- `src.webm` jest podstawowy, `src.mp3` to zapas — aplikacja próbuje ich po kolei.
  Jeśli pliku MP3 nie ma, pole `mp3` należy pominąć.
- Wpis z `"_demo": true` **nie jest renderowany** — to szablon do podmiany.
  Grupy, które przez to zostaną puste, znikają z biblioteki same.
- Grupy i ich kolejność definiuje tablica `meditationGroups`.

### Wymagania materiału

| Katalog | Kanały | Uwagi |
|---|---|---|
| `voice/` | mono lub stereo | panoramowanie nakłada aplikacja |
| `scenes/` | **stereo binauralne** | musi się zapętlać płynnie |
| `objects/` | **mono** | HRTF nakłada aplikacja; musi się zapętlać płynnie |
| `timer/` | stereo | `start` i `end`, po kilka sekund |

Format podstawowy: **WebM / Opus** (mniejszy plik przy tej samej jakości).
Fallback MP3 jest opcjonalny; jeśli jest, wystarczy 96–128 kbps.

---

## 5. Uruchomienie lokalne

Aplikacja to statyczne pliki — potrzebny jest tylko serwer HTTP
(otwarcie przez `file://` zablokuje `fetch` manifestu).

```bash
python3 -m http.server 8000     # albo: npx serve .
```

Serwer powinien obsługiwać nagłówek `Range` — bez tego `<audio>` nie przewija.
`http.server` i `serve` to potrafią.

---

## 6. Technologie

- HTML5 + CSS3 + JavaScript (vanilla, bez frameworków i bez kroku budowania)
- Web Audio API: `AudioContext`, `PannerNode` (HRTF / equalpower), `ConvolverNode`,
  `MediaElementAudioSourceNode`
- Media Session API
- Canvas 2D — radar przestrzenny
- Fonty: **Lexend** (interfejs) i **Azeret Mono** (etykiety, dane) z Google Fonts

---

## 7. Zgodność

| Przeglądarka | Wsparcie |
|---|---|
| Chrome / Edge 79+ | pełne |
| Firefox 61+ | pełne (Media Session częściowo) |
| Safari 14.1+ | pełne |
| Mobile Safari (iOS 15+) | pełne — WebM/Opus w Web Audio od iOS 15 |

---

## 8. O projekcie

![Baner SAL](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/assets/brand/SAL_og-image.png)

# Spatial Audio Lab: archiwum VR dla edukacji teatralnej
„Spatial Audio Lab” to projekt stypendialny skupiony na tworzeniu profesjonalnego archiwum dźwięku przestrzennego. W ramach działań powstaje baza nagrań w technologii Virtual Reality (VR), która łączy nowoczesną inżynierię dźwięku z edukacją teatralną i technikami uważności (mindfulness).

[https://spatial-audio-lab.github.io/](https://spatial-audio-lab.github.io/)

---

## 9. Finansowanie

![Zestawienie logotypów KPO, RP i UE](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/KPO.jpg)

## Informacja o finansowaniu

Projekt jest realizowany w ramach programu stypendialnego Krajowego Planu Odbudowy i Zwiększania Odporności (KPO).

- **Program:** Inwestycja A2.5.1: Program wspierania działalności podmiotów sektora kultury i przemysłów kreatywnych na rzecz stymulowania ich rozwoju.
- **Instytucja Wspierająca:** Narodowy Instytut Muzyki i Tańca (NIMiT).
- **Wartość dofinansowania z Unii Europejskiej (NextGenerationEU):** 36 000,00 zł brutto.
- Umowa nr **143/KPO.STYPENDIA/NIMIT/2025**.



---
## 9. Licencja

MIT — szczegóły w pliku [LICENSE](LICENSE).
