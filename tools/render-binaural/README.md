# Render binauralny — utrwalanie przestrzeni do pliku

Zestaw narzędzi, który bierze graf audio aplikacji **Przestrzeń Relaksu** i zapisuje
jego wynik jako stały plik stereo binauralny — z podsłuchem na żywo do strojenia parametrów.

## Po co to istnieje

Aplikacja składa przestrzeń **w czasie rzeczywistym, w przeglądarce słuchacza**:
głos idzie przez panner `equalpower`, obiekty punktowe przez `PannerNode` z modelem
`HRTF`, całość przez wspólny `ConvolverNode`. Dzięki temu plik lektorski może być
mono — jest lżejszy, a przestrzeń i tak powstaje po stronie odtwarzania.

Ma to jednak konsekwencję: **pliki źródłowe nie niosą przestrzenności**. Kto otworzy
`assets/audio/voice/oddech-w-ciele.webm` w dowolnym odtwarzaczu, zobaczy jeden kanał.
Do dokumentacji projektu — i do każdego zastosowania, w którym liczy się plik, a nie
aplikacja — potrzebne jest utrwalenie: ten sam graf, ale policzony offline i zapisany
jako stereo.

To nie jest nowy materiał. To eksport istniejącego dzieła, tak jak zbicie miksu
z sesji DAW do pliku.

## Trzy narzędzia

| Plik | Do czego |
|---|---|
| `editor.html` | **strojenie uchem** — suwaki wszystkich parametrów, podsłuch na żywo, radar 3D |
| `render.html` | prosty render z gotowych presetów, jeden przycisk na pozycję |
| `render-batch.mjs` | render wsadowy bez klikania + serwer HTTP z obsługą Range |

Wspólny rdzeń siedzi w `render-core.js` — **graf audio budują te same funkcje
w podsłuchu i w renderze**, więc nie mogą się rozjechać.

## Uruchomienie

```bash
node tools/render-binaural/render-batch.mjs --serve
```

Podnosi serwer na porcie 8123 i wypisuje adresy edytora, renderu i samej aplikacji.

Tryb `--serve` **nie wymaga żadnych zależności** — działa na czystym Node. Playwright
jest potrzebny dopiero do renderu wsadowego i ładuje się dopiero wtedy.

**Dlaczego nie `python3 -m http.server`:** ten serwer nie obsługuje nagłówka `Range`,
a bez niego element `<audio>` nie przewija. Podsłuch w edytorze wystartuje wtedy zawsze
od zera, zamiast od wybranej sekundy. Serwer w `render-batch.mjs` obsługuje Range.

## Edytor

Strojenie dry/wet i poziomów wzrokiem nie ma sensu — trzeba je słyszeć. Edytor daje
podsłuch tym samym grafem, który potem policzy render, więc to, co słychać, trafia
do pliku.

**Co się stroi na żywo, bez restartu:** master, dry, wet, długość i zanikanie pogłosu,
głośność i pozycja głosu, głośność sceny, pozycje i głośności obiektów.

**Co wymaga restartu podsłuchu:** zmiana sceny, dodanie lub usunięcie obiektu, zmiana
medytacji. To zmiany topologii grafu, nie parametrów.

**Radar** działa jak ten w aplikacji: 0° to przód, kąt rośnie zgodnie z ruchem wskazówek,
promień to odległość w skali 0–100 m. Przeciągnięcie obiektu zmienia azymut i odległość;
elewację i głośność ustawia się suwakami po wybraniu obiektu.

**Podsłuch startuje od sekundy podanej w polu „start od"** — przy medytacji sensowne
miejsce to okolice drugiej minuty, gdzie słychać jednocześnie mowę i tło. Renderowanie
całej medytacji tylko po to, żeby sprawdzić poziom pogłosu, jest stratą czasu; od tego
jest przycisk **Render fragmentu (20 s)**, który liczy dokładnie ten wycinek, od którego
gra podsłuch.

### Zapis ustawień

Edytor nie zapisuje bezpośrednio do `presets.json` — File System Access API działa
w Chrome i Edge, ale nie w Firefoksie ani Safari. Zamiast tego **Pobierz presets.json**
zrzuca komplet ustawień do pliku, który podmieniasz w `tools/render-binaural/`.
Wtedy tryb wsadowy wyrenderuje dokładnie to, co słyszałeś, a zmiana wyląduje w gicie
jako normalny commit.

## Render wsadowy

```bash
npm i -D playwright && npx playwright install chromium

node tools/render-binaural/render-batch.mjs --out ./_render
node tools/render-binaural/render-batch.mjs --out ./_render --only body-scan
```

Zapisuje pliki WAV i `_render-report.json` z długościami oraz rozmiarami.

## Powtarzalność

W aplikacji odpowiedź impulsowa pogłosu powstaje z `Math.random()` — przy każdym
uruchomieniu jest inna. Tutaj generuje ją deterministyczny PRNG (mulberry32) z ziarnem
zapisanym w `presets.json` jako `irSeed`. Render przestaje więc być jednorazowym zdarzeniem.

Zakres tej powtarzalności ma jednak granicę, o której trzeba wiedzieć:

| Warunki | Wynik |
|---|---|
| ten sam silnik, ta sama maszyna | **plik identyczny co do bitu** (zweryfikowane sumami kontrolnymi) |
| inny silnik lub inna wersja przeglądarki | ta sama treść i długość, **inny przebieg próbek** |

Drugi przypadek to nie błąd narzędzia. `PannerNode` z modelem `HRTF`, `ConvolverNode`
i dekoder Opusa są częścią przeglądarki, a ich implementacje różnią się między wydaniami
i systemami. Render z desktopowego Chrome i render z headless Chromium dają materiał
brzmiący tak samo, ale nie ten sam plik — sprawdzone bezpośrednio na tym projekcie.

**Praktyczny wniosek:** jeśli zależy Ci na bitowej zgodności zestawu, wyrenderuj wszystkie
pozycje w jednym środowisku i zanotuj, w jakim. Jeśli wystarczy odtwarzalność procedury —
`presets.json` plus plik `*_META.txt` wystarczą, żeby każdy mógł render powtórzyć.

Strojenie suwakami **nie zmienia** `irSeed`. Jeśli świadomie chcesz inny wzór pogłosu,
zmień tę wartość ręcznie w pobranym `presets.json`.

## Metadane

Przycisk **Render pełny + META** zapisuje obok pliku audio `*_META.txt` z kompletem
użytych parametrów — w formacie zgodnym z `SAL_SCENA_*_META.txt` ze scenografii
dźwiękowych. Zamyka to koło dowodowe: preset → render → metadane → i z powrotem.

## Presety

Każdy preset w `presets.json` opisuje jeden plik wynikowy: ścieżkę głosu z pozycją
i głośnością, scenę tła, listę obiektów 3D (azymut / elewacja / odległość / głośność)
oraz ziarno pogłosu. Sekcja `engine` trzyma parametry wspólne. Listy scen i obiektów
do wyboru edytor czyta z `manifest.json` aplikacji, więc nie trzeba ich duplikować.

## Format wyjściowy

WAV, stereo, 48 kHz, PCM 24-bit. Do publikacji warto przekodować na Opus:

```bash
ffmpeg -i SAL_RELAX_01_Binauralny.wav -c:a libopus -b:a 128k -vbr on SAL_RELAX_01_Binauralny.opus
```

## Odsłuch

**Tylko na słuchawkach.** Efekt binauralny opiera się na różnicy między kanałami
i na filtracji HRTF — na głośnikach obie te informacje się mieszają i przestrzeń znika.

---

Sfinansowano ze środków Krajowego Planu Odbudowy i Zwiększania Odporności,
inwestycja A2.5.1 — program stypendialny NIMIT.
Umowa nr **143/KPO.STYPENDIA/NIMIT/2025**.
