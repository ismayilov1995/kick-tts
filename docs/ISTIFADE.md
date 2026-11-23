# Kick TTS — İstifadə bələdçisi

## Kick TTS nədir

Kick TTS Kick yayımında KICK hədiyyələrini, channel points mesajlarını və istəsən chat-i səslə oxuyur və səsi birbaşa OBS-ə göndərir. Hər tamaşaçını yadda saxlayır, ən sadiqləri göstərir, xüsusi anlarda ("100-cü mesaj", "7 gündür ardıcıl buradadır") özü danışır.

- Tam pulsuzdur: hesab, API açarı, abunəlik yoxdur.
- Quraşdırma yoxdur: bir fayl açırsan, işləyir.
- Səslər kompüterin öz səsləridir, internetə göndərilmir.
- Məlumatlar yalnız sənin kompüterində saxlanılır.

**Lazım olan:** macOS (Apple Silicon və ya Intel) və ya Windows 10/11, OBS Studio və bir Kick kanal adı.

## macOS-da quraşdırma

Mac-ın prosessoruna uyğun zip-i seç: Apple menüsü → About This Mac. "Chip: Apple M1/M2/M3/M4" yazılıbsa **KickTTS-mac-arm64.zip**, "Processor: Intel" yazılıbsa **KickTTS-mac-x64.zip**.

1. Zip faylını iki dəfə kliklə aç. İçindən **KickTTS-mac-arm64** (və ya x64) faylı çıxır. Onu istədiyin qovluğa, məsələn Applications-a köçür.
2. Fayla iki dəfə kliklə. macOS "açıla bilməz" deyəcək, çünki app Apple tərəfindən imzalanmayıb. **Done** bas.
3. **System Settings → Privacy & Security** bölməsinə get, aşağı sürüşdür və KickTTS üçün **Open Anyway** düyməsini bas. Parolunu soruşsa, yaz.
4. Faylı yenə aç. Terminal pəncərəsi açılır və "Kick TTS işləyir" yazır. **Bu pəncərəni bağlama**, app onunla işləyir.

3-cü addım yalnız ilk dəfə lazımdır. Sonra fayl birbaşa açılır.

App-i bağlamaq üçün Terminal pəncərəsini bağla və ya orada Ctrl+C bas.

## Windows-da quraşdırma

Windows 10 və ya 11 (64-bit) üçün fayl **KickTTS-win-x64.exe**-dir.

1. Faylı istədiyin qovluğa qoy, məsələn Desktop-a.
2. İki dəfə kliklə. Mavi "Windows protected your PC" pəncərəsi çıxsa, **More info → Run anyway** bas. App imzalanmadığı üçün Windows bunu soruşur.
3. Qara pəncərə açılır və "Kick TTS işləyir" yazır. **Bu pəncərəni bağlama**, app onunla işləyir.
4. Windows Firewall soruşsa, **Allow** bas. App yalnız öz kompüterinə (localhost) açılır, şəbəkəyə yox.

App-i bağlamaq üçün qara pəncərəni bağla.

Windows versiyası hələ real Windows kompüterində yoxlanılmayıb. Problem olsa, qara pəncərədəki yazının şəklini göndər.

## İlk açılış və Kick-ə qoşulma

İlk dəfə açılanda brauzerdə idarə paneli özü açılır. Açılmasa, brauzerdə bu ünvanı yaz: http://localhost:7777

1. **Kanal** bölməsində Kick istifadəçi adını yaz (kick.com/**ad** hissəsi) və **Qoşul** bas.
2. Yuxarıda yaşıl **"Kick: qoşulub"** yazısı görünməlidir.
3. "Kick məlumatlarını avtomatik ala bilmədik" yazısı çıxsa, oradakı linki aç, göstərilən iki rəqəmi kopyala, sahələrə yaz və **Yadda saxla və qoşul** bas.

Kanal adı yadda qalır. Növbəti dəfə app açılanda özü qoşulur.

App artıq işləyərkən faylı yenə açsan, ikinci nüsxə açılmır: sadəcə idarə paneli açılır.

**İdarə** bölməsindəki düymələr:

| Düymə | Nə edir |
| --- | --- |
| Test | Sınaq cümləsi oxuyur |
| Keç | İndi oxunanı dayandırır, növbətiyə keçir |
| Pauza | Oxumaq dayanır, mesajlar növbədə gözləyir |

## OBS-ə overlay əlavə etmək

Səs OBS-ə Browser Source vasitəsilə gedir, ona görə yayımda eşidilir.

1. OBS-də **Sources** → **+** → **Browser**.
2. URL: `http://localhost:7777/overlay`
3. **Control audio via OBS** qutusunu işarələ → **OK**.
4. İdarə panelində yuxarıda yaşıl **"OBS overlay: qoşulub"** görünməlidir.
5. **Test** bas. OBS-in Audio Mixer-ində yeni mənbə tərpənməli və səs eşidilməlidir.

- Overlay-i **yalnız bir dəfə** əlavə et, yoxsa səs iki dəfə çıxar.
- Overlay-i adi brauzer tabında açma: orada avtomatik səs bloklanır və mesajlar atılır.
- Oxunan mətni ekranda da göstərmək üçün "Nə oxunsun" bölməsində **Oxunan mətni overlay-də göstər** işarələ.
- OBS-i bağlayıb açanda overlay özü yenidən qoşulur, növbədəki mesajlar itmir.

## Nə oxunsun

Default olaraq KICK hədiyyələri və channel points oxunur, chat oxunmur. Dəyişiklik dərhal tətbiq olunur və yadda qalır.

| Ayar | Default | Nə edir |
| --- | --- | --- |
| KICK hədiyyələri | Açıq | KICK göndərənin mesajını oxuyur, ən yüksək prioritetlə |
| Channel points | Açıq | Reward mətnini, yoxdursa reward adını oxuyur |
| Yalnız bu reward-lar | Boş (hamısı) | Vergüllə reward adları, məsələn `Mahnı, Sual` |
| Abunəliklər və hədiyyə abunələr | Bağlı | "X abunə oldu" tipli elanlar |
| Bütün chat | Bağlı | Hər chat mesajını oxuyur |
| İstifadəçi adını da oxu | Açıq | "Murad: salam" kimi oxuyur |
| Oxunan mətni overlay-də göstər | Bağlı | Mətn ekranda da çıxır |
| Maksimum uzunluq | 200 | Uzun mesaj bu qədər simvoldan sonra kəsilir (20–500) |
| Qadağan sözlər | Boş | Vergüllə; bu söz olan mesaj heç oxunmur |

Növbədə ən çoxu 15 mesaj gözləyir. Dolanda əvvəl ən köhnə chat mesajı atılır. KICK, reward və abunəlik mesajları heç vaxt atılmır.

Emote-lar, linklər və "aaaaaa" kimi təkrarlar oxunmazdan əvvəl təmizlənir.

## Səslər

Azərbaycan dilində sistem səsi yoxdur; Türkcə səs Azərbaycan mətnini ən yaxşı oxuyur. Ona görə əvvəlcə Türkcə səs yüklə.

| Səs yeri | Nə üçün | Tövsiyə |
| --- | --- | --- |
| Əsas səs | Bütün adi mesajlar | Türkcə (macOS: Yelda, Windows: Tolga) |
| Kiril mətn üçün səs | Rus hərfləri olan mesajlar | Rusca (macOS: Milena) |
| Aparıcı səsi | Şablon elanlar ("Təbriklər, …") | Əsas səsdən fərqli bir səs |

"Avtomatik" seçilsə, app uyğun səsi özü seçir. Hər səsi **Dinlə** düyməsi ilə yoxlaya bilərsən.

**macOS-da səs yükləmək:** System Settings → Accessibility → Spoken Content → System Voice → Manage Voices… → Turkish **Yelda** və Russian **Milena** seç.

**Windows-da səs yükləmək:** Settings → Time & language → Speech → Add voices → **Türkçe (Türkiye)** və **Русский**. App bu səsləri birinci göstərir; köhnə səslər siyahıda "(SAPI)" ilə görünür.

Yeni səs yüklədikdən sonra paneldə **Test** bas və ya app-i yenidən aç, siyahı yenilənsin.

## Sadiq tamaşaçılar və şablonlar

App hər tamaşaçıya bal verir və səviyyə təyin edir. Bal bu yolla toplanır: aktiv gün × 10, ardıcıl gün × 5, mesaj × 0.2 (gündə ən çoxu 30 mesaj sayılır), KICK × 0.5, abunəlik × 50, hədiyyə abunəlik × 25, reward × 2.

| Səviyyə | Bal |
| --- | --- |
| 🌱 Yeni | 0–49 |
| 👋 Tanış | 50–199 |
| ⭐ Daimi | 200–599 |
| 💎 Sadiq | 600–1499 |
| 👑 Əfsanə | 1500+ |

**Şablon cavablar** xüsusi anlarda aparıcı səslə danışır. Hər birini açıb-bağlaya və mətnini dəyişə bilərsən; hər sətir bir variantdır, app təsadüfi birini seçir.

| Şablon | Default | Nə vaxt |
| --- | --- | --- |
| Səviyyə qalxması | Açıq | Tamaşaçı yeni səviyyəyə çatanda |
| Mesaj sayı | Açıq | 100, 500, 1000, 5000-ci mesajda |
| Ardıcıl günlər | Açıq | 3, 7, 14, 30 gün dalbadal gələndə |
| Geri qayıdış | Açıq | 7+ gün sonra qayıdanda |
| İlk mesaj | Bağlı | Kanalda ilk dəfə yazanda |
| Spam | Bağlı | Dəqiqədə 10-dan çox mesaj yazanda |

Mətndə bu işarələr avtomatik doldurulur: `{user}`, `{level}`, `{n}`, `{streak}`, `{days}`. Bir tamaşaçı üçün eyni şablon bir yayımda bir dəfə səslənir, iki şablon arasında ən az 30 saniyə keçir.

**Sadiq tamaşaçılar** cədvəlində ən yüksək ballar görünür, adla axtarmaq olur. Bir ada klikləsən:

- **Blokla**: bu tamaşaçının heç nəyi oxunmur.
- **Məlumatı sil**: onun bütün mesajları və balı silinir.

## Problemlər və həllər

| Problem | Həll |
| --- | --- |
| Səs gəlmir | Paneldə "OBS overlay: qoşulub" yaşıldırmı? Deyilsə, OBS-də Browser Source-u yoxla. OBS Audio Mixer-də mənbə səssiz olmasın. |
| Səs iki dəfə çıxır | Overlay iki dəfə əlavə olunub; birini sil. |
| "Kick: qoşulmayıb" | Adı yoxla, **Qoşul** bas. İnternet kəsiləndə app özü yenidən qoşulur. |
| Azərbaycan mətni İngilis akşenti ilə oxunur | Türkcə səs yüklə və Əsas səsdə seç (Səslər bölməsi). |
| "7777 portu başqa proqram tərəfindən istifadə olunur" | O proqramı bağla və app-i yenidən aç. |
| Brauzerdə panel açılmır | App pəncərəsi açıqdırmı? Ünvan: http://localhost:7777 |
| Bir mesaj ilə ilişib qalıb | **Keç** bas. App 60 saniyədən sonra özü də keçir. |

**Məlumat qovluğu** (ayarlar, tamaşaçı bazası):

- macOS: `~/Library/Application Support/KickTTS`
- Windows: `%APPDATA%\KickTTS`

Hər şeyi sıfırlamaq üçün app-i bağla və bu qovluğu sil. Başqa kompüterə keçəndə bu qovluğu köçürsən, tamaşaçı balları da gəlir.
