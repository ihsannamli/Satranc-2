// Rough Like kartları: pixel-art görseller ve kart tanımları.
// Görseller SVG olarak üretilir; ayrı resim dosyası yoktur. Tüm çizim
// "crispEdges" ile kare piksellere oturur, böylece ölçeklenince de bulanıklaşmaz.

// Yatay ardışık pikselleri tek rect'te birleştirir. Deseni elle yazabilmek
// için: her satır bir dizgi, '#' piksel, '.' boşluk.
function pixels(rows, ox, oy) {
    let out = ''
    rows.forEach(function (row, y) {
        let x = 0
        while (x < row.length) {
            if (row[x] !== '#') {
                x++
                continue
            }
            let run = 1
            while (x + run < row.length && row[x + run] === '#') run++
            out += '<rect x="' + (ox + x) + '" y="' + (oy + y) + '" width="' + run + '" height="1"/>'
            x += run
        }
    })
    return out
}

function svg(body, w, h) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges" ' +
        'preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' + body + '</svg>'
}

// Kart 30x44 birim (oran 150:216, referans kartla aynı). 1 birim = 5 CSS px.
const CARD_W = 30
const CARD_H = 44
const RED = '#c8263a'
const CREAM = '#f6efe4'
const INK = '#2b2b33'

// ---------------------------------------------------------------------
//  Kart sırtı
// ---------------------------------------------------------------------

// Referans desen seyrek: ince beyaz kafes, aralarında bol kırmızı. Kalın
// motif kafeye dönüşüp gürültüye benziyor, bu yüzden içi boş elmas halkası
// kullanılıyor. Komşu elmaslar köşe pikseliyle birbirine bağlanıyor.
const BACK_MOTIF = [
    '....#....',
    '...#.#...',
    '..#...#..',
    '.#.....#.',
    '#.......#',
    '.#.....#.',
    '..#...#..',
    '...#.#...',
    '....#....'
]

// Kafes kesişimindeki bağlantı parçası.
const BACK_NODE = [
    '.##.',
    '####',
    '####',
    '.##.'
]

// Köşedeki piyon simgesi — kartın kimlik işareti.
const PAWN_ICON = [
    '..####..',
    '.######.',
    '.######.',
    '..####..',
    '..####..',
    '.######.',
    '########',
    '...##...'
]

function backNodes() {
    return '<g fill="#ffffff">' +
        pixels(BACK_NODE, 8, 8) +
        pixels(BACK_NODE, 17, 8) +
        pixels(BACK_NODE, 8, 17) +
        pixels(BACK_NODE, 17, 17) +
        '</g>'
}

function cardBack() {
    let body = ''
    body += '<rect x="0" y="0" width="' + CARD_W + '" height="' + CARD_H + '" fill="#ffffff"/>'
    body += '<rect x="2" y="2" width="26" height="40" fill="' + RED + '"/>'
    body += '<pattern id="cardLattice" width="9" height="9" patternUnits="userSpaceOnUse">' +
        '<g fill="#ffffff">' + pixels(BACK_MOTIF, 0, 0) + '</g></pattern>'
    body += '<rect x="3" y="3" width="24" height="38" fill="url(#cardLattice)"/>'
    body += backNodes()
    // Çerçeve içi ince beyaz ana çizgi
    body += '<g fill="#ffffff">' +
        '<rect x="3" y="3" width="24" height="1"/>' +
        '<rect x="3" y="40" width="24" height="1"/>' +
        '<rect x="3" y="3" width="1" height="38"/>' +
        '<rect x="26" y="3" width="1" height="38"/>' +
        '</g>'
    // Sol üst köşede piyon
    body += '<g fill="' + CREAM + '">' + pixels(PAWN_ICON, 3.5, 3.5) + '</g>'
    return svg(body, CARD_W, CARD_H)
}

// ---------------------------------------------------------------------
//  Kart ön yüzleri - yetenek temalı pixel art
// ---------------------------------------------------------------------

// Çizimler 7x7 birim; iç alan x 4..26 (22 birim), y 4..33.
const ART_PAWN = [
    '..###..',
    '.#####.',
    '.#####.',
    '..###..',
    '..###..',
    '#######',
    '...#...'
]

const ART_ROOK = [
    '#######',
    '..###..',
    '..###..',
    '.#####.',
    '.#####.',
    '#######',
    '..###..'
]

const ART_KNIGHT = [
    '.##....',
    '####...',
    '####.##',
    '.#####.',
    '.####..',
    '##.##..',
    '##.....'
]

const ART_BISHOP = [
    '..##..',
    '.####.',
    '.####.',
    '..#.#.',
    '..##..',
    '.####.',
    '#######'
]
const ART_QUEEN = [
    '..###..',
    '.#####.',
    '#######',
    '..###..',
    '.#####.',
    '.#####.',
    '..###..'
]

const ART_ARROW = [
    '...#',
    '..##',
    '#####',
    '..##',
    '...#'
]

// İç alan: krem bant x 4..26, y 4..33; isim bandı altta.
function cardFront(artBody) {
    let body = ''
    body += '<rect x="0" y="0" width="' + CARD_W + '" height="' + CARD_H + '" fill="#ffffff"/>'
    body += '<rect x="2" y="2" width="26" height="40" fill="' + RED + '"/>'
    body += '<rect x="4" y="4" width="22" height="29" fill="' + CREAM + '"/>'
    body += artBody
    body += '<rect x="4" y="34" width="22" height="6" fill="' + INK + '"/>'
    return svg(body, CARD_W, CARD_H)
}

function cardArt(id) {
    if (id === 'pawn-rook') {
        return cardFront(
            '<g fill="' + INK + '">' +
            pixels(ART_PAWN, 4, 15) +
            pixels(ART_ROOK, 19, 15) +
            '</g>' +
            '<g fill="' + RED + '">' + pixels(ART_ARROW, 12, 16) + '</g>'
        )
    }
    if (id === 'bishop-knight') {
        return cardFront(
            '<g fill="' + INK + '">' +
            pixels(ART_BISHOP, 5, 10) +
            pixels(ART_KNIGHT, 18, 10) +
            '</g>' +
            '<g fill="' + RED + '">' +
            pixels(ART_ARROW, 8, 21) +
            '<g transform="translate(22,25) scale(-1,1)">' + pixels(ART_ARROW, 0, 0) + '</g>' +
            '</g>'
        )
    }
    if (id === 'pawn-queen') {
        return cardFront(
            '<g fill="' + INK + '">' +
            pixels(ART_PAWN, 4, 15) +
            pixels(ART_QUEEN, 19, 15) +
            '</g>' +
            '<g fill="' + RED + '">' + pixels(ART_ARROW, 12, 16) + '</g>'
        )
    }
    if (id === 'rook-bishop') {
        return cardFront(
            '<g fill="' + INK + '">' +
            pixels(ART_ROOK, 5, 10) +
            pixels(ART_BISHOP, 18, 10) +
            '</g>' +
            '<g fill="' + RED + '">' +
            pixels(ART_ARROW, 8, 21) +
            '<g transform="translate(22,25) scale(-1,1)">' + pixels(ART_ARROW, 0, 0) + '</g>' +
            '</g>'
        )
    }
    return cardFront(
        '<defs><clipPath id="flipHalf_' + id + '">' +
        '<rect x="15" y="11" width="6" height="7"/>' +
        '</clipPath></defs>' +
        '<g fill="' + INK + '">' + pixels(ART_ROOK, 11, 11) + '</g>' +
        '<g fill="' + RED + '" clip-path="url(#flipHalf_' + id + ')">' + pixels(ART_ROOK, 11, 11) + '</g>' +
        '<g fill="' + INK + '">' +
        pixels(ART_ARROW, 8, 22) +
        '<g transform="translate(22,26) scale(-1,1)">' + pixels(ART_ARROW, 0, 0) + '</g>' +
        '</g>'
    )
}

// ---------------------------------------------------------------------
//  Deste
// ---------------------------------------------------------------------

// Sadece uygulanmış kartlar desteye girer. Rough Like'ın altı kartından
// dondurma, zehirli taş ve şah+ motorun kör olduğu ya da özel hamle üretimi
// gerektiren kurallar; onlar uygulanana kadar destede yok.
const CARD_DECK = [
    {
        id: 'pawn-rook',
        name: 'Piyon → Kale',
        desc: 'Kendi bir piyonunu kaleye dönüştürür. Terfi yerine geçer.',
        longDesc: 'Kendi renkli bir piyon seç. O piyon anında kaleye dönüşür. 7. sıradaysa terfi yerine bu etki uygulanır.',
        icon: 'pawn-to-rook'
    },
    {
        id: 'pawn-queen',
        name: 'Piyon → Vezir',
        desc: 'Kendi bir piyonunu vezire dönüştürür. Terfi yerine geçer.',
        longDesc: 'Kendi renkli bir piyon seç. O piyon anında vezire dönüşür. 7. sıradaysa terfi yerine bu etki uygulanır.',
        icon: 'pawn-to-queen'
    },
    {
        id: 'bishop-knight',
        name: 'Fil ↔ At',
        desc: 'Kendi bir filini at yapar veya atını fil yapar.',
        longDesc: 'Kendi fil veya atlarından birini seç. Fil at olur, at fil olur. Pozisyon korunur.',
        icon: 'bishop-knight-swap'
    },
    {
        id: 'rook-bishop',
        name: 'Kale ↔ Fil',
        desc: 'Kendi bir kalesini file veya filini kaleye dönüştürür.',
        longDesc: 'Kendi kale veya filinizden birini seç. Kale fil olur, fil kale olur. Pozisyon korunur.',
        icon: 'rook-bishop-swap'
    },
    {
        id: 'color-flip',
        name: 'Renk Değiştir',
        desc: 'Kendi piyon/at/fil/kalesini rakibe, veya rakip taşını kendine çevirir.',
        longDesc: 'Kendi veya rakip piyon, at, fil, kaleden birini seç. Vezir ve şah hariç. Taş rengi tersine döner.',
        icon: 'color-flip'
    }
]

const DRAFT_DEAL = 5
const DRAFT_PICK = 2

