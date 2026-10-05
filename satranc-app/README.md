# Satranç 2 - Stockfish Entegrasyonu

Web tabanlı satranç oyunu. Rakip, projeye gömülü Stockfish motorudur; oyun
tamamen çevrimdışı çalışır, yalnızca arayüz kütüphaneleri CDN'den gelir.

## Nasıl Çalıştırılır

1. Bu depoyu klonlayın veya zip olarak indirin.
2. `satranc-app` klasörüne girin.
3. Terminalde veya komut istemcisinde şu komutu çalıştırın:

   ```bash
   python -m http.server 8000
   ```

4. Web tarayıcınızda `http://localhost:8000` adresini açın.

> `stockfish.js` bir Web Worker olarak yüklenir, bu yüzden dosyayı doğrudan
> `file://` ile açmak çalışmaz; yukarıdaki gibi bir HTTP sunucusu gerekir.

## Özellikler

- Açılışta mod seçme ekranı: **Klasik** ve **Rough Like** (kartlı oyun)
- Tahta ekran genişliğine göre akışkan: 1092px'e kadar büyür, dar ekranda
  panel ve sayfa dolgusuyla birlikte sığmayı garanti eder
- İnsan (beyaz) ile Stockfish arasında satranç oynaması
- Ayarlanabilir zorluk: 800 – 2880 ELO
- Rough Like'ta deste çekme: 3 kapalı kart, 2'si seçilir, tek kullanımlık
- Önceki/sonraki hamle gezinmesi ve oynanan pozisyona dönme
- Tıklanabilir hamle kayıt defteri
- Geçmişteki bir konumdan farklı bir hamle oynayarak yeni dal açma
- Giriş, şah, mat ve beraberlik gösterimi
- Yeni oyun ve tahtayı çevirme
- chess.com tarzı hareket ön izlemesi: sakin hamlelerde nokta, yakalamada halka
- Maç bitince "Maçı İncele": motor maçın tüm konumlarını ölçer, yalnızca
  **senin hatalarını** "daha iyi hamle" önerisiyle raporlar
- Önemli an tıklanınca tahtada animasyonla oynatılır, sonra doğru hamleyi
  sen oynarsın (yanlışsa kızarır, 6 saniye beklenirse motor oynar)
- Zorunlu mat varsa `N HAMLEDE MAT!` damgası ve üç hamlelik mat egzersizi,
  mat sonunda `ŞAH MAT!` damgası, kaybedenin devrilen şahı ve iki renkli kare

## Rough Like

Rough Like modunda oyuncu el başında **desteden 3 kart çeker ve 2'sini seçer**.
Her kart **tek kereliktir** ve **bedavadır**: kart oynandıktan sonra aynı sıra
içinde normal hamle de oynanır, kart sırayı bitirmez.

Kart tanımları `cards.js`, görselleri de aynı dosyada SVG olarak üretilir
(ayrı resim dosyası yoktur; hepsi `crispEdges` ile kare piksel).

### Uygulanan kartlar

Şu an beş kart oynanabilir. Hepsi tahtayı **kalıcı** değiştirir ve
`chess.js` üstünde `remove()` + `put()` ile uygulanır — motor yeni FEN'i
gördüğü için sonucu tam olarak doğru hesaplar.

1. **Piyon → Kale** — Kendi bir piyonunu kaleye dönüştürür. 7. sıradaysa terfi yerine geçer.
2. **Piyon → Vezir** — Kendi bir piyonunu vezire dönüştürür. 7. sıradaysa terfi yerine geçer.
3. **Fil ↔ At** — Kendi bir filini at yapar veya atını fil yapar.
4. **Kale ↔ Fil** — Kendi bir kalesini file veya filini kaleye dönüştürür.
5. **Renk Değiştir** — Kendi veya rakip piyon/at/fil/kalesinin rengini tersine çevirir. Vezir ve şah hariç.
### Uygulanmayı bekleyen kartlar

Bunlar destede **yok**: motorun kör olduğu ya da özel hamle üretimi gerektiren
kurallar. Eklenene kadar çekme ekranı yalnızca uygulanmış kartları dağıtır.

6. **Taş Dondurma** — Rakibin **bir taşı** seçilir ve **yalnızca bir rakip
   hamlesi** boyunca hareket edemez. Kart oynayan tarafın taşı seçilemez.
7. **Zehirli Taş** — Oyuncunun **kendi** taşlarından biri zehirlenir; zehirlenen
   taş rakip tarafına **görünmez** (motor bilmez). Rakip bu taşı yakalarsa
   **her iki taş da patlar** ve tahtadan kalkar. Zehirlilik, kartın oynandığı
   hamleden sonra **3 hamle** (oyuncu–motor–oyuncu) sürer; yenilmezse zehirli
   taş **kendi kendine patlar**.
8. **Şah+** — Oyuncunun şahı, **bir** hamle boyunca fil, kale veya at gibi
   hareket edebilir. O hamlede şah ya normal bir şah hamlesi yapar ya da bu
   özel hamleyi — ikisi birden olmaz.
### Değişmez kural

Dönüşen taşlar dönüştükten sonra **olduğu gibi kalır** — geri dönmez, kart
tekrar kullanılamaz. Bu geçmişte gezinirken de geçerlidir: kart oynanmış
konum defterde kart uygulanmış hâliyle durur, geri dönüp ilerleyince taş
ikinci kez dönüşmez.

Geçmişteki bir konumdayken kart oynanırsa, sonrasındaki hamleler o konumdan
türemediği için **dal budanır** — normal bir hamle oynanınca da böyle yapılır.

Kaydedilen maçlar kartlarıyla birlikte saklanır; "Yükle" maçı kart etkileri
uygulanmış tahtayla, o elde kalan kartlar boşaltılmış olarak yeniden kurar.

### Varsayımlar (tartışmada kesinleşmedi, uygulamada böyle alındı)

- **Şah dondurulamaz** ve **şah zehirlenemez.** Donmuş bir şah şah kontrolündeyse
  yasak durum (pat) üretir; zehirli şah ise matı imkânsız kılar.
- Dondurma **yalnızca rakibin taşını** hedefler.
- Zehirli taş **herhangi bir kendi taşın** olabilir (şah hariç).
- Piyon→kale kartı, 7. sıradaki bir piyonda kullanılırsa terfi yerine
  geçer: piyon o anda kaleye dönüşür.

### Motora kart vermek (henüz yazılmadı)

Motora da 2 rastgele kart verilmesi planlanıyor. Stockfish kartları bilmez,
ama **sonucu doğru hesaplar**. Her sırasında motora iki adımda karar verdirilir:

1. **Taban** — mevcut pozisyonda sığ arama (depth 5).
2. **Hipotetik** — elindeki her kart için pozisyon klonlanır, kart klona
   uygulanır, klonda yine sığ arama yapılır. Fark tabandan belirgin iyiyse
   kart oynanır ve **tahtanın yeni hali** motora FEN olarak verilir.

Altı kart için altı eylem üretici, tek ortak değerlendirme. Politika: motor
ancak **kaybettiğini düşündüğünde** kart harcar, yoksa elleri ilk hamlelerde
boşaltır.

### Hâlâ açık

- Hamle geçmişinde kartlar `moveHistory[i].kartlar` altında saklanır ve konuma
  dönüldüğünde yeniden uygulanır. **Zehirli taş** bunu bozar: yakalama iki taşı
  birden kaldırdığı için tek hamleyle yeniden üretilemez.

### Teknik engeller (tasarım notu)

- `makeEngineMove` yasadışı hamlede `console.error` basıp **motorun turunu
  yakıyor** (`script.js`). Dondurma gibi motorun göremediği kuralar eklendiğinde
  bu sonsuz döngüye dönüşür. Ön koşul: reddedilen hamleyi `searchmoves` ile
  dışlayıp yeniden aramak.
- `chess.js 0.10.3` yalnızca klasik satranç kurallarını uygular. Uygulanan
  üç kart `remove()` + `put()` ile bunun üstüne kurulur; **zehirli yakalama**
  ise yakalamanın ardından `undo()` + `remove()` gerektirir.
- `positionAfter()` bir konumu FEN'den yükleyip **tek hamleyi oynatarak**
  yeniden kurar. Zehirli yakalama bir yakalama olmadığından inceleme ekranı
  ile gerçek tahta ayrışır.

## Tahta teması

Tahta buz mavisi: açık kare `--light-square`, koyu kare `--dark-square`
(`style.css` içindeki `:root`). Kare koordinat yazıları da kareye göre
ayrı renklenir (`--notation-light` / `--notation-dark`).

chessboard.js sınıf adları sürüme göre karma üretir ve **bu sürümde
`light-*` / `dark-*` / `check-*` sınıfları hiç üretilmiyor**; gerçek adlar
`white-1e1d7` / `black-3c85d`. CSS bunları kullanır. chessboard.js şah
karesine sınıf eklemediği için kırmızı şah vurgusu `highlightCheckSquare()`
ile elle eklenir.

Hareket ön izlemesi de kütüphanede yok: chessboard.js 1.0.0'da
`showMoves` bulunmuyor. `showMoveHints()` yasal hedefleri `game.moves()` ile
h hesaplayıp karelere `move-hint` / `move-capture` sınıfı ekliyor, CSS de
bunları nokta ve halka olarak çiziyor.

Bu sürüm tıkla-seç-oyna desteklemiyor, yalnızca sürükle-bırak çalışıyor;
ön izleme bu yüzden taş sürüklenirken görünüyor.

## Zorluk (ELO) nasıl çalışıyor

Gömülü motor **Stockfish 2019-08-15 Multi-Variant** sürümüdür. Bu sürümde
`UCI_Elo` seçeneği yoktur (`setoption name UCI_Elo` "No such option" hatası
verir); tek zorluk düğmesi `Skill Level` (0-20) seçeneğidir.

Bu yüzden merdiven iki parçadan oluşur:

- **Skill Level 0** zaten ~1320 ELO civarında oynar, her seviye yaklaşık
  **78 ELO** ekler. Tavan 20. seviyedir, ~2880 ELO.
- **1320'nin altı** yalnızca arama derinliği kısıtlanarak elde edilir; tek
  iş parçacıklı bu derlemede derinlik 16'nın üstü saniyeler sürdüğü için
  üst sınır 16'dır.

Merdivende tek iş parçacıklı motorun oynayacağı en zayıf hâl 800 ELO'dur
(Seviye 0 + derinlik 2); 2880 ise motorun verebileceği en güçlü hâldir.
Ayarın motora ne olarak gittiği tahtanın altında "Seviye N · Derinlik N"
yazısıyla görünür. Zorluk değişikliği oynanmakta olan motor hamlesini
kesmez, bir sonraki hamleden itibaren geçerlidir.

İlgili yer: `eloToSettings()` ve `runSearch()` (script.js).

## Notlar

- Momentum çubuğu, Stockfish'in `info score` satırlarını kullanır. Bu
  değerler **sıranın oyuncusunun** bakış açısından yazılır; `parseScoreCp()`
  bunu beyazın bakış açısına çevirir. Ayrıca her hamleler arasında ölçülen
  değer `moveHistory` içine yazılır, böylece geçmişte gezinirken çubuk o
  konumun gerçek değerini gösterir.
- Her arama kendi `info` satırlarını kendi kancasıyla toplar (`onInfo`).
  Canlı değerlendirme ekrandaki konumu ölçerken maç incelemesi kendi
  konumunu ölçer; ikisi birbirinin satırlarını göremez.
- Stockfish'in tek arama yuvası vardır. Hamle araması ile değerlendirme
  araması çakışırsa yeni istek eskisini `stop` ile keser
  (`interruptSearch()`), böylece motorun sırası asla takılı kalmaz.
- Bulut değerlendirmesi için kullanılan arama her zaman tam güçte çalışır
  (Skill Level 20); böylece momentum çubuğu zorluk ayarından etkilenmez.

- Taşlar için lichess cburnett SVG teması kullanılır ve gri temaya uyum
  için CSS ile gri tonlanır.
- `satranc-app` klasöründeki `stockfish.js` değiştirilirse ELO merdiveninin
  üst sınırı (`Skill Level` menzili) geçersizleşir.

## Maç incelemesi

Maç bittiğinde "Maçı İncele" butonu belirir. Motor maçın bütün konumlarını
derinlik 12'de tam güçte (Skill Level 20) sırayla ölçer; bir konumun araması
bir sonraki hamlelerin öncesini de ölçtüğü için konum başına tek arama yeter.

Bir hamlenin maliyeti, o hamlenden önceki ve sonraki konumun beyaz bakış
açısından değerlendirme farkıdır. Fark 100 santipawnu (`REVIEW_MIN_LOSS`) aşarsa
ve motora o hamleden daha iyi bir alternatif varsa, o hamle "önemli an" olur.
Raporda **yalnızca insanın (beyazın) hataları** yer alır; motorun hataları
rapora girmez, çünkü öğretilecek olan odur:

- `Qh5` yerine **`Nf3` daha iyiydi** önerisi, `+0.9 → -1.4 · 2.2 piyon` değer
  düşüşü ve alternatifin ana varyasyonu,
- 200 santipawnu aşan kayıplar **Büyük hata**, diğerleri **Hata** etiketiyle,
- en kötü 8 an gösterilir; her kart tıklanabilir.

Tarama "Yeni Oyun" veya arşivden başka maç yüklendiğinde iptal edilir.
İlgili yer: `startGameReview()` ve `collectReviewMoments()` (script.js).

### Bir önemli anın oynatılması ve doğru hamleyi sen oynama

Bir önemli ana tıklandığında tahta önce o anı canlandırır:

1. kararı hazırlayan rakip hamlesi,
2. hatalı hamle,
3. hatalı hamlenin daha hızlı geri alınması.

Sonra **sıra oyuncudur**: ok oynanacak kareyi gösterir, durum satırı
`Bxf7+ oyna` yazar, hedef kare yeşil vurgulanır. Hamleyi sürükleyip bırakınca:

- doğruysa kabul edilir, sıra motora düşerse motor savunma hamlesini kendi
  oynar ve egzersiz bir sonraki oyuncunun hamlesine geçer,
- yanlışsa tahta değişmez, kaynak ve hedef kare kızarıp titrer, "değil, tekrar
  dene" yazar,
- 6 saniye hareketsiz kalınırsa motor beklenen hamleyi senin için oynar
  (`EXERCISE_HINT_MS`), kimse takılı kalmaz.

Her adımda önce ok çizilir, parça ok bittiğinde hedefe geçer. Tahta bu
oynatım için **ayrı bir konum** çizer (`demoFen`), `game` nesnesine dokunulmaz:
maçın defteri, değerlendirmeleri ve oyun durumu bozulmaz. Başka bir önemli
ana, geçmiş defterinden bir hamleye ya da gezinme okuna tıklamak egzersizi
durdurur ve tahtayı gerçek konuma geri verir. Maç bittikten sonra sürükle-bırak
yalnızca egzersiz sırasında çalışır (`matchIsOver()`), çünkü inceleme dışında
oynanacak hamle yoktur.

İlgili yer: `playMoment()`, `startExercise()`, `playExerciseMove()` ve
`drawMoveArrow()` (script.js).

### N hamlede mat

Egzersizin başladığı konumda **zorunlu mat** varsa (motor mat skorunu
yazıyorsa) tahtanın ortasına çapraz bir damga çıkar: `2 HAMLEDE MAT!`.
Damgadaki sayı gerçekten bulunan mattır, tahmin değil. Mat varsa egzersiz
hattın tamamını oynatır: mat-2'de oyuncu iki, mat-3'te üç beyaz hamlesini
sırayla oynar, aradaki siyah savunmalarını motor oynar. `REVIEW_MAT_STEPS = 3`
üst sınırıdır.

Bu motorun sınırı: gömülü Stockfish 2019 Multi-Variant derlemesi mat-1 ve
mat-2'yi derinlik 12'de anında buluyor (41 ms), mat-3'ü ise aynı derinlikte
ve derinlik 18'de bulamıyor (Morphy'nin `Qxg6` varyantı denendi). Yani
"3 HAMLEDE MAT!" damgası bu derlemede nadir görünür; mat tespiti motorun
gördüğüyle sınırlıdır.

## Mat gösterimi

Şah ve matta sonuç doğrudan tahtada okunur. **Tahta teması değişmez**, yalnızca
iki şah karesi boyanır:

- matta kalan tarafın **şahı devrilir** (90° dönüş animasyonu), karesi yarı
  saydam kırmızıya boyanır ve üstüne beyaz **✕** gelir,
- kazanan tarafın şahının karesi yarı saydam yeşile boyanır, üstünde beyaz
  **✓** vardır,
- mat bitince tahtanın ortasına çapraz **ŞAH MAT!** damgası düşer.

Yarı saydamlık 0.52: tam saydam olsaydı renk görünmezdi, tam opak olsaydı taş
okunmazdı. chessboard.js karelere sınıf eklemediği için bu işaretleri
`paintPositionMarks()` ekliyor (README'nin tahta teması bölümündeki sınıf adları
geçerli).
