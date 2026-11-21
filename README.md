# Sprzedaż miejsc – Duża Scena (na żywo)

Strona z planem sali. Kilka osób w różnych miejscach zaznacza sprzedane miejsca,
a wszyscy widzą zmiany natychmiast (bez odświeżania).

- Klik w wolne miejsce → **sprzedane** (z przyciskiem „Cofnij” przez kilka sekund).
- Klik w sprzedane miejsce → informacja kto i kiedy sprzedał + możliwość zwolnienia (zwrot).
- Dwie osoby klikną to samo miejsce w tej samej chwili → dostanie je tylko jedna,
  druga zobaczy komunikat „zostało właśnie sprzedane przez kogoś innego”
  (transakcja w bazie + reguła bazy blokująca nadpisanie).
- Licznik wolnych miejsc ogółem i w każdej strefie, lista „kto ile sprzedał”, historia zmian.
- Brak internetu → czerwony komunikat i zablokowana mapa (żeby nikt nie sprzedawał „na ślepo”).
- Eksport do CSV (otwiera się w Excelu).

Koszt: **0 zł** (Firebase – darmowy plan Spark, GitHub Pages – darmowe).

---

## Konfiguracja (ok. 15 minut, jednorazowo)

### 1. Baza danych – Firebase
1. Wejdź na <https://console.firebase.google.com> → **Add project** (np. `bilety-opera`), Google Analytics można wyłączyć.
2. W menu: **Build → Realtime Database → Create database** → lokalizacja **europe-west1 (Belgia)** → „Start in **locked mode**”.
3. Zakładka **Rules** → wklej zawartość pliku `database.rules.json` → **Publish**.
4. Ikona koła zębatego → **Project settings** → sekcja „Your apps” → ikona **`</>`** (Web) → nadaj nazwę → **Register app**.
5. Skopiuj pokazany obiekt `firebaseConfig` i wklej go do pliku `config.js` zamiast `null`
   (upewnij się, że zawiera `databaseURL`).

### 2. Hosting – GitHub Pages
1. Utwórz repozytorium na GitHubie (może być prywatne tylko na płatnym planie – publiczne jest OK,
   bo w kodzie nie ma żadnych sekretów; dane są w Firebase).
2. Wgraj wszystkie pliki z tego folderu.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save.
4. Po minucie strona będzie pod adresem `https://TWOJ-LOGIN.github.io/NAZWA-REPO/`.

(Alternatywa bez GitHuba: <https://app.netlify.com/drop> – przeciągasz folder i gotowe.)

### 3. Link dla sprzedających
Każde wydarzenie/spektakl ma własny **klucz** w linku (min. 8 znaków, najlepiej z losową końcówką,
żeby nikt obcy go nie zgadł):

```
https://TWOJ-LOGIN.github.io/NAZWA-REPO/?e=gala-2026-12-31-k7x9p2
```

Ten link wysyłasz osobom sprzedającym. Każda przy pierwszym wejściu wpisuje swoje imię / punkt sprzedaży.
Na kolejny spektakl – nowy klucz = pusta sala.

> Uwaga: kto ma link, ten może zaznaczać miejsca. Nie publikuj go publicznie.

---

## Test bez Firebase
Dopóki w `config.js` jest `null`, strona działa w **trybie demo** (dane tylko w jednej przeglądarce,
synchronizacja między kartami). Lokalnie: `python3 -m http.server` w tym folderze i wejdź na
<http://localhost:8000>. Uwaga: plików nie da się otworzyć podwójnym kliknięciem (moduły JS wymagają serwera).

## Poprawianie układu sali
Liczby miejsc w rzędach zostały **odczytane z grafiki planu** – przed sprzedażą porównaj je z oficjalnym
planem. Wszystko jest w `layout.js`, np.:

```js
[5, '1-26', 2],            // rząd 5: miejsca 1–26, Strefa II
[14, '1-7,_6,8-15', 3],    // rząd 14: 1–7, przerwa na konsoletę (6 pozycji), 8–15
```

Zmiana strefy (ceny) = zmiana ostatniej liczby (1–4).

## Awaryjnie
- Ręczne poprawki / wyczyszczenie sali: konsola Firebase → Realtime Database → `events/<klucz>`.
- Kopia stanu: przycisk „Pobierz listę miejsc (CSV)”.
