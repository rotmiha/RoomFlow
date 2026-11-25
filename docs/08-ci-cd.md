# CI/CD z GitHub Actions

Workflow je v `.github/workflows/ci-cd.yml`. Zažene se za vsak pull request v
`main` in vsak push na `main`. Spremembe razvijamo v ločenih vejah in združujemo
prek pull requestov. V nastavitvah zaščite `main` naj bodo obvezna preverjanja
`lint`, `build` in `test`.

## Preverjanja

- `lint`: ESLint za React/TypeScript frontend in Node.js/TypeScript backend.
  Napake in opozorila vrnejo neuspešen izhodni status.
- `build`: prevede frontend v `frontend/dist` in backend v `backend/build`.
  Prisma Client se generira pred preverjanjem tipov in prevajanjem backenda.
  Oba rezultata, migracije in opis odvisnosti se shranijo kot artefakti.
  Docker slika vsebuje ta prevedena rezultata; Dockerfile ne prevaja aplikacije.
  CI sliko tudi zažene s pravo PostgreSQL bazo in preveri migracije, demo podatke,
  javno stran in zdravje API, preden jo shrani kot artefakt.
- `test`: Vitest za oba dela aplikacije. Testi API uporabljajo Supertest in
  nadomestek Prisma odjemalca; ne potrebujejo prave baze. Testi frontenda
  uporabljajo Testing Library in jsdom. HTML, LCOV in JSON poročila pokritosti
  se shranijo v artefakt `coverage-reports`, tudi če testi padejo.
- `deploy`: potrebuje uspešne `lint`, `build` in `test`; izvaja se izključno
  ob pushu na `main` v okolju `production`. Prenese artefakt Docker slike,
  ga objavi v GHCR in naroči Renderju namestitev slike istega commita.
  V tem jobu ni prevajanja ali namestitve npm odvisnosti. Job počaka na
  stanje `live` in preveri javni frontend ter `/api/health`, vključno z bazo.

`actions/setup-node` uporablja Node.js 22 in npm cache za oba lock fajla.
Namestitev z `npm ci` preverja skladnost `package.json` in `package-lock.json`.
Gesla niso vključena v artefakte; `DATABASE_URL` v jobu build je samo lokalna
nadomestna vrednost za nalaganje Prisma konfiguracije, povezava se ne vzpostavi.

## Lokalno preverjanje

Uporabi Node.js 22.12 ali novejši iz veje 22.

```sh
cd frontend
npm ci
npm run lint
npm run test:coverage
npm run build
cd ../backend
npm ci
npm run lint
npm run test:coverage
# Nastavi DATABASE_URL na lokalno bazo, kot v README.
npm run build
```

## Render in prvo nameščanje

Render mora izvajati **Existing Image**, ne Git builda. `render.yaml` opisuje
web service in PostgreSQL 16 v isti regiji. Geslo ustvari Render in interno
povezavo prek `fromDatabase` posreduje storitvi kot `DATABASE_URL`.
Zunanje povezave do baze so izključene. Začetna brezplačna konfiguracija je
namenjena demonstraciji; pred uporabo preveri veljavne omejitve in življenjsko
dobo brezplačne baze v [Render dokumentaciji](https://render.com/docs/free).

Za začetno vzpostavitev:

1. Po pregledu združi PR v `main`. Job deploy najprej objavi prevedeno sliko
   v `ghcr.io/rotmiha/roomflow:production`. Če nastavitve Renderja še manjkajo,
   nato jasno sporoči manjkajočo nastavitev in pade.
2. V GitHub profilu odpri **Packages → roomflow → Package settings** in nastavi
   paket kot javen, da ga lahko Render prevzame brez dodatnega registry tokena.
   Druga možnost je zasebni paket z Render registry poverilnico, ki ima
   `read:packages`; ne zapisuj je v `render.yaml`.
3. V Renderju ustvari Blueprint iz `render.yaml`. Začetna namestitev in vse
   nadaljnje namestitve uporabijo že prevedeno sliko. Uporabi brezplačna plana
   iz konfiguracije ali svoj izbrani plan.
4. V GitHub **Settings → Environments → production** dodaj spodnji secrets in
   spremenljivko. Okolje `production` je ustvarjeno neposredno v repozitoriju
   in dovoljuje deployment samo iz veje `main`.
5. Ponovno zaženi neuspešni job deploy. Naslednji pushi na `main` vse izvedejo
   samodejno. Na Renderju ne omogočaj dodatnega deploya ob Git pushu, ki bi
   obšel uspešna preverjanja GitHub Actions.

| Mesto | Ime | Vsebina |
| --- | --- | --- |
| GitHub environment secret | `RENDER_API_KEY` | API ključ Render računa |
| GitHub environment secret | `RENDER_SERVICE_ID` | ID web storitve, npr. `srv-…` |
| GitHub environment variable | `PRODUCTION_URL` | Dejanski javni HTTPS naslov Render storitve |
| Render runtime environment | `DATABASE_URL` | Samodejna interna povezava do Render Postgres |

API ključ se shrani v GitHub environment secret, povezava z geslom baze ostane
v Render runtime secrets. Teh vrednosti ne dodajaj v kodo ali `.env.example`.
GHCR uporablja kratkoživi `GITHUB_TOKEN` z dovoljenjem `packages: write` samo
v jobu deploy. Če spremeniš lastnika repozitorija, posodobi image URL v Blueprintu.

Frontend pridobi URL API iz `VITE_API_URL`; CI ga nastavi na `/api`, ker sta
oba dela na istem javnem naslovu. Za ločeno gostovanje lahko nastaviš repository
variable `PRODUCTION_API_URL` **pred gradnjo**. To je javna nastavitev, ne secret.

Za demonstracijo `SEED_DEMO_DATA=true` po migracijah ustvari stalnega demo
uporabnika in dve sobi z `upsert`, brez brisanja obstoječih rezervacij.
Frontend uporablja isti javni demo UUID. Aplikacija podedovanega projekta še
nima prijave uporabnikov; demonstracijske podatke uporabljaj za preverjanje
rezervacij, ne za dejanske osebne podatke. Pri izklopu demonstracijskih podatkov
nastavi repository variable `PRODUCTION_DEMO_USER_ID` na obstoječega uporabnika.

## Dokaz uspešne namestitve

Odprt PR preveri lint, build in teste; deploy je pri PR pravilno preskočen.
Javno namestitev lahko potrdi šele uspešen deploy po pushu na `main`, skupaj
z dejanskim HTTPS naslovom in uspešnim `/api/health`. Sama prisotnost konfiguracije
še ni dokaz javno dostopne aplikacije.

Dokumentacija: [npm cache](https://github.com/actions/setup-node#caching-global-packages-data),
[Render prebuilt images](https://render.com/docs/deploying-an-image),
[Render Blueprint](https://render.com/docs/blueprint-spec),
[GitHub environment secrets](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
