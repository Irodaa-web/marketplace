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
server.js        API + statik fayllar + SQLite sxemasi
public/          interfeys (index.html, app.js, style.css)
test.js          API orqali to'liq oqim testi
```
