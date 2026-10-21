// Default CMS content (editable in Admin → Content). Light markdown: "## heading", "- list", "**bold**".
// Legal pages are templates and must be reviewed by a lawyer for each operating market.

const PAGES = {
  about: {
    en: ['About Stayly — book smarter, stay better', `Stayly is a hotel booking platform built for Azerbaijan and Uzbekistan, with the comfort of a global marketplace and the knowledge of a local team.

## Why travellers choose Stayly
- **Clear prices.** The price you see is the price you pay. No surprise fees at checkout.
- **Pay the way you prefer.** Pay online by card, or — where the hotel allows it — pay at the hotel on arrival.
- **Flexible stays.** Cancellation terms are shown before you book. Many rooms offer free cancellation.
- **Your language, your currency.** Russian, English, Uzbek and Azerbaijani; USD, EUR, RUB, AZN and UZS.
- **Real local expertise.** From Baku's Old City to Samarkand's Registan and Bukhara's Lyabi-Hauz, we know the destinations we sell.

## How it works
1. **Search** — choose a destination, dates and guests.
2. **Compare** — filter by stars, meal plan, facilities and price.
3. **Book in minutes** — confirm instantly and get your reservation reference.

## For hotels
List your property, manage rooms, prices and availability yourself, and reach travellers and agencies in one place. You decide how guests pay: online, at the hotel, or both.

## Ready for your next trip?
Start with a search — your perfect stay is a few clicks away.`],
    ru: ['О Stayly — бронируйте умнее, отдыхайте лучше', `Stayly — платформа бронирования отелей для Азербайджана и Узбекистана: удобство глобального маркетплейса и знание местной команды.

## Почему путешественники выбирают Stayly
- **Понятные цены.** Цена, которую вы видите, — это цена, которую вы платите. Никаких скрытых сборов при оформлении.
- **Платите так, как удобно.** Онлайн картой или — если отель разрешает — в отеле при заезде.
- **Гибкие условия.** Правила отмены показаны до бронирования. Во многих номерах отмена бесплатная.
- **Ваш язык и валюта.** Русский, английский, узбекский и азербайджанский; USD, EUR, RUB, AZN и UZS.
- **Местная экспертиза.** От Старого города Баку до Регистана в Самарканде и Ляби-Хауз в Бухаре — мы знаем направления, которые продаём.

## Как это работает
1. **Найдите** — выберите направление, даты и количество гостей.
2. **Сравните** — фильтры по звёздам, питанию, удобствам и цене.
3. **Забронируйте за минуты** — мгновенное подтверждение и номер брони.

## Для отелей
Разместите объект, самостоятельно управляйте номерами, ценами и наличием и привлекайте путешественников и агентства в одном месте. Вы сами решаете, как платят гости: онлайн, в отеле или любым способом.

## Готовы к следующей поездке?
Начните с поиска — идеальный отель в паре кликов.`],
    az: ['Stayly haqqında — ağıllı bron edin, rahat dincəlin', `Stayly — Azərbaycan və Özbəkistan üçün qurulmuş otel bron platformasıdır: qlobal marketplace rahatlığı və yerli komandanın biliyi bir yerdə.

## Turistlər nə üçün Stayly-ni seçir
- **Aydın qiymətlər.** Gördüyünüz qiymət ödədiyiniz qiymətdir. Ödəniş zamanı gizli əlavə haqq yoxdur.
- **Sizə uyğun ödəniş.** Kartla onlayn və ya — otel icazə verirsə — girişdə otelin özündə ödəyin.
- **Çevik şərtlər.** Ləğv şərtləri bron etməzdən əvvəl göstərilir. Bir çox otaqda ləğv pulsuzdur.
- **Sizin dil, sizin valyuta.** Rus, ingilis, özbək və Azərbaycan dilləri; USD, EUR, RUB, AZN və UZS.
- **Yerli təcrübə.** Bakının İçərişəhərindən Səmərqəndin Registanına və Buxaranın Lyabi-Hauzuna qədər satdığımız istiqamətləri yaxşı tanıyırıq.

## Necə işləyir
1. **Axtarın** — istiqamət, tarix və qonaq sayını seçin.
2. **Müqayisə edin** — ulduz, yemək növü, imkanlar və qiymətə görə filtrləyin.
3. **Dəqiqələr içində bron edin** — ani təsdiq alın və bron nömrənizi əldə edin.

## Otellər üçün
Obyektinizi yerləşdirin, otaq, qiymət və boş yerləri özünüz idarə edin, turist və agentliklərlə bir platformada işləyin. Qonağın necə ödəyəcəyini siz seçirsiniz: onlayn, otelin özündə və ya hər ikisi.

## Növbəti səfərə hazırsınız?
Axtarışla başlayın — mükəmməl otel bir neçə kliklə yanınızdadır.`],
    uz: ["Stayly haqida — aqlli bron qiling, yaxshiroq dam oling", `Stayly — Ozarbayjon va O'zbekiston uchun yaratilgan mehmonxona bron qilish platformasi: global marketplace qulayligi va mahalliy jamoa bilimi birga.

## Sayyohlar nima uchun Stayly'ni tanlaydi
- **Aniq narxlar.** Ko'rgan narxingiz — to'laydigan narxingiz. To'lov paytida yashirin to'lovlar yo'q.
- **O'zingizga qulay to'lov.** Karta bilan onlayn yoki — mehmonxona ruxsat bersa — kelganingizda mehmonxonada to'lang.
- **Moslashuvchan shartlar.** Bekor qilish shartlari bron qilishdan oldin ko'rsatiladi. Ko'p xonalarda bekor qilish bepul.
- **Sizning tilingiz va valyutangiz.** Rus, ingliz, o'zbek va ozarbayjon tillari; USD, EUR, RUB, AZN va UZS.
- **Mahalliy tajriba.** Bokuning Ichari Shahridan Samarqand Registonigacha va Buxoro Labi-Hovuzigacha — biz sotadigan yo'nalishlarni yaxshi bilamiz.

## Qanday ishlaydi
1. **Qidiring** — yo'nalish, sana va mehmonlar sonini tanlang.
2. **Solishtiring** — yulduz, ovqatlanish, qulayliklar va narx bo'yicha saralang.
3. **Daqiqalarda bron qiling** — tezkor tasdiq va bron raqamini oling.

## Mehmonxonalar uchun
Obyektingizni joylashtiring, xona, narx va bo'sh joylarni o'zingiz boshqaring, sayyohlar va agentliklarga bir joyda chiqing. Mehmon qanday to'lashini o'zingiz tanlaysiz: onlayn, mehmonxonada yoki ikkalasi.

## Keyingi safarga tayyormisiz?
Qidiruvdan boshlang — mukammal turar joy bir necha bosish narida.`],
  },
  terms: {
    en: ['Terms of use', `*Template — to be reviewed by a lawyer for each market before launch.*

## 1. About the service
Stayly is an online platform that lets travellers and approved travel agencies search for and book hotels. The accommodation is provided by the hotel; Stayly arranges the reservation.

## 2. Prices and payment
- Prices are shown in the selected currency and calculated by our servers at the time of booking.
- The final price is shown before you confirm. The price of a confirmed booking does not change afterwards.
- Depending on the hotel, you can pay online by card or at the hotel. Online payments are processed by a payment provider; Stayly does not store card data.

## 3. Booking and confirmation
A booking is confirmed when you see the confirmation page and your booking reference. Rooms are held for a limited time while payment is pending; unpaid holds are released automatically.

## 4. Cancellation and refunds
Cancellation terms are shown on the hotel page. If you cancel at least 48 hours before check-in (or as stated by the hotel), an online payment is refunded in full; later cancellations may be refunded partially. Payments made at the hotel are settled directly with the hotel.

## 5. Agencies
Agency rates and contract settlement are available only to agencies approved by Stayly. Credit limits and payment terms are set in the agency agreement.

## 6. Your responsibilities
Provide accurate guest details, follow the hotel's house rules and carry the documents required for check-in.

## 7. Liability
We do our best to keep information accurate. Hotel descriptions and photos are provided by the hotels. Nothing in these terms limits rights you have under applicable consumer law.

## 8. Contact
Questions? See the Contact page.`],
    ru: ['Условия использования', `*Шаблон — перед запуском должен быть проверен юристом для каждого рынка.*

## 1. О сервисе
Stayly — онлайн-платформа, где путешественники и аккредитованные турагентства ищут и бронируют отели. Проживание предоставляет отель; Stayly организует бронирование.

## 2. Цены и оплата
- Цены показаны в выбранной валюте и рассчитываются нашими серверами в момент бронирования.
- Итоговая цена показывается до подтверждения. Цена подтверждённой брони впоследствии не меняется.
- В зависимости от отеля можно оплатить онлайн картой или в отеле. Онлайн-платежи обрабатывает платёжный провайдер; Stayly не хранит данные карт.

## 3. Бронирование и подтверждение
Бронь считается подтверждённой, когда вы видите страницу подтверждения и номер брони. Пока ожидается оплата, номер удерживается ограниченное время; неоплаченные удержания снимаются автоматически.

## 4. Отмена и возврат
Условия отмены указаны на странице отеля. При отмене не позднее чем за 48 часов до заезда (или как указано отелем) онлайн-платёж возвращается полностью; при более поздней отмене возврат может быть частичным. Оплата в отеле рассчитывается напрямую с отелем.

## 5. Агентства
Агентские цены и оплата по договору доступны только аккредитованным агентствам. Кредитные лимиты и сроки оплаты определяются агентским договором.

## 6. Ваши обязанности
Указывайте точные данные гостей, соблюдайте правила отеля и имейте документы, необходимые для заселения.

## 7. Ответственность
Мы стараемся поддерживать информацию точной. Описания и фотографии предоставляют отели. Эти условия не ограничивают ваши права по применимому законодательству о защите потребителей.

## 8. Контакты
Вопросы? См. страницу «Контакты».`],
    az: ['İstifadə şərtləri', `*Şablon — işə salınmazdan əvvəl hər bazar üçün hüquqşünas tərəfindən yoxlanılmalıdır.*

## 1. Xidmət haqqında
Stayly turistlərin və təsdiqlənmiş turizm agentliklərinin otelləri axtarıb bron etdiyi onlayn platformadır. Yaşayışı otel təmin edir; Stayly bronu təşkil edir.

## 2. Qiymət və ödəniş
- Qiymətlər seçilmiş valyutada göstərilir və bron anında serverlərimiz tərəfindən hesablanır.
- Yekun qiymət təsdiqdən əvvəl göstərilir. Təsdiqlənmiş bronun qiyməti sonradan dəyişmir.
- Otelin şərtlərindən asılı olaraq kartla onlayn və ya otelin özündə ödəmək olar. Onlayn ödənişi ödəniş provayderi emal edir; Stayly kart məlumatlarını saxlamır.

## 3. Bron və təsdiq
Təsdiq səhifəsini və bron nömrəsini gördüyünüz anda bron təsdiqlənmiş sayılır. Ödəniş gözlənilərkən otaq məhdud müddətə saxlanılır; ödənilməyən saxlamalar avtomatik azad edilir.

## 4. Ləğv və geri ödəniş
Ləğv şərtləri otel səhifəsində göstərilir. Girişə ən azı 48 saat qalmış (və ya otelin göstərdiyi müddətdə) ləğv etdikdə onlayn ödəniş tam qaytarılır; daha gec ləğvdə qismən qaytarıla bilər. Otelin özündə ödəniş birbaşa otellə hesablaşılır.

## 5. Agentliklər
Agentlik qiymətləri və müqavilə üzrə hesablaşma yalnız təsdiqlənmiş agentliklər üçün əlçatandır. Kredit limiti və ödəniş müddəti agentlik müqaviləsində müəyyən edilir.

## 6. Sizin öhdəlikləriniz
Qonaq məlumatlarını düzgün göstərin, otelin daxili qaydalarına əməl edin və yerləşmə üçün tələb olunan sənədləri özünüzlə gətirin.

## 7. Məsuliyyət
Məlumatları dəqiq saxlamağa çalışırıq. Otel təsvirləri və fotoları otellər tərəfindən verilir. Bu şərtlər tətbiq olunan istehlakçı qanunvericiliyi üzrə hüquqlarınızı məhdudlaşdırmır.

## 8. Əlaqə
Sualınız var? "Bizimlə əlaqə" səhifəsinə baxın.`],
    uz: ['Foydalanish shartlari', `*Shablon — ishga tushirishdan oldin har bir bozor uchun yurist tomonidan tekshirilishi kerak.*

## 1. Xizmat haqida
Stayly — sayyohlar va akkreditatsiyadan o'tgan turistik agentliklar mehmonxonalarni qidirib bron qiladigan onlayn platforma. Turar joyni mehmonxona taqdim etadi; Stayly bronni tashkil qiladi.

## 2. Narx va to'lov
- Narxlar tanlangan valyutada ko'rsatiladi va bron paytida serverlarimiz tomonidan hisoblanadi.
- Yakuniy narx tasdiqlashdan oldin ko'rsatiladi. Tasdiqlangan bron narxi keyin o'zgarmaydi.
- Mehmonxona shartlariga qarab karta bilan onlayn yoki mehmonxonada to'lash mumkin. Onlayn to'lovlarni to'lov provayderi qayta ishlaydi; Stayly karta ma'lumotlarini saqlamaydi.

## 3. Bron va tasdiq
Tasdiq sahifasi va bron raqamini ko'rganingizda bron tasdiqlangan hisoblanadi. To'lov kutilayotganda xona cheklangan vaqt ushlab turiladi; to'lanmagan ushlab turishlar avtomatik bo'shatiladi.

## 4. Bekor qilish va qaytarish
Bekor qilish shartlari mehmonxona sahifasida ko'rsatilgan. Kelishdan kamida 48 soat oldin (yoki mehmonxona ko'rsatgan muddatda) bekor qilsangiz, onlayn to'lov to'liq qaytariladi; kechroq bekor qilishda qisman qaytarilishi mumkin. Mehmonxonada to'lov to'g'ridan-to'g'ri mehmonxona bilan hisoblashiladi.

## 5. Agentliklar
Agentlik narxlari va shartnoma bo'yicha hisob-kitob faqat tasdiqlangan agentliklar uchun mavjud. Kredit limiti va to'lov muddati agentlik shartnomasida belgilanadi.

## 6. Sizning majburiyatlaringiz
Mehmon ma'lumotlarini to'g'ri kiriting, mehmonxona qoidalariga rioya qiling va joylashish uchun kerakli hujjatlarni olib keling.

## 7. Javobgarlik
Ma'lumotlarni aniq saqlashga harakat qilamiz. Mehmonxona tavsifi va rasmlarini mehmonxonalar taqdim etadi. Ushbu shartlar iste'molchi qonunchiligi bo'yicha huquqlaringizni cheklamaydi.

## 8. Aloqa
Savolingiz bormi? "Biz bilan aloqa" sahifasiga qarang.`],
  },
  privacy: {
    en: ['Privacy policy', `*Template — to be reviewed by a lawyer for each market before launch.*

## What we collect
- **Account data:** name, e-mail, phone, password (stored only as a secure hash).
- **Booking data:** guest names, contact details, dates, room and price details.
- **Usage data:** searches and page views, collected in aggregate to improve the service.

## Why we use it
To create and manage your booking, send confirmations, process payments through our payment provider, prevent fraud and improve the service.

## Who we share it with
- The **hotel** you book (guest name and contact details needed for your stay).
- **Payment providers** (we never store full card numbers).
- Service providers that deliver e-mail or notifications. Internal team chats receive booking references, never your personal contact details.

## Marketing
We send offers only if you agree, and every message includes a way to unsubscribe.

## Security
Passwords are hashed, connections are encrypted, access is role-based and critical actions are logged. You can enable two-factor authentication in your account.

## Your rights
You can ask to access, correct or delete your data, or withdraw consent, by contacting us.

## Retention
We keep data only as long as needed for the booking, accounting and legal obligations, then delete or anonymise it.`],
    ru: ['Политика конфиденциальности', `*Шаблон — перед запуском должен быть проверен юристом для каждого рынка.*

## Какие данные мы собираем
- **Данные аккаунта:** имя, e-mail, телефон, пароль (хранится только в виде защищённого хеша).
- **Данные бронирования:** имена гостей, контакты, даты, номер и цена.
- **Данные об использовании:** поиски и просмотры страниц в обобщённом виде для улучшения сервиса.

## Зачем мы их используем
Чтобы оформлять и сопровождать бронь, отправлять подтверждения, принимать оплату через платёжного провайдера, предотвращать мошенничество и улучшать сервис.

## Кому мы передаём данные
- **Отелю**, который вы бронируете (имя и контакты гостя, необходимые для проживания).
- **Платёжным провайдерам** (полные номера карт мы не храним).
- Сервисам отправки e-mail и уведомлений. Во внутренние чаты команды попадают только номера броней, но не ваши контакты.

## Маркетинг
Мы отправляем предложения только с вашего согласия; в каждом сообщении есть способ отписаться.

## Безопасность
Пароли хешируются, соединения шифруются, доступ определяется ролями, критические действия журналируются. В аккаунте можно включить двухфакторную аутентификацию.

## Ваши права
Вы можете запросить доступ, исправление или удаление данных либо отозвать согласие, связавшись с нами.

## Сроки хранения
Мы храним данные только пока это нужно для бронирования, учёта и требований закона, затем удаляем или анонимизируем.`],
    az: ['Məxfilik siyasəti', `*Şablon — işə salınmazdan əvvəl hər bazar üçün hüquqşünas tərəfindən yoxlanılmalıdır.*

## Nə toplayırıq
- **Hesab məlumatları:** ad, e-poçt, telefon, parol (yalnız təhlükəsiz hash şəklində saxlanır).
- **Bron məlumatları:** qonaq adları, əlaqə məlumatları, tarixlər, otaq və qiymət.
- **İstifadə məlumatları:** xidməti yaxşılaşdırmaq üçün ümumiləşdirilmiş axtarış və səhifə baxışları.

## Nə üçün istifadə edirik
Bronunuzu yaratmaq və idarə etmək, təsdiqlər göndərmək, ödəniş provayderi vasitəsilə ödənişi emal etmək, saxtakarlığın qarşısını almaq və xidməti yaxşılaşdırmaq üçün.

## Kimlərlə paylaşırıq
- Bron etdiyiniz **otel** (yaşayış üçün lazım olan qonaq adı və əlaqə məlumatları).
- **Ödəniş provayderləri** (tam kart nömrələrini saxlamırıq).
- E-poçt və bildiriş göndərən xidmət təchizatçıları. Komandanın daxili çatlarına yalnız bron nömrələri gedir, şəxsi əlaqə məlumatlarınız getmir.

## Marketinq
Təklifləri yalnız razılığınız olduqda göndəririk; hər mesajda abunəlikdən çıxmaq imkanı var.

## Təhlükəsizlik
Parollar hash edilir, bağlantılar şifrələnir, giriş rollara əsaslanır, kritik əməliyyatlar jurnalda saxlanır. Hesabınızda ikifaktorlu autentifikasiyanı aktiv edə bilərsiniz.

## Hüquqlarınız
Bizimlə əlaqə saxlayaraq məlumatlarınıza çıxış, düzəliş və ya silinmə tələb edə, razılığı geri götürə bilərsiniz.

## Saxlanma müddəti
Məlumatları yalnız bron, mühasibat və qanuni öhdəliklər üçün lazım olan müddət saxlayır, sonra silir və ya anonimləşdiririk.`],
    uz: ["Maxfiylik siyosati", `*Shablon — ishga tushirishdan oldin har bir bozor uchun yurist tomonidan tekshirilishi kerak.*

## Nimalarni yig'amiz
- **Hisob ma'lumotlari:** ism, e-pochta, telefon, parol (faqat xavfsiz hash shaklida saqlanadi).
- **Bron ma'lumotlari:** mehmon ismlari, aloqa ma'lumotlari, sanalar, xona va narx.
- **Foydalanish ma'lumotlari:** xizmatni yaxshilash uchun umumlashtirilgan qidiruvlar va sahifa ko'rishlar.

## Nima uchun foydalanamiz
Bronni yaratish va boshqarish, tasdiqlar yuborish, to'lov provayderi orqali to'lovni qayta ishlash, firibgarlikning oldini olish va xizmatni yaxshilash uchun.

## Kimlar bilan ulashamiz
- Siz bron qilgan **mehmonxona** (turar joy uchun kerakli mehmon ismi va aloqa ma'lumotlari).
- **To'lov provayderlari** (to'liq karta raqamlarini saqlamaymiz).
- E-pochta va bildirishnoma yuboruvchi xizmat provayderlari. Jamoaning ichki chatlariga faqat bron raqamlari boradi, shaxsiy aloqa ma'lumotlaringiz emas.

## Marketing
Takliflarni faqat roziligingiz bilan yuboramiz; har bir xabarda obunadan chiqish imkoni bor.

## Xavfsizlik
Parollar hash qilinadi, ulanishlar shifrlanadi, kirish rollarga asoslanadi, muhim amallar jurnalga yoziladi. Hisobingizda ikki bosqichli autentifikatsiyani yoqishingiz mumkin.

## Huquqlaringiz
Biz bilan bog'lanib, ma'lumotlaringizga kirish, tuzatish yoki o'chirishni so'rashingiz, rozilikni qaytarib olishingiz mumkin.

## Saqlash muddati
Ma'lumotlarni faqat bron, buxgalteriya va qonuniy majburiyatlar uchun kerak bo'lgan muddatda saqlaymiz, so'ng o'chiramiz yoki anonimlashtiramiz.`],
  },
};

const OLD_PLACEHOLDERS = ['Stayly connects travellers and travel agencies', 'Edit this page in Admin'];

const DEFAULT_CONTACT = {
  phone: '+994 12 000 00 00',
  telegram: 'https://t.me/',
  whatsapp: 'https://wa.me/',
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  email: 'support@stayly.local',
};

module.exports = { PAGES, OLD_PLACEHOLDERS, DEFAULT_CONTACT };
