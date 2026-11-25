# Pregled projekta RoomFlow

## Implementirane funkcionalnosti MVP

Aplikacija trenutno omogoča pregled konferenčnih sob, kjer so prikazani ime sobe, stavba, nadstropje, kapaciteta in razpoložljiva oprema. Prikazane so samo aktivne sobe.

Uporabnik lahko sobe filtrira glede na stavbo, najmanjšo kapaciteto in opremo. Filtre lahko med seboj kombinira ali jih ponastavi. Če nobena soba ne ustreza izbranim pogojem, se prikaže ustrezno sporočilo.

Implementirano je tudi preverjanje razpoložljivosti sob. Sistem preveri, ali je soba v izbranem terminu že rezervirana oziroma blokirana. Prav tako preveri, ali je izbrani časovni interval veljaven.

Uporabnik lahko ustvari novo rezervacijo, pri čemer sistem pred shranjevanjem ponovno preveri razpoložljivost sobe. Uspešno ustvarjena rezervacija dobi status `CONFIRMED`. Pri ustvarjanju in urejanju rezervacij se uporabljajo transakcije z izolacijo `Serializable`, ob konfliktu pa strežnik vrne napako HTTP 409.

Omogočen je tudi pregled rezervacij testnega uporabnika. Obstoječe rezervacije je mogoče urejati ali preklicati. Pri preklicu se rezervacija ne izbriše iz podatkovne baze, ampak se njen status spremeni v `CANCELLED`, termin pa postane ponovno prost.

Kljub temu vse funkcionalnosti, predvidene za MVP, še niso implementirane. Manjkajo predvsem prijava uporabnikov, preverjanje uporabniških pravic in postopek odobravanja posebnih rezervacij. Prav tako pri urejanju ni mogoče zamenjati sobe, urejanje in preklic pa nista omejena samo na prihodnje rezervacije.

## Pregled uporabniških zgodb

| Uporabniška zgodba | Ocena | Ugotovitve |
|---|---|---|
| **US-01: Prijava v aplikacijo** | Ni izpolnjena | Prijava uporabnikov še ni implementirana. Aplikacija trenutno uporablja testnega uporabnika, določenega z `VITE_TEST_USER_ID`. Prav tako ni povezave s Keycloakom ali preverjanja uporabniških pravic. |
| **US-02: Pregled konferenčnih sob** | Izpolnjena | Uporabnik lahko pregleda vse aktivne konferenčne sobe in njihove podatke. Pri vsaki sobi so prikazani ime, lokacija, kapaciteta in oprema. Sobo lahko tudi neposredno izbere za rezervacijo. |
| **US-03: Filtriranje konferenčnih sob** | Izpolnjena | Filtriranje deluje glede na stavbo, kapaciteto in opremo. Uporabnik lahko uporabi več filtrov hkrati. Trenutno se oprema išče z vnosom besedila, ne pa z izbiro iz seznama. |
| **US-04: Preverjanje razpoložljivosti sobe** | Izpolnjena | Sistem preveri, ali je soba v izbranem terminu prosta. Pri tem upošteva obstoječe potrjene rezervacije in blokirane termine. Če je soba zasedena, uporabnik dobi obvestilo in rezervacije ne more nadaljevati. |
| **US-05: Ustvarjanje rezervacije** | Delno izpolnjena | Uporabnik lahko izbere sobo, termin in vnese namen rezervacije. Sistem preveri razpoložljivost in rezervacijo shrani s statusom CONFIRMED. Manjka pa preverjanje, ali je za določeno rezervacijo potrebna dodatna odobritev. |
