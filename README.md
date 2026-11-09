# Marketplace

Mustaqil kichik marketplace loyihasi. **Savdochi B2B loyihasiga aloqasi yo'q** — o'z serveri,
o'z bazasi (SQLite) va o'z `package.json`i bor, `../src` dagi hech narsadan foydalanmaydi.

Tashqi kutubxona kerak emas: faqat Node.js 22.5+ (`node:http`, `node:sqlite`).

## Ishga tushirish

```bash
cd marketplace
npm start          # http://localhost:3100
npm test           # asosiy oqim testi
```

Birinchi ishga tushganda admin yaratiladi: **+998 90 000 00 00 / admin123**
(`ADMIN_PHONE`, `ADMIN_PASSWORD` orqali o'zgartirish mumkin). Boshqa sozlamalar: `PORT`, `SECRET`, `DB_FILE`.

## Panellar

Har bir rolning o'z sahifasi va o'z dizayni bor:

| Sahifa | Kim uchun |
|---|---|
| `/` | Kirish, ro'yxatdan o'tish va tayyor demo kirishlar |
| `/admin.html` | 👑 Admin paneli — boshqaruv, foydalanuvchilar va rollar, mahsulotlar, buyurtmalar |
| `/seller.html` | 🏪 Sotuvchi paneli — bosh sahifa, mahsulotlar CRUD, buyurtmalar va "Kuryer topish" |
| `/courier.html` | 🚚 Kuryer ilovasi (telefon uchun) — yangi zakazlar, faol, tarix |
| `/shop.html` | 🛒 Xaridor do'koni — katalog, savat, buyurtmalar va ularning holati |

Har bir rol o'z sessiyasini alohida saqlaydi. Shuning uchun to'rtta panelni to'rt xil oynada
bir vaqtda ochib, buyurtmaning yo'lini kuzatish mumkin: xaridor buyurtma beradi → sotuvchi kuryer topadi →
kuryer qabul qiladi. Admin kimningdir rolini o'zgartirsa, o'sha odam keyingi safar avtomatik yangi paneliga o'tadi.

### Demo kirishlar

Kirish sahifasida har bir rol uchun tayyor demo karta bor: **Kirish** yoki **↗ Yangi oyna**.
Namunaviy mahsulotlar va turli holatdagi buyurtmalar o'zi qo'shiladi.

| Rol | Telefon | Parol |
|---|---|---|
| Admin | +998 90 000 00 01 | demo123 |
| Sotuvchi | +998 90 111 11 11 | demo123 |
| Kuryer | +998 90 222 22 22 | demo123 |
| Xaridor | +998 90 333 33 33 | demo123 |

Haqiqiy foydalanishda demoni o'chiring: `DEMO=0 npm start` (Windows: `set DEMO=0 && npm start`).

## Rollar

| Rol | Imkoniyatlar |
|---|---|
| **Xaridor (user)** | Ro'yxatdan o'tgan har kim. Sotuvchilar mahsulotlarini ko'radi, savat, buyurtma beradi, kuryer olmaguncha bekor qiladi |
| **Sotuvchi (seller)** | O'z mahsulotlari CRUD; kelgan buyurtmani tayyorlab **"Kuryer topish"** — buyurtma barcha kuryerlarga tushadi |
| **Kuryer (courier)** | Barcha sotuvchilardan kuryer kutayotgan zakazlarni ko'radi; **qabul qiladi** yoki qabul qilganini **bekor qiladi** (zakaz boshqa kuryerlarga qaytadi); "Yetkazildi" |
| **Admin** | Hamma narsa: foydalanuvchilar CRUD va rol berish, barcha mahsulotlar, barcha buyurtmalar, statistika |

Rol faqat admin o'zgartirganda o'zgaradi; rol har so'rovda bazadan o'qiladi, shuning uchun darhol kuchga kiradi.

Kirish va ro'yxatdan o'tish — telefon raqam + parol (`901234567`, `+998 90 123 45 67` kabi yozuvlar qabul qilinadi).

## Buyurtma holatlari

`Yangi` → (sotuvchi: Kuryer topish) → `Kuryer qidirilmoqda` → (kuryer: Qabul) → `Kuryer yo'lda` → `Yetkazildi`

Kuryer bekor qilsa: `Kuryer yo'lda` → `Kuryer qidirilmoqda`. Xaridor/sotuvchi kuryer olmaguncha `Bekor qilindi` qila oladi (qoldiq qaytadi).
Savatda bir nechta sotuvchining mahsuloti bo'lsa, har bir sotuvchiga alohida buyurtma yaratiladi.

## Tuzilma

```
server.js        API + statik fayllar + SQLite sxemasi + demo ma'lumotlar
public/
  index.html     kirish sahifasi
  admin.html, seller.html, courier.html, shop.html   rollar panellari
  css/           base.css (umumiy dizayn), panel.css (chap menyuli panellar)
  js/            core.js (umumiy), admin.js, seller.js, shop.js
test.js          API orqali to'liq oqim testi
test-demo.js     demo panellar testi
```
