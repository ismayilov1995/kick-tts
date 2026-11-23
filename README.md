# Kick TTS

Kick yayımında KICK hədiyyələrini, channel points mesajlarını və (istəsən) chat-i səslə oxuyur, səsi birbaşa OBS-ə göndərir. Hər tamaşaçını yadda saxlayır, ən sadiq tamaşaçıları göstərir və xüsusi anlarda ("100-cü mesaj", "7 gündür ardıcıl buradadır") öz-özünə danışır.

Pulsuzdur. Quraşdırma, hesab və ya açar tələb etmir.

## 4 addımda başla

1. **App-i aç.**
   - **Windows:** `KickTTS-win-x64.exe` faylına iki dəfə kliklə. Açılan qara pəncərəni bağlama — app onunla işləyir.
   - **macOS:** `.zip` faylını yüklə və aç (unzip). Faylı bir dəfə açmağa çalış; macOS 15 və yuxarıda sağ klik → Open artıq Gatekeeper-i keçmir, ona görə **System Settings → Privacy & Security** bölməsinə get və aşağıda **"Open Anyway"** düyməsini bas. Bunu yalnız ilk dəfə etmək lazımdır (app Apple tərəfindən imzalanmadığı üçün macOS soruşur).

   İlk dəfə açılanda brauzerdə idarə paneli özü açılır. Açılmasa, brauzerdə bu ünvanı aç: http://localhost:7777

2. **Kick istifadəçi adını yaz** və **Qoşul** düyməsini bas. Yuxarıda yaşıl **"Kick: qoşulub"** yazısı görünməlidir.
   - "Kick məlumatlarını avtomatik ala bilmədik" yazısı çıxsa, oradakı linki aç, göstərilən iki rəqəmi kopyala, sahələrə yaz və **Yadda saxla və qoşul** düyməsini bas.

3. **OBS-də:** Sources (Mənbələr) → **+** → **Browser** → URL: `http://localhost:7777/overlay` → **"Control audio via OBS"** qutusunu işarələ → **OK**.
   Overlay-i yalnız OBS Browser Source kimi əlavə et. Adi brauzer tabında avtomatik səs səsləndirmə bloklandığı üçün elementlər atlanır.
   Yuxarıda yaşıl **"OBS overlay: qoşulub"** yazısı görünməlidir.

4. Paneldə **Test** düyməsini bas. OBS-in audio mikserində yeni səs mənbəyi tərpənməli və səs eşidilməlidir.

## Bilmək faydalıdır

- Overlay-i OBS-ə **yalnız bir dəfə** əlavə et, yoxsa səs iki dəfə çıxa bilər.
- Default olaraq **KICK hədiyyələri** və **channel points** oxunur. Bundan əlavə sadiqlik şablonları (səviyyə artımı, mesaj mərhələləri, ardıcıl günlər, geri qayıdış) də default olaraq açıqdır və chat tamaşaçıları üçün danışır. Chat-i və abunəlikləri "Nə oxunsun" bölməsində aç.
- Səslər kompüterin öz səsləridir:
  - **macOS:** System Settings → Accessibility → Spoken Content → System Voice → Manage Voices… → Türkcə **Yelda** və rusca **Milena** səslərini yüklə.
  - **Windows:** Settings → Time & language → Speech → "Add voices" → **Türkçe (Türkiye)** səsini (**Microsoft Tolga**), kiril mətn üçün isə **Русский** səsini əlavə et. App bu (OneCore) səsləri birinci göstərir; köhnə System.Speech səsləri siyahıda "(SAPI)" ilə görünür. OneCore səsi işləməsə, app avtomatik eyni dildə SAPI səsinə keçir.
- Yeni sistem səsi quraşdırdıqdan sonra paneldə **Test** düyməsini bas və ya app-i yenidən başlat.
- Azərbaycan dilində sistem səsi yoxdur; Türkcə səs Azərbaycan mətnini ən yaxşı oxuyur.
- Məlumatlar bu qovluqda saxlanılır:
  - macOS: `~/Library/Application Support/KickTTS`
  - Windows: `%APPDATA%\KickTTS`

  Bir tamaşaçının məlumatını silmək üçün "Sadiq tamaşaçılar" bölməsində onun adına kliklə və **Məlumatı sil** düyməsini bas.
