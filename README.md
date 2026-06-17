# 🎧 Przestrzeń Relaksu

**Binauralny mikser relaksacyjny z przestrzennym audio 3D**

Immersyjna aplikacja webowa łącząca prowadzone medytacje z binauralnymi krajobrazami dźwiękowymi i przestrzennie pozycjonowanymi obiektami audio. 
Zaprojektowana w estetyce *Ambient Morphism* — płynnych gradientów, glassmorphizmu i organicznych animacji.

https://sanefungus.github.io/relaxation-mixer/
---

## ✨ Funkcjonalności

### 🧘 Sesje Głosowe
- 5 prowadzonych medytacji z pozycjonowaniem HRTF
- Kontrola Play/Pause/Stop z pamięcią pozycji
- Przestrzenne rozmieszczenie głosu (Lewa/Środek/Prawa)
- Możliwość wyłączenia efektu 3D

### 🌍 Sceny Binauralne
- 4 gotowe krajobrazy dźwiękowe (stereo binaural)
- Płynne crossfade między scenami
- Indywidualna kontrola głośności per scena
- Pętlone odtwarzanie w tle

### 🔮 Obiekty Dźwiękowe 3D
- 4 punktowe źródła z pełnym HRTF
- Możliwość włączenia wielu obiektów jednocześnie
- Przestrzenne pozycjonowanie każdego obiektu (L/C/R)
- Indywidualna kontrola głośności

### 🎨 Interfejs Ambient Morphism
- Animowane tło Aurora z pływającymi orbami
- Panele glassmorphism z rozmyciem tła
- Efekt "oddychania" podczas odtwarzania
- Pełna responsywność (mobile-first)
- Wsparcie dla `prefers-reduced-motion`

### ♿ Dostępność (WCAG 2.1 AA)
- Pełna nawigacja klawiaturą
- Atrybuty ARIA dla czytników ekranu
- Widoczne wskaźniki focusu
- Komunikaty aria-live

---

## 🛠️ Technologie

- **HTML5** — Semantyczna struktura
- **CSS3** — Animacje, glassmorphism, CSS variables
- **JavaScript** — Vanilla JS, bez frameworków
- **Web Audio API** — AudioContext, HRTF PannerNode
- **Google Fonts** — Outfit, DM Sans, JetBrains Mono

---

## 🚀 Instalacja

### 1. Sklonuj repozytorium

```bash
git clone https://github.com/YOUR_USERNAME/przestrzen-relaksu.git
cd przestrzen-relaksu
```

### 2. Dodaj pliki audio

Umieść pliki MP3 w odpowiedniej strukturze katalogów:

```
assets/audio/
├── voice/
│   ├── body-scan.mp3          # Podróż przez Ciało
│   ├── breath-sitting.mp3     # Spokojny Oddech
│   ├── sounds-thoughts.mp3    # Przestrzeń Myśli
│   ├── relaxation.mp3         # Głębokie Rozluźnienie
│   └── visualization.mp3      # Wewnętrzna Podróż
├── scenes/
│   ├── beach.mp3              # Plaża o Zmierzchu (stereo binaural)
│   ├── mountain-meadow.mp3    # Górska Polana (stereo binaural)
│   ├── summer-forest.mp3      # Letni Las (stereo binaural)
│   └── night-cicadas.mp3      # Nocne Cykady (stereo binaural)
└── objects/
    ├── bell.mp3               # Tybetańska Misa (mono)
    ├── clock.mp3              # Stary Zegar (mono)
    ├── blackbird.mp3          # Śpiew Kosa (mono)
    └── stream.mp3             # Leśny Strumień (mono)
```

> **Uwaga:** Sceny powinny być stereo (już binauralne), obiekty mono (HRTF nakładany przez aplikację).

### 3. Uruchom lokalnie

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

Otwórz `http://localhost:8000` w przeglądarce.

### 4. Wdróż na GitHub Pages

```bash
git add .
git commit -m "Initial commit: Przestrzeń Relaksu"
git push origin main
```

W ustawieniach repozytorium: **Settings → Pages → Source: main branch**

Aplikacja będzie dostępna pod: `https://YOUR_USERNAME.github.io/przestrzen-relaksu/`

---

## 🎧 Wymagania Audio

### Sesje głosowe (voice/)
- Format: MP3 (zalecane 128-192 kbps)
- Kanały: Mono lub Stereo
- Długość: 10-40 minut

### Sceny (scenes/)
- Format: MP3 (zalecane 192-256 kbps)
- Kanały: **Stereo binaural** (nagrane z dummy head lub przetworzone)
- Typ: Loopowalne (płynne przejście końca w początek)

### Obiekty 3D (objects/)
- Format: MP3 (zalecane 128 kbps)
- Kanały: **Mono** (HRTF nakładany przez Web Audio API)
- Typ: Loopowalne

---

## 📱 Kompatybilność

| Przeglądarka | Wsparcie |
|--------------|----------|
| Chrome 66+ | ✅ Pełne |
| Firefox 61+ | ✅ Pełne |
| Safari 14.1+ | ✅ Pełne |
| Edge 79+ | ✅ Pełne |
| Mobile Chrome | ✅ Pełne |
| Mobile Safari | ✅ Pełne |

> **Ważne:** Dla najlepszego efektu przestrzennego używaj słuchawek.

---

## 🎨 Personalizacja

### Zmiana kolorów

Edytuj zmienne CSS w sekcji `:root`:

```css
:root {
  --deep-void: #0a0e14;      /* Tło główne */
  --surface: #121820;         /* Karty, panele */
  --cyan-glow: #32b8c6;       /* Akcent główny */
  --magenta-pulse: #c850a0;   /* Akcent sekundarny */
}
```

### Dodawanie nowych sesji/scen/obiektów

Rozszerz obiekt `CONFIG` w sekcji JavaScript:

```javascript
const CONFIG = {
  sessions: [
    // Dodaj nową sesję:
    { 
      id: 'new-session', 
      name: 'Nowa Sesja', 
      icon: '🌸', 
      file: 'assets/audio/voice/new-session.mp3',
      description: 'Opis nowej sesji'
    },
    // ...
  ],
  // Analogicznie dla scenes i objects
};
```

---

## 📄 Struktura Projektu

```
przestrzen-relaksu/
├── index.html          # Kompletna aplikacja (single file)
├── README.md           # Dokumentacja
├── LICENSE             # Licencja MIT
├── preview.png         # Screenshot do README
└── assets/
    └── audio/
        ├── voice/      # Sesje medytacji
        ├── scenes/     # Krajobrazy binauralne
        └── objects/    # Obiekty 3D
```

---

## 🙏 Podziękowania

Projekt stworzony z wykorzystaniem metodologii **Digital Art Project** — procesu łączącego wiedzę z historii sztuki cyfrowej z nowoczesnymi technikami webowymi.

### Zespół Wirtualnych Specjalistów
- **Olaf Dietrich Webart** — Koncepcja artystyczna
- **Maya Interaction** — Architektura UX
- **Viktor Visuelle** — System wizualny UI
- **Coda Craft** — Implementacja front-end
- **Lydia Content** — Strategia treści
- **Techne Director** — Finalizacja techniczna

---

## 📜 Licencja

MIT License — szczegóły w pliku [LICENSE](LICENSE)

---

## 🔮 Roadmapa

- [ ] Reactive visuals (wizualizacja reagująca na dźwięk)
- [ ] Generative soundscapes (proceduralne dźwięki natury)
- [ ] Biofeedback integration (połączenie z pulsometrem)
- [ ] Full 360° ambisonics
- [ ] PWA z obsługą offline
- [ ] Eksport własnych mixów

---

<p align="center">
  <strong>🎧 Wejdź w ciszę</strong><br>
  <em>Przestrzeń Relaksu — gdzie dźwięki tworzą ciszę</em>
</p>
