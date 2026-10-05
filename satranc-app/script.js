// =====================================================================
//  Durum
// =====================================================================

// İnsan her zaman beyaz oynar; "Tahtayı Çevir" yalnızca bakış açısını değiştirir.
const HUMAN_COLOR = 'w'

let board = null
let game = new Chess()
// Başlangıç konumu: maç incelemesi ilk hamleden önceki konumu da ölçmek
// zorunda, o konum hamle defterinde yok.
const START_FEN = new Chess().fen()

let stockfishEngine = null
let isEngineThinking = false
let engineElo = 1500

// Hamle kayıt defteri ve geçmiş gezinmesi.
// moveHistory[i] = { fen, san, uci, color, moveNumber }
// currentHistoryIndex === -1 oynanan (canlı) pozisyonu, yani son hamleyi gösterir.
let moveHistory = []
let currentHistoryIndex = -1
let isNavigating = false

// Motoru tek aramada meşgul eden arama. Stockfish'in tek arama yuvası
// olduğu için her yeni arama öncekini keser. searchToken, kesilen aramanın
// gecikmeli bestmove'unun yeni aramayı bozmasını engeller.
let activeSearch = null
let searchToken = 0

// Maç sonu incelemesi: motor maçın tüm konumlarını bir kez tarar, yalnızca
// değerlendirmeyi büyük ölçüde bozan hamleleri "önemli an" olarak raporlar.
let gameReview = { running: false, done: false, scanned: 0, total: 0, found: 0, moments: [] }
let reviewScans = []      // konum başına ölçüm; indeksi ply ile aynı
let reviewToken = 0       // iptal edilmiş taramayı geçersiz kılar
let reviewHtml = ''       // panelin son çizilen içeriği, boşuna yeniden çizmemek için

// Önemli an oynatımı: motorun önerdiği hamle tahtada animasyonla
// gösterilir. Tahtanın çizdiği konum "game" nesnesinden ayrı tutulur, yani
// oynanmış maçın defteri ve değerlendirmeleri bozulmaz.
let demoFen = null
let demoLabel = ''
let demoTimers = []

// Egzersiz: incelemeden sonra doğru hamleyi oyuncu kendisi oynuyor.
// plies = sırayla oynanacak hamleler (UCI), step = sıradakinin indeksi.
// Çift indeksler oyuncunun, tek indeksler motorun hamleleridir.
let exercise = null

// Tüm maç taranacağı için derinlik canlı değerlendirmedekinin aynısı;
// tek iş parçacıklı motorda maç başına saniyeler süren bir tarama.
const REVIEW_DEPTH = 12
const REVIEW_MIN_LOSS = 100      // cp: altındaki kayıp "önemli an" sayılmaz
const REVIEW_BLUNDER_LOSS = 200  // cp: bu üstü "büyük hata" olarak etiketlenir
const REVIEW_MOMENT_LIMIT = 8
const REVIEW_LINE_LENGTH = 8     // rapordaki ana varyasyonun hamle sayısı
// Bu hamle sayısına kadar zorunlu mat varsa egzersiz hattın tamamını
// oynatır: üç beyaz hamlesi de oyuncunun.
const REVIEW_MAT_STEPS = 3
const EXERCISE_HINT_MS = 6000   // hareketsiz kalınırsa motor hamleyi oynar
const EXERCISE_STEP_MS = 550    // motorun kendi hamlesi arasındaki bekleme

// Stockfish mat skorunu 10000 - hamle*100 olarak yazar; 9000 ve üstü
// "zorunlu mat" demek (10 hamlelik mat tam sınırda).
const MATE_CP = 9000

// Okun çizilme süresi: bu süre dolunca parça hedefe geçer.
const ARROW_DRAW_MS = 260

// Kayıtlı maçlar (localStorage).
const STORAGE_KEY = 'satranc.maclar'


// =====================================================================
//  ELO -> motor ayarları
// =====================================================================
// Paketlenmiş motor "Stockfish 2019-08-15 Multi-Variant". UCI_Elo seçeneğini
// desteklemiyor ("No such option: UCI_Elo"), tek zorluk knob'u Skill Level
// (0-20). Skill Level 0 zaten ~1320 civarı oynuyor ve her seviye yaklaşık
// 78 ELO ekliyor; 20 en üst sınır, ~2880. 1320'nin altına inmenin dürüst
// yolu arama derinliğini kısıtlamak, merdivenin alt ucu da onu yapıyor.
// Aralığın kaynağı index.html'deki kaydırıcıdır.
let ELO_MIN = 800
let ELO_MAX = 2880
const SKILL_FLOOR_ELO = 1320
const SKILL_ELO_STEP = 78
const MAX_SKILL = 20

function initEloBounds() {
    const slider = document.getElementById('eloSlider')
    ELO_MIN = parseInt(slider.min, 10)
    ELO_MAX = parseInt(slider.max, 10)
}

// Tek iş parçacıklı bu derlemede derinlik 18+ saniyeler sürüyor, bu yüzden
// tavan 16. Zorluk asıl olarak Skill Level'dan geliyor, derinlik yalnızca
// en alt basamaklarda motoru daha da zayıflatıyor.
function eloToSettings(elo) {
    const ratio = (elo - ELO_MIN) / (ELO_MAX - ELO_MIN)
    const depth = Math.max(2, Math.min(16, Math.round(2 + ratio * 14)))
    const skill = elo < SKILL_FLOOR_ELO
        ? 0
        : Math.min(MAX_SKILL, Math.floor((elo - SKILL_FLOOR_ELO) / SKILL_ELO_STEP))
    return { skill: skill, depth: depth }
}


// =====================================================================
//  Motor araması
// =====================================================================

// Aramayı başlatır, en iyi hamleyi string olarak çözer.
// Arama kesilirse veya motor "(none)" derse null döner.
// onInfo verilirse aramanın "info" satırları yalnızca o aramaya verilir.
function runSearch(fen, settings, onInfo) {
    return new Promise((resolve) => {
        if (!stockfishEngine) {
            resolve(null)
            return
        }
        searchToken++
        activeSearch = {
            token: searchToken,
            fen: fen,
            // Stockfish "info score" değerini her zaman sıranın oyuncusunun
            // bakış açısından yazar; beyazın bakış açısına çevirmek burada.
            sideToMove: fen.split(' ')[1] === 'b' ? 'b' : 'w',
            onInfo: onInfo || null,
            onBest: resolve,
            onStopped: null
        }
        stockfishEngine.postMessage('setoption name Skill Level value ' + settings.skill)
        stockfishEngine.postMessage('position fen ' + fen)
        stockfishEngine.postMessage('go depth ' + settings.depth)
    })
}

// Arama sırasında gelen "info" satırlarını verilen kancaya aktarır.
// Her aramanın kendi dinleyicisi olduğu için canlı değerlendirme ile maç
// incelemesi birbirinin satırlarını göremez.
function collectInfo(target) {
    return function (line, sideToMove) {
        const cp = parseScoreCp(line, sideToMove)
        if (cp === null) return
        // Stockfish satırları derinlik arttıkça gelir; en derin satır kazanır.
        const depth = parseInfoDepth(line)
        if (depth < target.depth) return
        target.depth = depth
        target.cp = cp
        // Aynı derinlikte bazen kısa bir satır gelir (aspiration yeniden
        // araması). Uzun olanı tutuyoruz: mat hattı eksik kalmasın.
        const pv = parsePv(line)
        if (pv.length > target.pv.length) target.pv = pv
    }
}

// Devam eden aramayı durdurur. Kesilen aramanın kendi çağıranı null ile
// serbest bırakılır.
//
// "stop" komutu boştaki motora gönderildiğinde Stockfish hiçbir şey
// döndürmez; yalnızca bestmove bekleyerek askıda kalırsak boru hattı tıkanır
// (değerlendirme çubuğu, maç incelemesi ve sonraki motor hamleleri bir daha
// çalışmaz). Bu yüzden bestmove ya da kısa bir zaman aşımı - hangisi önce
// gelirse.
function interruptSearch() {
    const running = activeSearch
    if (!running || !stockfishEngine) return Promise.resolve()

    return new Promise((resolve) => {
        let settled = false
        const done = function () {
            if (settled) return
            settled = true
            resolve()
        }

        running.onStopped = done
        if (running.onBest) {
            running.onBest(null)
            running.onBest = null
        }
        stockfishEngine.postMessage('stop')
        window.setTimeout(done, 500)
    })
}

// Sıralı arama: önceki aramayı keser, sonra kendi aramasını yapar.
function engineSearch(fen, settings, onInfo) {
    return interruptSearch().then(function () {
        return runSearch(fen, settings, onInfo)
    })
}


// =====================================================================
//  Tahta
// =====================================================================

function initBoard() {
    board = Chessboard('board', {
        draggable: true,
        position: 'start',
        pieceTheme: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        onMouseoutSquare: clearMoveHints,
        onMouseoutBoard: clearMoveHints,
        orientation: HUMAN_COLOR
    })
}

// chessboard.js tahtayı bir kez ölçüyor ve sonra kendiliğinden yeniden
// boyutlanmıyor; ekran daralınca kareler tahtanın dışına taşıyor. resize()
// onu güncel CSS kutusuna göre yeniden ölçüyor.
let resizeTimer = null
function handleResize() {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(function () {
        board.resize()
        paintPositionMarks(viewPosition())
    }, 120)
}

// İnsan oynayabiliyorsa o kareyi seçebilir; seçim anında hedefler noktalanır.
// Maç bittikten sonra sürükleme yalnızca egzersizde geçerli: oynanacak
// doğru hamle orada oynanır.
function onDragStart(source, piece) {
    if (isEngineThinking || isNavigating) return false
    // Kart hedefi seçiliyorken sürükleme kapalı: önce hedefi çöz.
    if (armedCard) return false
    if (!exercise && matchIsOver()) return false
    if (piece.charAt(0) !== HUMAN_COLOR) return false
    showMoveHints(source)
}

function onDrop(source, target) {
    if (exercise) {
        clearMoveHints()
        playExerciseMove(source, target)
        return 'snapback'
    }
    if (isNavigating || isEngineThinking || matchIsOver()) {
        clearMoveHints()
        return 'snapback'
    }

    // Önce hamleyi doğrula: geçmişi budurmak hamle geçerli olmadan yapılırsa,
    // reddedilen bir bırakma defteri ve durum metnini tahtayla tutarsız bırakır.
    const move = game.move({ from: source, to: target, promotion: 'q' })
    clearMoveHints()
    if (move === null) return 'snapback'

    // Geçmişten bir hamle oynuyorsak, sonrasındaki hamleler geçersiz olur.
    if (currentHistoryIndex !== -1 && currentHistoryIndex < moveHistory.length - 1) {
        moveHistory = moveHistory.slice(0, currentHistoryIndex + 1)
    }
    currentHistoryIndex = -1

    addMoveToHistory(move)
    refresh()

    if (game.game_over()) return
    window.setTimeout(makeEngineMove, 250)
}

function onSnapEnd() { updateBoard() }


// =====================================================================
//  Hareket ön izlemesi (chess.com tarzı noktalar)
// =====================================================================

// chessboard.js 1.0.0'da showMoves yok; yasal hedefleri kendimiz
// hesaplayıp karelere sınıf ekliyoruz. Sakin hamleler nokta, yakalamalar
// halka alır - chess.com'daki gibi.
function showMoveHints(from) {
    clearMoveHints()
    if (!from || game.game_over() || isEngineThinking) return

    game.moves({ square: from, verbose: true }).forEach(function (m) {
        const el = document.querySelector('.square-' + m.to)
        if (!el) return
        el.classList.add(m.captured ? 'move-capture' : 'move-hint')
    })
}

function clearMoveHints() {
    document.querySelectorAll('.move-hint, .move-capture').forEach(function (el) {
        el.classList.remove('move-hint', 'move-capture')
    })
}

// Ekranda çizilecek konum: inceleme animasyonu sürerken demo konumu,
// aksi hâlde oynanan pozisyon.
function viewPosition() {
    if (!demoFen) return game
    const view = new Chess()
    view.load(demoFen)
    return view
}

function updateBoard() {
    const view = viewPosition()
    board.position(view.fen())
    clearCardTargets()
    updateBoardStamp(view)
    updateStatus()
}

// Mat damgası: tahtanın ortasına çapraz yazılır. Egzersizde zorunlu mat
// varsa kaç hamlede olduğunu, maç bittiyse "ŞAH MAT!" yazar.
function updateBoardStamp(view) {
    let text = ''
    if (exercise && exercise.mateIn > 0 && exercise.step < exercise.plies.length) {
        text = exercise.mateIn + ' HAMLEDE MAT!'
    } else if (view.game_over() && view.in_checkmate()) {
        text = 'ŞAH MAT!'
    }

    const boardEl = document.getElementById('board')
    if (!boardEl) return
    if (!text) return clearBoardStamp()
    const current = boardEl.querySelector('.board-stamp')
    if (current && current.textContent === text) return

    clearBoardStamp()
    const stamp = document.createElement('div')
    stamp.className = 'board-stamp'
    stamp.textContent = text
    boardEl.appendChild(stamp)
}

function clearBoardStamp() {
    document.querySelectorAll('#board .board-stamp').forEach(function (el) {
        el.remove()
    })
}

// chessboard.js karelere sınıf eklemiyor; şah, mat ve öneri vurgularını
// biz ekliyoruz.
function paintPositionMarks(view) {
    document.querySelectorAll(
        '.in-check, .mate-lose, .mate-win, .suggest-from, .suggest-to, .move-land'
    ).forEach(function (el) {
        el.classList.remove('in-check', 'mate-lose', 'mate-win',
            'suggest-from', 'suggest-to', 'move-land')
    })

    // Matta kalan tarafın şahı devrilir ve karesi kırmızıya boyanır,
    // kazananın şahı yeşile: sonuç tahtanın üstünde okunur. Mat karesi
    // şah vurgusunun yerini alır, ikisi bir arada anlamlı değil.
    if (view.game_over() && view.in_checkmate()) {
        const loser = view.turn()
        markKingSquare(view, loser, 'mate-lose')
        markKingSquare(view, loser === 'w' ? 'b' : 'w', 'mate-win')
    } else if (view.in_check()) {
        markKingSquare(view, view.turn(), 'in-check')
    }
}

function markKingSquare(view, color, cls) {
    const square = findKingSquare(view, color)
    if (!square) return
    const el = document.querySelector('.square-' + square)
    if (el) el.classList.add(cls)
}

// chess.js board() satırları 8'den 1'e, sütunlar a'dan h'ye gider ve
// taşlar {type, color} nesnesi olarak döner.
function findKingSquare(view, color) {
    const rows = view.board()
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = rows[r][c]
            if (piece && piece.type === 'k' && piece.color === color) {
                return String.fromCharCode(97 + c) + String(8 - r)
            }
        }
    }
    return ''
}




// Oynanmış maçın bittiği, ekranda hangi konumun durduğundan bağımsız:
// defterdeki son konumun kendisi terminal mi diye bakılır. Geçmişte
// gezinirken game.game_over() yanlış olurdu, o konumda hamle oynanabilir.
function matchIsOver() {
    if (moveHistory.length === 0) return false
    const last = new Chess()
    last.load(moveHistory[moveHistory.length - 1].fen)
    return last.game_over()
}


// =====================================================================
//  Hamle kayıt defteri
// =====================================================================

function addMoveToHistory(move) {
    // Hamle numarası chess.js'in kendi geçmişinden değil, bizim defterimizden
    // hesaplanır; geçmişten bir hamle oynayıp yeni bir dal açtığımızda
    // chess.js sıfırlanıyordu ve numaralar yanlış çıkıyordu.
    const ply = moveHistory.length
    const entry = {
        fen: game.fen(),
        san: move.san,
        uci: move.from + move.to + (move.promotion || ''),
        color: move.color === 'w' ? 'white' : 'black',
        moveNumber: Math.floor(ply / 2) + 1
    }
    // Hamleden önce oynanmış kartlar bu konumun bir parçasıdır.
    if (pendingCards.length) {
        entry.kartlar = pendingCards
        pendingCards = []
    }
    moveHistory.push(entry)
    currentHistoryIndex = -1
}

function isCurrentMoveIndex(index) {
    return currentHistoryIndex === -1
        ? index === moveHistory.length - 1
        : index === currentHistoryIndex
}

function updateHistoryDisplay() {
    const list = document.getElementById('historyList')

    if (moveHistory.length === 0) {
        list.innerHTML = '<div class="history-empty">Henüz hamle yok</div>'
        return
    }

    let html = ''
    for (let i = 0; i < moveHistory.length; i += 2) {
        const white = moveHistory[i]
        const black = moveHistory[i + 1]
        html += '<div class="history-move-row">'
        html += '<span class="history-move-number">' + white.moveNumber + '.</span>'
        html += '<div class="history-move-pair">'
        html += renderMoveCell(white, i)
        html += black
            ? renderMoveCell(black, i + 1)
            : '<span class="history-move empty">&middot;</span>'
        html += '</div></div>'
    }
    list.innerHTML = html

    // Her hamle kendi indeksine göre tıklanabilir. Satır sırası hamle indeksi
    // değildir, önceki kod satır sırasını kullanıyordu ve yanlış hamleye gidiyordu.
    list.querySelectorAll('.history-move[data-index]').forEach(function (cell) {
        cell.addEventListener('click', function () {
            navigateToMove(parseInt(cell.dataset.index, 10))
        })
    })

    const current = list.querySelector('.history-move.current')
    if (current) current.scrollIntoView({ block: 'nearest' })
}

function renderMoveCell(entry, index) {
    return '<button type="button" class="history-move ' + entry.color
        + (isCurrentMoveIndex(index) ? ' current' : '')
        + '" data-index="' + index + '">' + escapeHtml(entry.san) + '</button>'
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}


// =====================================================================
//  Geçmiş gezinmesi
// =====================================================================

function navigateToMove(index) {
    if (index < 0 || index >= moveHistory.length) return
    if (isEngineThinking) return

    // Her gezinme inceleme animasyonunu keser: tahta artık gerçek konumu
    // göstermeli.
    stopDemo()
    isNavigating = true
    currentHistoryIndex = index
    // Kayıt FEN'i kartlar uygulandıktan sonra yazılır; tahta hazır gelir.
    // Kartlar burada tekrar oynanmaz, yoksa "Fil At" gibi kart geri döner.
    game.load(moveHistory[index].fen)
    isNavigating = false

    refresh()
}

function goToPrevMove() {
    if (moveHistory.length === 0) return
    if (currentHistoryIndex === -1) {
        navigateToMove(moveHistory.length - 1)
    } else if (currentHistoryIndex > 0) {
        navigateToMove(currentHistoryIndex - 1)
    }
}

function goToNextMove() {
    // Canlı pozisyondayken ileri gidecek bir yer yok.
    if (currentHistoryIndex === -1) return
    if (currentHistoryIndex < moveHistory.length - 1) {
        navigateToMove(currentHistoryIndex + 1)
    } else {
        returnToCurrentPosition()
    }
}

function returnToCurrentPosition() {
    if (currentHistoryIndex === -1) return
    if (isEngineThinking) return

    stopDemo()
    isNavigating = true
    currentHistoryIndex = -1
    game.load(moveHistory[moveHistory.length - 1].fen)
    isNavigating = false

    refresh()
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('prevMoveBtn')
    const nextBtn = document.getElementById('nextMoveBtn')

    const hasHistory = moveHistory.length > 0
    const atLive = currentHistoryIndex === -1
    const atEnd = !atLive && currentHistoryIndex === moveHistory.length - 1

    prevBtn.disabled = !hasHistory || (!atLive && currentHistoryIndex === 0)
    // "Sonraki" yalnızca canlı pozisyonda kapanır. Son hamledeyken kapatmak,
    // oynanan pozisyona dönmenin tek yolunu da kapatıyordu.
    nextBtn.disabled = atLive

    nextBtn.classList.toggle('at-end', atEnd)
    nextBtn.title = atEnd ? 'Oynanan pozisyona dön' : 'Sonraki hamle'
    prevBtn.title = 'Önceki hamle'
}

// Stockfish "info score" satırından beyazın bakış açısıyla değerlendirme
// çözer. Satırda skor yoksa null döner.
function parseScoreCp(line, sideToMove) {
    const cpMatch = /score cp (-?\d+)/.exec(line)
    const mateMatch = /score mate (-?\d+)/.exec(line)

    let cp = null
    if (cpMatch) {
        cp = parseInt(cpMatch[1], 10)
    } else if (mateMatch) {
        const mateIn = parseInt(mateMatch[1], 10)
        cp = mateIn > 0 ? 10000 - mateIn * 100 : -10000 - mateIn * 100
    }
    if (cp === null) return null

    return sideToMove === 'b' ? -cp : cp
}

// "info" satırındaki ana varyasyonu UCI hamle listesine çevirir.
function parsePv(line) {
    const match = / pv (.+)$/.exec(line)
    return match ? match[1].trim().split(' ') : []
}

function parseInfoDepth(line) {
    const match = /depth (\d+)/.exec(line)
    return match ? parseInt(match[1], 10) : 0
}

// =====================================================================
//  Maç sonu incelemesi
// =====================================================================

// Maç bittiğinde "Maçı İncele" ile bir kez çalışır: motor maçın bütün
// konumlarını tam güçte ölçer ve yalnızca değerlendirmeyi bozan hamleleri
// raporlar. Konum başına tek arama yeter: bir konumun sonraki konumla
// paylaşılan hâli, sıradaki hamlelerin öncesidir.
function startGameReview() {
    if (!stockfishEngine || gameReview.running) return
    if (!matchIsOver() || moveHistory.length === 0) return

    reviewToken++
    const myToken = reviewToken
    reviewScans = []
    gameReview = {
        running: true,
        done: false,
        scanned: 0,
        total: moveHistory.length,
        found: 0,
        moments: []
    }
    updateReviewPanel()
    scanPosition(0, myToken)
}

// Yeni oyun ya da yeni maç: süren taramayı geçersiz kılar, raporu ve
// tahtadaki oynatımı siler.
function resetGameReview() {
    reviewToken++
    reviewScans = []
    reviewHtml = ''
    gameReview = { running: false, done: false, scanned: 0, total: 0, found: 0, moments: [] }
    stopDemo()
}

// ply kaçıncı hamlenden önceki konumdur (0: ilk beyaz hamlesi).
function positionBeforePly(ply) {
    return ply === 0 ? START_FEN : moveHistory[ply - 1].fen
}

function scanPosition(ply, myToken) {
    if (myToken !== reviewToken) return
    if (ply >= gameReview.total) {
        finishReview(myToken)
        return
    }

    const scan = { depth: -1, cp: null, pv: [] }
    engineSearch(
        positionBeforePly(ply),
        { skill: MAX_SKILL, depth: REVIEW_DEPTH },
        collectInfo(scan)
    ).then(function () {
        // Tarama arada iptal edildiyse (yeni oyun, başka maç) sonuçları
        // kullanan hiçbir ekran olmamalı.
        if (myToken !== reviewToken) return
        if (scan.cp !== null) reviewScans[ply] = scan

        gameReview.scanned = ply + 1
        updateReviewPanel()
        scanPosition(ply + 1, myToken)
    })
}

// Maçın son konumu oynanacak hamle içermiyor; mat ya da beraberlik
// durumunda motor buraya cevap vermiyor ve arama sonsuza kadar bekliyor.
// O konumun değeri zaten sonucun kendisi: matta kuran taraf doymuş, beraberlikte
// sıfır. Böylece son hamlenin kaybı da doğru ölçülür.
function terminalScan() {
    return { depth: 0, cp: terminalEvaluation(), pv: [] }
}

function terminalEvaluation() {
    if (game.in_checkmate()) return game.turn() === 'w' ? -10000 : 10000
    return 0
}

function finishReview(myToken) {
    if (myToken !== reviewToken) return

    reviewScans[moveHistory.length] = terminalScan()
    const found = collectReviewMoments()
    gameReview.running = false
    gameReview.done = true
    gameReview.found = found.length
    gameReview.moments = found.slice(0, REVIEW_MOMENT_LIMIT)
    updateReviewPanel()
}

// Bir hamlenin maliyeti, o hamlenden önceki ve sonraki konumun beyaz
// bakış açısından değerlendirme farkıdır. Raporda yalnızca insanın
// (beyazın) hataları yer alır: motora öğretilecek olan odur.

// Üretilen öneri hattının ilk adımı burada başlar.
function collectReviewMoments() {
    const found = []

    for (let ply = 0; ply < moveHistory.length; ply++) {
        const entry = moveHistory[ply]
        // Defter renkleri CSS sınıfı için "white"/"black" saklıyor; insan
        // beyaz oynuyor, motorun hataları rapora girmiyor.
        if ((entry.color === 'white' ? 'w' : 'b') !== HUMAN_COLOR) continue

        const before = reviewScans[ply]
        const after = reviewScans[ply + 1]
        if (!before || !after) continue

        const loss = before.cp - after.cp
        if (loss < REVIEW_MIN_LOSS) continue

        const better = firstAlternative(positionBeforePly(ply), before.pv, entry.uci)
        if (!better) continue

        found.push({
            ply: ply,
            moveNumber: entry.moveNumber,
            color: entry.color,
            playedSan: entry.san,
            playedUci: entry.uci,
            bestSan: better.san,
            line: better.line,
            // Egzersizde oynanacak hamleler; SAN satırıyla aynı indeksten.
            pvUci: before.pv.slice(better.at),
            loss: loss,
            beforeCp: before.cp,
            afterCp: after.cp,
            // Karar hamlenden önce verildiği için tahtayı o konuma alıyoruz;
            // ilk hamlede böyle bir konum yok.
            jumpIndex: ply > 0 ? ply - 1 : -1
        })
    }

    found.sort(function (a, b) { return b.loss - a.loss })
    return found
}

// Varyasyonun oynanan hamleden farklı ilk adımı, yani "şu hamle daha iyi
// olurdu" önerisi. Motor oynadığın hamleyi en iyi bulduysa bu an rapora
// girmez: ortada önerilecek bir hamle yoktur.
function firstAlternative(fen, pv, playedUci) {
    const sans = pvToSan(fen, pv)
    for (let i = 0; i < pv.length && i < sans.length; i++) {
        if (pv[i] === playedUci) continue
        return { at: i, uci: pv[i], san: sans[i], line: sans.slice(i, i + REVIEW_LINE_LENGTH) }
    }
    return null
}

function isMateScore(cp) {
    return cp >= MATE_CP || cp <= -MATE_CP
}

// Santipawnı okunur biçime çevirir: +1.4 / -0.6, mat için #3 / #-1.
function formatEvalCp(cp) {
    if (cp >= MATE_CP) return '#' + Math.round((10000 - cp) / 100)
    if (cp <= -MATE_CP) return '#-' + Math.abs(Math.round((-10000 - cp) / 100))
    const pawns = cp / 100
    return (pawns > 0 ? '+' : '') + pawns.toFixed(1)
}

function updateReviewPanel() {
    const panel = document.getElementById('reviewPanel')
    const btn = document.getElementById('analyzeBtn')
    if (!panel || !btn) return

    // İnceleme yalnızca bitmiş maçta anlamlı: oyun sürerken buton yok,
    // panel yalnızca tarama sürerken ya da rapor hazırken görünür. Maçın
    // bittiği ekrandaki konumdan değil defterden sorulur, yoksa bir önemli
    // ana tıklayıp geçmişe geçince panel kaybolurdu.
    const finished = matchIsOver() && moveHistory.length > 0
    const hasReport = gameReview.running || gameReview.done

    btn.hidden = !finished
    btn.disabled = gameReview.running
    btn.textContent = gameReview.running
        ? 'İnceleniyor…'
        : (gameReview.done ? 'Yeniden İncele' : 'Maçı İncele')
    panel.hidden = !(finished && hasReport)

    if (!finished) {
        reviewHtml = ''
        return
    }
    if (!hasReport) return

    const html = buildReviewHtml()
    if (html === reviewHtml) return
    reviewHtml = html
    panel.innerHTML = html

    panel.querySelectorAll('.review-moment[data-moment]').forEach(function (item) {
        item.addEventListener('click', function () {
            playMoment(gameReview.moments[parseInt(item.dataset.moment, 10)])
        })
    })
}

function buildReviewHtml() {
    if (gameReview.running) {
        const percent = Math.round((gameReview.scanned / gameReview.total) * 100)
        return '<div class="review-head"><span>Maç inceleniyor</span></div>'
            + '<div class="review-progress">'
            + '<div class="review-progress-fill" style="width:' + percent + '%"></div>'
            + '</div>'
            + '<div class="review-progress-text">'
            + gameReview.scanned + ' / ' + gameReview.total + ' konum ölçüldü</div>'
    }

    const count = gameReview.found
    let html = '<div class="review-head"><span>Maç incelemesi</span>'
        + '<span>' + count + ' önemli an</span></div>'

    if (count === 0) {
        return html + '<div class="review-empty">Motor, değerlendirmeyi bozan bir hamle bulamadı.</div>'
    }

    if (count > gameReview.moments.length) {
        html += '<div class="review-note">En kötü ' + gameReview.moments.length + ' an gösteriliyor.</div>'
    }

    for (let i = 0; i < gameReview.moments.length; i++) {
        html += renderReviewMoment(gameReview.moments[i], i)
    }
    return html
}

function renderReviewMoment(moment, index) {
    const kind = moment.loss >= REVIEW_BLUNDER_LOSS ? 'blunder' : 'mistake'
    const tag = kind === 'blunder' ? 'Büyük hata' : 'Hata'
    const who = moment.color === 'white' ? 'Beyaz' : 'Siyah'
    const jumpable = moment.jumpIndex >= 0
    const jump = jumpable ? ' data-moment="' + index + '"' : ''

    return '<button type="button" class="review-moment ' + moment.color
        + (jumpable ? '' : ' static') + '"' + jump + '>'
        + '<span class="review-moment-head">'
        + '<span class="review-move-no">' + moment.moveNumber + '. hamle</span>'
        + '<span class="review-who">' + who + '</span>'
        + '<span class="review-tag ' + kind + '">' + tag + '</span>'
        + '</span>'
        + '<span class="review-swap">'
        + '<span class="review-played">' + escapeHtml(moment.playedSan) + '</span>'
        + '<span class="review-arrow">yerine</span>'
        + '<span class="review-better">' + escapeHtml(moment.bestSan) + ' daha iyiydi</span>'
        + '</span>'
        + '<span class="review-swing">' + formatEvalCp(moment.beforeCp)
        + ' &rarr; ' + formatEvalCp(moment.afterCp)
        + (isMateScore(moment.beforeCp) || isMateScore(moment.afterCp)
            ? ''
            : ' · ' + (moment.loss / 100).toFixed(1) + ' piyon') + '</span>'
        + '<span class="review-line">' + escapeHtml(moment.line.join(' ')) + '</span>'
        + '</button>'
}


// =====================================================================
//  Önemli an oynatımı
// =====================================================================

// Bir önemli anı tahtada canlandırır: kararı hazırlayan rakip hamlesi,
// hatalı hamle ve hatalı hamlenin geri alınması oynatılır. Sonra doğru hamle
// oyuncuya kalır (startExercise). Tahta "demoFen" konumunu çizdiği için
// oynanmış maçın defteri, değerlendirmeleri ve oyun durumu bozulmaz.
function playMoment(moment) {
    if (!moment || moment.jumpIndex < 0) return

    const jump = moment.jumpIndex
    // Kararın verildiği konum, hatalı hamlenin oynandığı konumdur.
    const decisionFen = moveHistory[jump].fen
    const mistake = moveHistory[moment.ply]

    const steps = []
    // jumpIndex 0 ise karar başlangıç konumunda verilmiş, kurulum hamlesi yok.
    if (jump >= 1) steps.push({ uci: moveHistory[jump].uci, fen: decisionFen, wait: 640 })
    steps.push({ uci: mistake.uci, fen: mistake.fen, wait: 560 })
    steps.push({ undo: true, fen: decisionFen, wait: 480 })

    stopDemo()
    navigateToMove(jump >= 1 ? jump - 1 : jump)
    demoLabel = 'an oynatılıyor'
    playDemoSteps(steps, moment)
}

function playDemoSteps(steps, moment) {
    let i = 0

    const next = function () {
        if (i >= steps.length) {
            startExercise(moment)
            return
        }

        const step = steps[i++]

        if (step.undo) {
            clearMoveArrow()
            clearSuggestion()
            showDemoFen(step.fen)
            demoTimers.push(window.setTimeout(next, step.wait))
            return
        }

        // Ok önce çizilir, parça ok bittiğinde hedefe geçer.
        drawMoveArrow(step.uci, step.suggest)
        demoTimers.push(window.setTimeout(function () {
            showDemoFen(step.fen)
            // Konum çizimi vurguları temizlediği için öneri işareti
            // hamleden sonra yeniden eklenir.
            if (step.suggest) markSuggestion(step.uci)
            flashLanding(uciTo(step.uci))
            demoTimers.push(window.setTimeout(next, step.wait))
        }, ARROW_DRAW_MS))
    }

    next()
}

function showDemoFen(fen) {
    demoFen = fen
    updateBoard()
}

// Animasyonu durdurur, egzersizi kapatır ve tahtayı gerçek konuma verir.
function stopDemo() {
    demoTimers.forEach(window.clearTimeout)
    demoTimers = []
    if (exercise) window.clearTimeout(exercise.timer)
    exercise = null
    demoFen = null
    demoLabel = ''
    clearMoveArrow()
    clearSuggestion()
    clearBoardStamp()
}


// =====================================================================
//  Doğru hamleyi oyna (egzersiz)
// =====================================================================

// Oynatma bitti: sıra oyuncuda. Konumda zorunlu mat varsa (3 hamleye kadar)
// hattın tamamı egzersize girer, böylece üç beyaz hamlesini de oyuncu oynar.
function startExercise(moment) {
    const plies = moment.pvUci || []
    const mateIn = mateDistance(moment.beforeCp)
    const take = mateIn > 0 ? mateIn * 2 - 1 : 1
    if (plies.length === 0) {
        demoLabel = ''
        updateStatus()
        return
    }

    exercise = {
        plies: plies.slice(0, take),
        sans: moment.line,
        step: 0,
        fen: moveHistory[moment.jumpIndex].fen,
        mateIn: mateIn,
        timer: null
    }
    promptExercise()
}

// Zorunlu matın kaç hamlede olduğu; beyazın mata gidiyorsa pozitif döner.
function mateDistance(cp) {
    if (!isMateScore(cp) || cp <= 0) return 0
    const moves = Math.round((10000 - cp) / 100)
    return moves > 0 && moves <= REVIEW_MAT_STEPS ? moves : 0
}

// Oyuncuya sıra: ok oynayacağı kareyi gösterir, hareketsiz kalırsa motor
// oynar.
function promptExercise() {
    if (!exercise) return
    const uci = exercise.plies[exercise.step]
    if (!uci) return endExercise()

    drawMoveArrow(uci, true)
    markSuggestion(uci)
    // Damga ("N HAMLEDE MAT!") tahtanın yeniden çizimiyle birlikte gelir.
    updateBoardStamp(viewPosition())
    demoLabel = (exercise.sans[exercise.step] || 'doğru hamle') + ' oyna'
    updateStatus()
    exercise.timer = window.setTimeout(playExpectedMove, EXERCISE_HINT_MS)
}

// Oyuncunun bıraktığı hamle: motorun önerdiğiyle aynı mı?
function playExerciseMove(source, target) {
    if (!exercise || exercise.step % 2 !== 0) return
    const uci = source + target
    if (uci === exercise.plies[exercise.step]) {
        applyExerciseMove(uci)
        return
    }

    // Yanlış: tahta değişmez, kareler kızarır.
    flashWrong(source, target)
    demoLabel = 'değil, tekrar dene'
    updateStatus()
}

// Hamleyi oynar ve sırayı ilerletir: sıra oyuncudaysa yeni hedefi gösterir,
// motordaysa motor kendi hamlesini oynar.
function applyExerciseMove(uci) {
    if (!exercise) return
    window.clearTimeout(exercise.timer)

    exercise.fen = positionAfter(uci, exercise.fen)
    exercise.step++
    showDemoFen(exercise.fen)
    flashLanding(uciTo(uci))
    clearMoveArrow()
    clearSuggestion()

    if (exercise.step >= exercise.plies.length) return endExercise()
    if (exercise.step % 2 === 1) {
        // Motora düşen savunma hamlesi kısa bir bekleyişten sonra oynanır.
        const next = exercise.plies[exercise.step]
        exercise.timer = window.setTimeout(function () { applyExerciseMove(next) }, EXERCISE_STEP_MS)
        return
    }
    promptExercise()
}

// Oyuncu hareketsiz kaldı: motor beklenen hamleyi oynar.
function playExpectedMove() {
    if (!exercise) return
    const uci = exercise.plies[exercise.step]
    if (!uci) return endExercise()
    applyExerciseMove(uci)
}

function endExercise() {
    if (!exercise) return
    const solved = exercise.step >= exercise.plies.length
    window.clearTimeout(exercise.timer)
    exercise = null
    clearMoveArrow()
    clearSuggestion()
    demoLabel = solved ? 'doğru oynadın' : ''
    updateStatus()
    updateBoardStamp(viewPosition())
}

// Yanlış hamlede kaynak ve hedef kare kızarıp titrer.
function flashWrong(from, to) {
    [from, to].forEach(function (square) {
        const el = document.querySelector('.square-' + square)
        if (!el) return
        el.classList.remove('move-wrong')
        // reflow: aynı sınıfın animasyonu yeniden başlasın
        void el.offsetWidth
        el.classList.add('move-wrong')
        window.setTimeout(function () { el.classList.remove('move-wrong') }, 600)
    })
}

// Önerilen hamle oynandıktan sonra kaynak ve hedef kare vurgulu kalır.
function markSuggestion(uci) {
    const fromEl = document.querySelector('.square-' + uci.slice(0, 2))
    const toEl = document.querySelector('.square-' + uciTo(uci))
    if (fromEl) fromEl.classList.add('suggest-from')
    if (toEl) toEl.classList.add('suggest-to')
}

function clearSuggestion() {
    document.querySelectorAll('.suggest-from, .suggest-to, .move-land').forEach(function (el) {
        el.classList.remove('suggest-from', 'suggest-to', 'move-land')
    })
}

// Parçanın indiği kare kısa süre parlar.
function flashLanding(square) {
    const el = document.querySelector('.square-' + square)
    if (!el) return
    el.classList.add('move-land')
    window.setTimeout(function () { el.classList.remove('move-land') }, 520)
}

function uciTo(uci) {
    return uci.slice(2, 4)
}

// Önerilen hamle oynanırsa oluşacak konum. Oyun nesnesine dokunmadan,
// ayrı bir tahta kopyası üzerinde hesaplanıyor.
function positionAfter(uci, fen) {
    const view = new Chess()
    view.load(fen)
    view.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : 'q'
    })
    return view.fen()
}

// chessboard.js ok çizmiyor; kaynak kareden hedef kareye oku kendimiz
// yerleştiriyoruz. Ok ucu hedef kareye girmesin diye gövde kare yarıçapı
// kadar kısaltılıyor.
function drawMoveArrow(uci, suggest) {
    clearMoveArrow()
    const boardEl = document.getElementById('board')
    const fromEl = document.querySelector('.square-' + uci.slice(0, 2))
    const toEl = document.querySelector('.square-' + uciTo(uci))
    if (!boardEl || !fromEl || !toEl) return

    const frame = boardEl.getBoundingClientRect()
    const from = fromEl.getBoundingClientRect()
    const to = toEl.getBoundingClientRect()
    const x1 = from.left - frame.left + from.width / 2
    const y1 = from.top - frame.top + from.height / 2
    const x2 = to.left - frame.left + to.width / 2
    const y2 = to.top - frame.top + to.height / 2
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)

    const arrow = document.createElement('div')
    arrow.className = 'move-arrow' + (suggest ? ' suggest' : '')
    arrow.style.left = x1 + 'px'
    arrow.style.top = (y1 - 5) + 'px'
    arrow.style.width = (length - from.width * 0.26) + 'px'
    arrow.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)'
    arrow.appendChild(document.createElement('div')).className = 'move-arrow-bar'
    boardEl.appendChild(arrow)
}

function clearMoveArrow() {
    document.querySelectorAll('#board .move-arrow').forEach(function (el) {
        el.remove()
    })
}

// UCI varyasyon satırını okunur SAN listesine çevirir.
function pvToSan(fen, pv) {
    const g = new Chess()
    g.load(fen)
    const sans = []
    for (let i = 0; i < pv.length; i++) {
        const uci = pv[i]
        const move = g.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.length === 5 ? uci[4] : 'q'
        })
        if (!move) break
        sans.push(move.san)
    }
    return sans
}


// =====================================================================
//  Durum metni
// =====================================================================

function updateStatus() {
    const statusEl = document.getElementById('status')
    // Oynatım sırasında tahta maç ortasındaki bir konumu gösteriyor; sıra
    // ve şah uyarısı ekrandaki konuma göre yazılır.
    const view = viewPosition()
    const playing = demoFen !== null
    let html = 'Sıra: ' + (view.turn() === 'w' ? 'Beyaz' : 'Siyah')

    if (!playing && game.game_over()) {
        html = '<span class="gameover">Oyun bitti: ' + escapeHtml(getGameOverMessage()) + '</span>'
    } else if (view.in_check()) {
        html += ' <span class="check">ŞAH!</span>'
    }
    if (currentHistoryIndex !== -1 || playing) {
        html += ' <span class="reviewing">(' + escapeHtml(demoLabel || 'geçmiş') + ')</span>'
    }
    statusEl.innerHTML = html
}

function getGameOverMessage() {
    if (game.in_checkmate()) return 'Şah ve mat'
    if (game.in_draw()) {
        if (game.in_stalemate()) return 'Beraberlik (pat)'
        if (game.in_insufficient_material()) return 'Beraberlik (yetersiz malzeme)'
        if (game.in_threefold_repetition()) return 'Beraberlik (3 kez tekrar)'
        return 'Beraberlik'
    }
    return 'Oyun bitti'
}


// =====================================================================
//  Motor hamlesi
// =====================================================================

function makeEngineMove() {
    if (game.game_over() || isNavigating) return
    if (!stockfishEngine) {
        window.setTimeout(makeEngineMove, 200)
        return
    }

    isEngineThinking = true
    updateStatus()

    const fen = game.fen()
    engineSearch(fen, eloToSettings(engineElo), null).then(function (best) {
        isEngineThinking = false

        // Arama kesildiyse motor sırasını bu turda oynayamayacak.
        if (!best) {
            if (!game.game_over() && !isNavigating) window.setTimeout(makeEngineMove, 200)
            updateStatus()
            return
        }

        const move = game.move({
            from: best.slice(0, 2),
            to: best.slice(2, 4),
            promotion: best.length === 5 ? best[4] : undefined
        })

        if (move === null) {
            console.error('Yasadışı motor hamlesi:', best)
            updateStatus()
            return
        }

        addMoveToHistory(move)
        refresh()

        if (game.game_over()) return
    })
}


// =====================================================================
//  Kontroller
// =====================================================================

function refresh() {
    updateBoard()
    updateHistoryDisplay()
    updateNavigationButtons()
    updateOpeningDisplay()
    updateReviewPanel()
    updateStatus()
}


// =====================================================================
//  Açılış adı
// =====================================================================

// Oynanan hamlelerin en uzun eşleşen öneki bulur. Bilinen bir açılış yoksa
// ilk birkaç hamleden düşen kaba sınıflandırma devreye girer, yani ekranda
// neredeyse her zaman bir isim görünür.
function updateOpeningDisplay() {
    const el = document.getElementById('openingName')
    if (!el) return

    if (moveHistory.length === 0) {
        el.textContent = 'Henüz açılış yok'
        el.classList.add('muted')
        return
    }

    const found = detectOpening(moveHistory.map(function (m) { return m.san }))
    if (!found) {
        el.textContent = 'Açılış tanınmıyor'
        el.classList.add('muted')
        return
    }

    el.classList.remove('muted')
    el.innerHTML = '<span class="eco">' + found.eco + '</span> ' + escapeHtml(found.name)
}

function resetGame() {
    interruptSearch()
    game.reset()
    moveHistory = []
    currentHistoryIndex = -1
    isEngineThinking = false
    isNavigating = false
    resetGameReview()

    if (stockfishEngine) {
        stockfishEngine.postMessage('ucinewgame')
        stockfishEngine.postMessage('isready')
    }

    board.start()
    refresh()
    // Kartlar maç başına: yeni oyunda Rough Like'ta yeniden çekilir.
    clearHand()
    if (gameMode === 'rough') openDraft()
}

function flipBoard() {
    // Yalnızca görünümü çevir; oynanan renk değişmez. orientation() "white"/"black"
    // döndürdüğü için karşılaştırmak yerine kütüphanenin flip()'ini kullanıyoruz.
    board.flip()
}

function updateEloDisplay(elo) {
    engineElo = elo
    document.getElementById('eloValue').textContent = elo

    const settings = eloToSettings(elo)
    document.getElementById('eloDetail').textContent =
        'Seviye ' + settings.skill + ' · Derinlik ' + settings.depth

    document.querySelectorAll('.elo-preset').forEach(function (btn) {
        btn.classList.toggle('active', parseInt(btn.dataset.elo, 10) === elo)
    })
    // Ayar bir sonraki aramada uygulanır; oynanmakta olan hamleyi kesmiyoruz.
}


// =====================================================================
//  Maç arşivi
// =====================================================================

function loadArchive() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed : []
    } catch (e) {
        console.error('Arşiv okunamadı:', e)
        return []
    }
}

function storeArchive(list) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch (e) {
        console.error('Arşiv yazılamadı:', e)
    }
}

// Maç sonucu: kazanan taraf veya beraberlik. Oyun bitmemişse null.
function currentResult() {
    if (!game.game_over()) return null
    if (game.in_checkmate()) return game.turn() === 'w' ? 'Siyah kazandı (mat)' : 'Beyaz kazandı (mat)'
    return 'Beraberlik · ' + getGameOverMessage()
}

function saveGame() {
    if (moveHistory.length === 0) {
        alert('Kaydedilecek hamle yok.')
        return
    }

    const list = loadArchive()
    const opening = detectOpening(moveHistory.map(function (m) { return m.san }))

    list.unshift({
        id: Date.now(),
        tarih: new Date().toISOString(),
        elo: engineElo,
        sonuc: currentResult(),
        acilis: opening ? opening.eco + ' ' + opening.name : 'Bilinmiyor',
        hamleler: moveHistory.map(function (m) {
            return { san: m.san, kartlar: m.kartlar || null }
        })
    })

    // Tarayıcı kotasını doldurmamak için en eski 50 maçı tutuyoruz.
    storeArchive(list.slice(0, 50))
    updateArchiveCount()
    renderArchive()
}

// Kayıtlı maçı yeniden kurar: SAN listesini oynayıp kartları da aynı
// sırayla uyguluyoruz, böylece kayıt defteri, tahta ve gezinme birebir
// eskisi gibi çalışıyor. Kartlar yalnızca SAN olarak saklanırsa Rough Like
// maçı tahtasız, üstelik eldeki kartlarla birlikte geri yüklenirdi.
function loadSavedGame(id) {
    const entry = loadArchive().find(function (m) { return m.id === id })
    if (!entry) return

    interruptSearch()
    game.reset()
    moveHistory = []
    currentHistoryIndex = -1
    isEngineThinking = false
    isNavigating = false
    resetGameReview()
    clearHand()

    for (let i = 0; i < entry.hamleler.length; i++) {
        const record = entry.hamleler[i]
        const move = game.move(typeof record === 'string' ? record : record.san)
        if (move === null) break
        addMoveToHistory(move)
        if (!record.kartlar) continue
        record.kartlar.forEach(function (c) { applyCard(c.id, c.kare) })
        moveHistory[i].fen = game.fen()
        moveHistory[i].kartlar = record.kartlar
    }

    if (stockfishEngine) stockfishEngine.postMessage('ucinewgame')

    closeArchive()
    refresh()
}

function deleteSavedGame(id) {
    storeArchive(loadArchive().filter(function (m) { return m.id !== id }))
    updateArchiveCount()
    renderArchive()
}

function formatDate(iso) {
    const d = new Date(iso)
    const pad = function (n) { return n < 10 ? '0' + n : String(n) }
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function renderArchive() {
    const list = document.getElementById('archiveList')
    if (!list) return

    const games = loadArchive()
    if (games.length === 0) {
        list.innerHTML = '<div class="archive-empty">Kayıtlı maç yok. Oynadığın maçı "Kaydet" ile saklayabilirsin.</div>'
        return
    }

    list.innerHTML = games.map(function (m) {
        return '<div class="archive-item">'
            + '<div class="archive-meta">'
            + '<span class="archive-date">' + formatDate(m.tarih) + '</span>'
            + '<span class="archive-result">' + escapeHtml(m.sonuc || 'Yarım kaldı') + '</span>'
            + '</div>'
            + '<div class="archive-open">' + escapeHtml(m.acilis)
            + ' · ELO ' + m.elo + ' · ' + m.hamleler.length + ' hamle</div>'
            + '<div class="archive-actions">'
            + '<button type="button" class="archive-load" data-id="' + m.id + '">Yükle</button>'
            + '<button type="button" class="archive-del" data-id="' + m.id + '">Sil</button>'
            + '</div>'
            + '</div>'
    }).join('')

    list.querySelectorAll('.archive-load').forEach(function (btn) {
        btn.addEventListener('click', function () {
            loadSavedGame(parseInt(btn.dataset.id, 10))
        })
    })
    list.querySelectorAll('.archive-del').forEach(function (btn) {
        btn.addEventListener('click', function () {
            deleteSavedGame(parseInt(btn.dataset.id, 10))
        })
    })
}

function openArchive() {
    const overlay = document.getElementById('archiveOverlay')
    if (!overlay) return
    renderArchive()
    overlay.hidden = false
}

function closeArchive() {
    const overlay = document.getElementById('archiveOverlay')
    if (overlay) overlay.hidden = true
}

function updateArchiveCount() {
    const el = document.getElementById('archiveCount')
    if (el) el.textContent = loadArchive().length
}

// =====================================================================
//  Oyun modu
// =====================================================================

const GAME_MODES = {
    classic: { label: 'Klasik', ready: true },
    rough: { label: 'Rough Like', ready: true }
}

// Oyuncu bir mod seçmeden bu null: rozet, seçim yapılana kadar görünmez.
let gameMode = null

function updateModeBadge() {
    const el = document.getElementById('modeBadge')
    if (!el) return
    const def = gameMode ? GAME_MODES[gameMode] : null
    el.textContent = def ? def.label : ''
    el.hidden = !def
}


// =====================================================================
//  Rough Like kartları
// =====================================================================
//
// Deste kartları cards.js'de. Yalnızca uygulanmış kartlar desteye girer;
// dondurma, zehirli taş ve şah+ motorun kör olduğu ya da özel hamle üretimi
// gerektiren kurallar, onlar bitene kadar listede yok.
//
// Kart eylemleri saf fonksiyon: verilen Chess örneğini değiştirir. Oynanan
// Chess'e bağlı olmadığı için kaydedilmiş maç da kartlarla birebir
// yeniden kurulabilir.

const CARD_ACTIONS = {
    'pawn-rook': {
        prompt: 'Kale olacak kendi piyonunu seç.',
        canTarget: function (g, sq) {
            const p = g.get(sq)
            return !!p && p.type === 'p' && p.color === HUMAN_COLOR
        },
        apply: function (g, sq) {
            g.remove(sq)
            g.put({ type: 'r', color: HUMAN_COLOR }, sq)
            return 'Piyon kaleye dönüştü.'
        }
    },
    'bishop-knight': {
        prompt: 'Filini at ya da atını fil yap: kendi taşını seç.',
        canTarget: function (g, sq) {
            const p = g.get(sq)
            return !!p && p.color === HUMAN_COLOR && (p.type === 'b' || p.type === 'n')
        },
        apply: function (g, sq) {
            const piece = g.get(sq)
            const to = piece.type === 'b' ? 'n' : 'b'
            g.remove(sq)
            g.put({ type: to, color: HUMAN_COLOR }, sq)
            return to === 'n' ? 'Fil at oldu.' : 'At fil oldu.'
        }
    },
    'pawn-queen': {
        prompt: 'Vezir olacak kendi piyonunu seç.',
        canTarget: function (g, sq) {
            const p = g.get(sq)
            return !!p && p.type === 'p' && p.color === HUMAN_COLOR
        },
        apply: function (g, sq) {
            g.remove(sq)
            g.put({ type: 'q', color: HUMAN_COLOR }, sq)
            return 'Piyon vezire dönüştü.'
        }
    },
    'rook-bishop': {
        prompt: 'Kalesini fil yap veya filini kale yap: kendi taşını seç.',
        canTarget: function (g, sq) {
            const p = g.get(sq)
            return !!p && p.color === HUMAN_COLOR && (p.type === 'r' || p.type === 'b')
        },
        apply: function (g, sq) {
            const piece = g.get(sq)
            const to = piece.type === 'r' ? 'b' : 'r'
            g.remove(sq)
            g.put({ type: to, color: HUMAN_COLOR }, sq)
            return to === 'b' ? 'Kale fil oldu.' : 'Fil kale oldu.'
        }
    },
    'color-flip': {
        prompt: 'Rengi değişecek taşı seç (kendi veya rakip). Vezir ve şah olmaz.',
        canTarget: function (g, sq) {
            const p = g.get(sq)
            return !!p && (p.type === 'p' || p.type === 'n' || p.type === 'b' || p.type === 'r')
        },
        apply: function (g, sq) {
            const piece = g.get(sq)
            const to = piece.color === 'w' ? 'b' : 'w'
            g.remove(sq)
            g.put({ type: piece.type, color: to }, sq)
            return to === 'w' ? 'Taş sana geçti.' : 'Taş rakibe geçti.'
        }
    }
}

let cardHand = []        // eldeki kartlar
let armedCard = null     // hedef bekleyen kartın id'si
let draftDeal = []       // çekilen kartlar
let draftPicks = []      // seçilen kart id'leri
let draftRevealed = {}   // bir kez çevrilmiş kartlar
let pendingCards = []   // ilk hamleden önce oynanmış, sıradaki hamleye bağlanacak kartlar

function cardById(id) {
    return CARD_DECK.find(function (c) { return c.id === id }) || null
}

function allSquares() {
    const out = []
    for (let f = 0; f < 8; f++) {
        for (let r = 1; r <= 8; r++) out.push('abcdefgh'[f] + r)
    }
    return out
}

function shuffle(list) {
    const out = list.slice()
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = out[i]
        out[i] = out[j]
        out[j] = tmp
    }
    return out
}

function buildCardEl(card) {
    const el = document.createElement('div')
    el.className = 'card'
    el.dataset.id = card.id
    el.tabIndex = 0
    el.setAttribute('role', 'button')
    el.innerHTML =
        '<div class="card-inner">' +
        '<div class="card-face card-back">' + cardBack() + '</div>' +
        '<div class="card-face card-front">' + cardArt(card.id) +
        '<span class="card-name">' + escapeHtml(card.name) + '</span>' +
        '<span class="card-desc">' + escapeHtml(card.desc) + '</span>' +
        (card.longDesc ? '<span class="card-long-desc">' + escapeHtml(card.longDesc) + '</span>' : '') +
        '</div></div>'
    return el
}

// --- Çekme ekranı -----------------------------------------------------

function openDraft() {
    const overlay = document.getElementById('draftOverlay')
    if (!overlay) return
    draftDeal = shuffle(CARD_DECK).slice(0, DRAFT_DEAL)
    draftPicks = []
    draftRevealed = {}
    const pickCount = document.getElementById('draftPickCount')
    if (pickCount) pickCount.textContent = DRAFT_PICK
    renderDraft()
    overlay.hidden = false
}

function renderDraft() {
    const row = document.getElementById('draftCards')
    if (!row) return
    row.innerHTML = ''
    draftDeal.forEach(function (card) {
        const picked = draftPicks.indexOf(card.id) !== -1
        const el = buildCardEl(card)
        if (picked || draftRevealed[card.id]) el.classList.add('is-flipped')
        if (picked) el.classList.add('is-picked')
        el.setAttribute('aria-label', card.name + ' - ' + card.desc)
        el.addEventListener('click', function () { toggleDraftPick(card.id) })
        el.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            toggleDraftPick(card.id)
        })
        row.appendChild(el)
    })

    const count = document.getElementById('draftCount')
    if (count) count.textContent = draftPicks.length
    const confirm = document.getElementById('draftConfirm')
    if (confirm) confirm.disabled = draftPicks.length !== DRAFT_PICK
    const hint = document.getElementById('draftHint')
    if (hint) {
        hint.textContent = draftPicks.length === DRAFT_PICK
            ? 'Hazır. Kartlar bedava kullanılır, sıranı bitirmez.'
            : (DRAFT_PICK - draftPicks.length) + ' kart daha seç.'
    }
}

function toggleDraftPick(id) {
    const at = draftPicks.indexOf(id)
    if (at !== -1) {
        draftPicks.splice(at, 1)
    } else {
        if (draftPicks.length >= DRAFT_PICK) return
        draftPicks.push(id)
    }
    draftRevealed[id] = true
    renderDraft()
}

function confirmDraft() {
    if (draftPicks.length !== DRAFT_PICK) return
    cardHand = draftPicks.map(cardById).filter(Boolean)
    const overlay = document.getElementById('draftOverlay')
    if (overlay) overlay.hidden = true
    renderHand()
}

// --- El ---------------------------------------------------------------

function renderHand() {
    const section = document.getElementById('handSection')
    const row = document.getElementById('handCards')
    if (!section || !row) return
    section.hidden = cardHand.length === 0
    row.innerHTML = ''
    cardHand.forEach(function (card) {
        const el = buildCardEl(card)
        el.classList.add('is-flipped')
        el.setAttribute('aria-label', card.name + ' kartını oyna')
        el.addEventListener('click', function () { armCard(card.id) })
        row.appendChild(el)
    })
    if (!armedCard) setHandHint('')
}

function setHandHint(text) {
    const el = document.getElementById('handHint')
    if (el) el.textContent = text || ''
}

function clearCardTargets() {
    document.querySelectorAll('#board .square-55d63.card-target').forEach(function (el) {
        el.classList.remove('card-target')
    })
}

function markCardTargets(action) {
    clearCardTargets()
    allSquares().forEach(function (sq) {
        if (!action.canTarget(game, sq)) return
        const el = document.querySelector('#board .square-' + sq)
        if (el) el.classList.add('card-target')
    })
}

function disarmCard() {
    armedCard = null
    clearCardTargets()
    document.querySelectorAll('#handCards .card').forEach(function (el) {
        el.classList.remove('is-armed')
    })
    setHandHint('')
}

function armCard(id) {
    if (armedCard === id) return disarmCard()
    if (isEngineThinking || isNavigating || matchIsOver()) return
    const action = CARD_ACTIONS[id]
    if (!action) return
    // Kart sırayı bitirmez; önce hedefi seçilmeli.
    armedCard = id
    markCardTargets(action)
    document.querySelectorAll('#handCards .card').forEach(function (el) {
        el.classList.toggle('is-armed', el.dataset.id === id)
    })
    setHandHint(action.prompt)
}

function playCard(id, square) {
    const action = CARD_ACTIONS[id]
    if (!action) return
    if (!action.canTarget(game, square)) {
        disarmCard()
        return
    }

    const message = action.apply(game, square)
    cardHand = cardHand.filter(function (c) { return c.id !== id })

    // Kart bir hamle değil; oynandığı konumun kendisidir. Kaydın FEN'i kart
    // uygulandıktan sonra yeniden yazılır, böylece o konuma her dönüldüğünde
    // tahta aynı hâlde olur ve kart ikinci kez oynanmaz. İlk hamleden önce
    // oynanırsa henüz kayıt yok; sıradaki hamlenin kaydına eklenmek üzere
    // bekletilir.
    const index = currentHistoryIndex === -1 ? moveHistory.length - 1 : currentHistoryIndex
    // Geçmişteki bir konumda kart oynanırsa sonrasındaki hamleler artık o
    // konumdan türemediği için dal budanır; normal hamlede de böyle yapılır.
    if (index < moveHistory.length - 1) moveHistory = moveHistory.slice(0, index + 1)
    currentHistoryIndex = -1

    if (index >= 0) {
        moveHistory[index].fen = game.fen()
        if (!moveHistory[index].kartlar) moveHistory[index].kartlar = []
        moveHistory[index].kartlar.push({ id: id, kare: square })
    } else {
        pendingCards.push({ id: id, kare: square })
    }

    disarmCard()
    renderHand()
    refresh()

    // Kart sonrası oyun bitti mi? (ör. renk değiştirme ile şah mat verebiliyorsa)
    if (game.game_over()) {
        setHandHint(message + ' Oyun bitti!')
        return
    }

    setHandHint(message + ' Sıran sende, hamleni oyna.')
}

// Kartı tahtaya uygular; geçmişe yazma işi çağıranın sorumluluğunda.
function applyCard(id, square) {
    const action = CARD_ACTIONS[id]
    if (action) action.apply(game, square)
}

function clearHand() {
    disarmCard()
    cardHand = []
    pendingCards = []
    renderHand()
}
// =====================================================================
//  Kart Çekme Animasyonu
// =====================================================================

let drawAnimationsQueue = []  // bekleyen çekme animasyonları
let isDrawingCard = false     // animasyon devam ediyor mu

// Kart yuvası pozisyonunu al
function getDeckSlotRect() {
    const slot = document.getElementById('cardDeckSlot')
    if (!slot) return null
    return slot.getBoundingClientRect()
}

// El kartları konteynır pozisyonunu al
function getHandCardsRect() {
    const hand = document.getElementById('handCards')
    if (!hand) return null
    return hand.getBoundingClientRect()
}

// Animasyonlu kart elementi oluştur
function createAnimatedCard(card, startRect, endRect) {
    const el = document.createElement('div')
    el.className = 'animated-card'
    el.dataset.id = card.id
    el.style.left = startRect.left + 'px'
    el.style.top = startRect.top + 'px'
    el.style.zIndex = '1000'

    // Rastgele başlangıç rotasyonu (deste karışık durumu)
    const startRot = (Math.random() - 0.5) * 30  // -15 ile 15 derece arası
    const liftRot = (Math.random() - 0.5) * 20
    const midRot = (Math.random() - 0.5) * 10
    const endRot = (Math.random() - 0.5) * 5
    const finalRot = (Math.random() - 0.5) * 3

    // CSS custom properties for animation keyframes
    el.style.setProperty('--start-x', '0px')
    el.style.setProperty('--start-y', '0px')
    el.style.setProperty('--start-rot', startRot + 'deg')
    el.style.setProperty('--lift-x', (endRect.left - startRect.left - 40) + 'px')
    el.style.setProperty('--lift-y', (endRect.top - startRect.top - 120) + 'px')
    el.style.setProperty('--lift-rot', liftRot + 'deg')
    el.style.setProperty('--mid-x', (endRect.left - startRect.left - 10) + 'px')
    el.style.setProperty('--mid-y', (endRect.top - startRect.top - 30) + 'px')
    el.style.setProperty('--mid-rot', midRot + 'deg')
    el.style.setProperty('--end-x', (endRect.left - startRect.left) + 'px')
    el.style.setProperty('--end-y', (endRect.top - startRect.top) + 'px')
    el.style.setProperty('--end-rot', endRot + 'deg')
    el.style.setProperty('--final-x', (endRect.left - startRect.left) + 'px')
    el.style.setProperty('--final-y', (endRect.top - startRect.top) + 'px')
    el.style.setProperty('--final-rot', finalRot + 'deg')

    el.innerHTML =
        '<div class="card-inner">' +
        '<div class="card-face card-back">' + cardBack() + '</div>' +
        '<div class="card-face card-front">' + cardArt(card.id) +
        '<span class="card-name">' + escapeHtml(card.name) + '</span>' +
        '<span class="card-desc">' + escapeHtml(card.desc) + '</span>' +
        (card.longDesc ? '<span class="card-long-desc">' + escapeHtml(card.longDesc) + '</span>' : '') +
        '</div></div>'

    document.body.appendChild(el)
    return el
}

// Kart çekme animasyonu oynat
function animateDrawCard(card, onComplete) {
    if (isDrawingCard) {
        drawAnimationsQueue.push({ card, onComplete })
        return
    }

    isDrawingCard = true

    const deckRect = getDeckSlotRect()
    const handRect = getHandCardsRect()

    if (!deckRect || !handRect) {
        isDrawingCard = false
        if (onComplete) onComplete()
        processDrawQueue()
        return
    }

    // Hedef pozisyon: el kartları alanının sonuna (sağ taraf)
    const cardsInHand = document.querySelectorAll('#handCards .card').length
    const cardWidth = 78  // CSSdeki hand-cards .card width
    const gap = 10
    const targetX = handRect.left + cardsInHand * (cardWidth + gap) + cardWidth / 2
    const targetY = handRect.top + handRect.height / 2

    const endRect = {
        left: targetX - cardWidth / 2,
        top: targetY - 112 / 2,  // kart yüksekliği 112px
        width: cardWidth,
        height: 112
    }

    const animatedEl = createAnimatedCard(card, deckRect, endRect)

    // Animasyon başlat
    requestAnimationFrame(() => {
        animatedEl.style.animation = 'card-draw 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards'

        // Yarım saniyede flip başlat
        setTimeout(() => {
            animatedEl.classList.add('flipping')
        }, 400)

        // Animasyon bitiş
        setTimeout(() => {
            animatedEl.remove()
            isDrawingCard = false
            if (onComplete) onComplete()
            processDrawQueue()
        }, 850)
    })
}

// Kuyruktaki animasyonları işle
function processDrawQueue() {
    if (drawAnimationsQueue.length > 0 && !isDrawingCard) {
        const next = drawAnimationsQueue.shift()
        animateDrawCard(next.card, next.onComplete)
    }
}

// Birden fazla kart çek (staggered)
function drawCards(cards, onAllComplete) {
    if (!cards || cards.length === 0) {
        if (onAllComplete) onAllComplete()
        return
    }

    let completed = 0
    const total = cards.length

    cards.forEach((card, index) => {
        // Her kart arası 150ms gecikme
        setTimeout(() => {
            animateDrawCard(card, () => {
                completed++
                if (completed === total && onAllComplete) onAllComplete()
            })
        }, index * 150)
    })
}

// Deck slot tıklama handler
function onDeckSlotClick() {
    if (isEngineThinking || isNavigating || matchIsOver()) return
    if (armedCard) return disarmCard()

    // El dolu mu kontrol et (max 5 kart)
    if (cardHand.length >= 5) {
        setHandHint('El dolu! Önce bir kart oyna.')
        return
    }

    // Desteden rastgele kart çek
    const remainingDeck = CARD_DECK.filter(c => !cardHand.some(h => h.id === c.id))
    if (remainingDeck.length === 0) {
        setHandHint('Deste boş!')
        return
    }

    const randomIndex = Math.floor(Math.random() * remainingDeck.length)
    const drawnCard = remainingDeck[randomIndex]

    // Deck count güncelle
    updateDeckCount(remainingDeck.length - 1)

    // Animasyon oynat, bitince kartı ela ekle
    animateDrawCard(drawnCard, () => {
        cardHand.push(drawnCard)
        renderHand()
        updateDeckCount(remainingDeck.length - 1)
    })
}

// Deck sayacını güncelle
function updateDeckCount(count) {
    const countEl = document.getElementById('deckCount')
    if (countEl) countEl.textContent = count
}

// İlk oyun başlangıcında deck count ayarla
function initDeckCount() {
    updateDeckCount(CARD_DECK.length)
}


// =====================================================================
//  Oyun modu
// =====================================================================

function selectMode(mode) {
    const def = GAME_MODES[mode]
    if (!def || !def.ready) return false
    gameMode = mode
    const overlay = document.getElementById('modeOverlay')
    if (overlay) overlay.hidden = true
    updateModeBadge()
    if (mode === 'rough') openDraft()
    else clearHand()
    return true
}

function initModeSelect() {
    const overlay = document.getElementById('modeOverlay')
    if (!overlay) return
    updateModeBadge()

    overlay.querySelectorAll('.mode-card').forEach(function (card) {
        const def = GAME_MODES[card.dataset.mode]
        if (!def || !def.ready) return
        card.addEventListener('click', function () {
            selectMode(card.dataset.mode)
        })
    })

    document.addEventListener('keydown', function (e) {
        if (overlay.hidden || e.key !== 'Enter') return
        selectMode('classic')
    })
}

function initCards() {
    const confirm = document.getElementById('draftConfirm')
    if (confirm) confirm.addEventListener('click', confirmDraft)

    // Deck slot click handler
    const deckSlot = document.getElementById('cardDeckSlot')
    if (deckSlot) {
        deckSlot.addEventListener('click', onDeckSlotClick)
        deckSlot.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onDeckSlotClick()
            }
        })
    }

    // Initialize deck count
    initDeckCount()

    const boardEl = document.getElementById('board')
    if (boardEl) {
        // chessboard.js karelerdeki mousedown'u kendi sürükleme mantığına
        // çevirip click olayını hiç oluşturmuyor. Bu yüzden hedef seçimi
        // capture fazında, kendi işleyicisinden önce yakalanıyor.
        boardEl.addEventListener('mousedown', function (e) {
            if (!armedCard) return
            const sqEl = e.target.closest('[data-square]')
            if (!sqEl) return
            e.stopPropagation()
            e.preventDefault()
            playCard(armedCard, sqEl.dataset.square)
        }, true)
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && armedCard) disarmCard()
        // Boşluk tuşu ile kart çek
        if (e.key === ' ' && !armedCard && !isEngineThinking && !isNavigating && !matchIsOver()) {
            const activeEl = document.activeElement
            // Sadece input/textarea/select değilse
            // Sadece input/textarea/select değilse
            if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA' && activeEl.tagName !== 'SELECT')) {
                e.preventDefault()
                onDeckSlotClick()
            }
        }
    })
}

window.onload = function () {
    initBoard()
    initModeSelect()
    initCards()

    const eloSlider = document.getElementById('eloSlider')
    if (eloSlider) {
        initEloBounds()
        updateEloDisplay(parseInt(eloSlider.value, 10))
    }
    refresh()

    try {
        stockfishEngine = new Worker('stockfish.js')
    } catch (e) {
        console.error('Stockfish worker oluşturulamadı:', e)
        alert('Stockfish worker oluşturulamadı. Konsolu kontrol edin.')
        return
    }

    stockfishEngine.onmessage = function (event) {
        const line = String(event.data)

        if (line.indexOf('info') === 0) {
            // Satırlar yalnızca aramayı başlatan kancaya gider: canlı
            // değerlendirme ekrandaki konumu ölçer, maç incelemesi kendi
            // konumunu; ikisi birbirinin satırlarını göremez.
            if (activeSearch && activeSearch.onInfo) {
                activeSearch.onInfo(line, activeSearch.sideToMove)
            }
            return
        }

        if (line.indexOf('bestmove') === 0) {
            const search = activeSearch
            if (!search) return
            // Kesilmiş bir aramanın gecikmeli yanıtı yeni aramayı bozmasın.
            if (search.token !== searchToken) return
            activeSearch = null
            const best = line.split(' ')[1]
            if (search.onStopped) search.onStopped()
            if (search.onBest) search.onBest(best === '(none)' ? null : best)
        }
    }

    stockfishEngine.postMessage('uci')
    stockfishEngine.postMessage('isready')
    stockfishEngine.postMessage('setoption name Skill Level value ' + eloToSettings(engineElo).skill)

    document.getElementById('resetBtn').addEventListener('click', resetGame)
    document.getElementById('flipBtn').addEventListener('click', flipBoard)
    document.getElementById('prevMoveBtn').addEventListener('click', goToPrevMove)
    document.getElementById('nextMoveBtn').addEventListener('click', goToNextMove)
    // Defter oyunun kendisidir; temizlemek tahtayı da sıfırlar.
    document.getElementById('clearHistoryBtn').addEventListener('click', resetGame)
    document.getElementById('analyzeBtn').addEventListener('click', startGameReview)
    document.getElementById('saveGameBtn').addEventListener('click', saveGame)
    document.getElementById('archiveBtn').addEventListener('click', openArchive)
    document.getElementById('archiveClose').addEventListener('click', closeArchive)
    document.getElementById('archiveOverlay').addEventListener('click', function (e) {
        if (e.target === this) closeArchive()
    })
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeArchive()
    })
    window.addEventListener('resize', handleResize)

    eloSlider.addEventListener('input', function (e) {
        const val = Math.round(parseInt(e.target.value, 10) / 50) * 50
        eloSlider.value = val
        updateEloDisplay(val)
    })

    document.querySelectorAll('.elo-preset').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const elo = parseInt(btn.dataset.elo, 10)
            eloSlider.value = elo
            updateEloDisplay(elo)
        })
    })

    updateArchiveCount()
}
