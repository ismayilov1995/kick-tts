# Kick TTS — v1 dizayn spec

Tarix: 2026-11-23 · Status: təsdiqlənib (brainstorming), implementasiya planı gözləyir

## 1. Məqsəd və kontekst

Kick streamerləri üçün pulsuz desktop app. Seçilmiş Kick event-lərini (KICK hədiyyəsi, channel points, chat və s.) səslə oxuyur və səsi OBS-ə ötürür. Hər tamaşaçının mesajlarını lokal bazada saxlayır, loyallıq balı hesablayır və mərhələ anlarında şablon cavablar səsləndirir.

**Hədəf auditoriya:** çox streamer (məhsul), texniki olmayan istifadəçi.

**Rəqiblərdən fərq:** Blerp, KickBot, TTS Monster və Botrix stateless işləyir, yəni tamaşaçını tanımırlar. Bizim app-in yaddaşı var: tamaşaçının tarixçəsi, loyallığı və ona uyğun cavab. v2-də bu yaddaş LLM-ə ötürüləcək.

**Məhdudiyyətlər:**
- Bir exe faylı, quraşdırma addımı yoxdur, API açarı yoxdur, heç bir pullu xidmət istifadə olunmur.
- Kommersiya istifadəsinə uyğun lisenziyalar: CC-BY-NC modellər (MMS, XTTS-v2, F5-TTS) **qadağandır**.
- Edge TTS (rəsmi olmayan endpoint) əsas mühərrik kimi istifadə olunmur.

## 2. Versiyalar (scope)

| Versiya | Daxildir |
|---|---|
| **v1 (bu spec)** | Kick bağlantısı (Pusher), event-lərin oxunması, SQLite yaddaş və statistika, loyallıq balı + top siyahı, şablon cavablar, OBS overlay, OS + Piper səsləri |
| v2 | LLM Responder, overlay-də loyallıq leaderboard-u, tamaşaçının özü səs seçməsi (`!səs robot`), streamerin dəyişə bildiyi loyallıq çəkiləri, Türkcə UI |
| v3 | RVC personaj səsləri, Pro abunə, könüllü bulud sinxronizasiyası |

Biznes modeli: pulsuz desktop app kimi başlayır, sonra freemium olur (Pro = AI personaj səsləri və LLM).

## 3. Arxitektura

```
Source (Kick Pusher)
  → [1] Normalizer   xam event → Event
  → [2] Store        SQLite: event yazılır, channel_users statistikası yenilənir
  → [3] Filter       toggle-lar, bot, "!" əmr, block list, link, spam
  → [4] Responder    Event + UserContext → Utterance[]   (v1: TemplateResponder + birbaşa oxuma)
  → [5] Safety       çıxan mətn: link, uzunluq, söyüş siyahısı
  → [6] Voice        Utterance → WAV (səs yuvası seçimi)
  → [7] Queue        prioritet növbəsi → Overlay (WebSocket) + Dashboard log
```

Hər qat ayrıca modul, ayrıca test olunur. Qatlar arasındakı interfeyslər:

```ts
type Event = {
  platform: 'kick'; channelId: string; userId: string; username: string;
  type: 'chat' | 'reward' | 'kicks' | 'sub' | 'giftsub';
  text?: string; amount?: number; rewardTitle?: string;
  raw: unknown; ts: number;
};

type UserContext = {
  username: string; level: Level; score: number;
  msgCount: number; daysActive: number; streak: number;
  firstSeen: number; lastSeen: number; daysSinceLastSeen: number;
  kicksTotal: number; subs: number; giftSubs: number; redemptions: number;
  recentMessages: { text: string; ts: number }[]; // son 20; v2-də LLM prompt-u üçün
};

type Utterance = { text: string; voice?: VoiceSlot; priority: 1 | 2 | 3; kind: string };

interface Source    { start(onEvent: (raw: unknown, channel: string, event: string) => void): void; stop(): void }
interface Responder { respond(e: Event, ctx: UserContext): Utterance[] }
interface VoiceEngine { listVoices(): Promise<Voice[]>; synth(text: string, voiceId: string): Promise<string /* wav yolu */> }
```

**LLM-ə hazırlıq:** v2-də `LLMResponder` eyni `Responder` interfeysini implement edəcək. `UserContext.recentMessages` və `events` cədvəli ilk gündən doldurulur. Safety qatı v1-də də işləyir.

## 4. Kick bağlantısı

v1-də Pusher istifadə olunur (yalnız oxumaq üçün). Rəsmi Kick Public API webhook üçün açıq URL tələb edir, desktop app-də belə URL yoxdur. Bağlantı `Source` interfeysi arxasındadır, sonra rəsmi API və ya digər platformalar qoşula bilər.

**Açarı əldə etmək (açılışda):**
```
POST https://web.kick.com/api/v1/realtime/connection
{"client":{"id":"<random uuid>","type":"web"},"capabilities":{"accepted_providers":[{"provider":"pusher"}]}}
→ data.connections[] içində provider "pusher" olanı → credentials.app_key, credentials.cluster
```
Sorğu alınmasa, ehtiyat: key `34bf7a0ff419a2a775b9`, cluster `us2`. Köhnə `32cbd69e4b950bf97679` açarı ölüdür, istifadə olunmur.

**WebSocket:** `wss://ws-<cluster>.pusher.com/app/<key>?protocol=7&client=js&version=8.4.0&flash=false`
- `pusher:connection_established` gələndə hər kanal üçün `{"event":"pusher:subscribe","data":{"auth":"","channel":"<name>"}}` göndərilir.
- `pusher:ping` gələndə `{"event":"pusher:pong","data":{}}` cavabı göndərilir.
- `pusher:error` UI-da göstərilir.
- Bağlantı kəsiləndə 1 saniyədən 30 saniyəyə qədər artan fasilələrlə yenidən qoşulur.
- Event `data` sahəsi JSON içində JSON string-dir, iki dəfə parse olunur.

**Kanal ID-ləri:** `GET https://kick.com/api/v2/channels/<username>` → `id` və `chatroom.id`. Cloudflare 403 qaytarsa, dashboard təlimat göstərir: "bu linki brauzerdə aç, bu iki rəqəmi kopyala". Rəqəmlər üçün input sahələri olur.

**Abunə olunan kanallar və event-lər:**

| Kanal | Event | Sahələr | Status |
|---|---|---|---|
| `chatrooms.<chatroomId>.v2` | `App\Events\ChatMessageEvent` | `content`, `sender.username`, `sender.id`, `type` (message/reply). Emote formatı `[emote:123:name]`, silinir | yoxlanılıb |
| `chatroom_<chatroomId>` | `RewardRedeemedEvent` | `reward_title`, `username`, `user_input`, `reward_background_color` | canlı yoxlanılıb |
| `channel_<channelId>` | `KicksGifted` | `sender.username`, `gift.amount`, bəzən `gift.name` / `gift.message` | **yoxlanılmayıb**, ehtiyatla parse olunur |
| `channel.<channelId>` | `SubscriptionEvent`, `GiftedSubscriptionsEvent`, `ChannelSubscriptionEvent` | ehtiyatla parse olunur | yoxlanılmayıb |

Tanınmayan və ya natamam parse olunan hər event xam şəkildə `unknown-events.log` faylına yazılır.

**User ID:** sahədə ID varsa `kick:<id>` istifadə olunur. ID yoxdursa (məsələn, reward event-ində), `kick:name:<lowercase username>` götürülür. Eyni username-li sətir sonradan ID ilə gəlsə, birləşdirilir.

## 5. Verilənlər bazası (SQLite, `bun:sqlite`)

```sql
channels(
  id TEXT PRIMARY KEY,            -- 'kick:123'
  slug TEXT, chatroom_id TEXT, settings_json TEXT, created_at INTEGER)

users(
  id TEXT PRIMARY KEY,            -- 'kick:456'
  username TEXT, first_seen INTEGER, last_seen INTEGER)

channel_users(
  channel_id TEXT, user_id TEXT,
  msg_count INTEGER, msgs_today INTEGER, counted_msgs INTEGER,
  days_active INTEGER, streak INTEGER, last_active_day TEXT,  -- 'YYYY-MM-DD', lokal vaxt
  kicks_total INTEGER, subs INTEGER, gift_subs INTEGER, redemptions INTEGER,
  score REAL, level TEXT, blocked INTEGER DEFAULT 0,
  first_seen INTEGER, last_seen INTEGER,
  PRIMARY KEY (channel_id, user_id))

events(
  id INTEGER PRIMARY KEY, channel_id TEXT, user_id TEXT,
  type TEXT, text TEXT, amount REAL,
  spoken INTEGER, skip_reason TEXT,
  raw_json TEXT, ts INTEGER)
-- index: (channel_id, user_id, ts), (channel_id, ts)
```

- Loyallıq hər kanal üçün ayrıca hesablanır.
- Mesajların mətni (`events.text`) həmişəlik saxlanılır. `raw_json` 7 gündən köhnə olanda açılışda və gündə bir dəfə `NULL` edilir.
- `spoken` və `skip_reason` dashboard logunu qidalandırır.
- "Məlumatı sil" düyməsi seçilmiş kanalda həmin tamaşaçının `events` və `channel_users` sətirlərini silir. Başqa kanalda sətri qalmayıbsa, `users` sətri də silinir.
- Streak hesablanması: bu gün = `last_active_day` olarsa heç nə dəyişmir. Dünən olarsa `streak + 1`. Başqa bir gün olarsa `streak = 1`. Bundan əlavə, yeni gün gələndə `days_active + 1` olur və `msgs_today = 0` sıfırlanır.

## 6. Loyallıq

```
score = days_active  × 10
      + streak       × 5
      + counted_msgs × 0.2    -- gündə maksimum 30 mesaj sayılır (msgs_today ilə)
      + kicks_total  × 0.5
      + subs         × 50
      + gift_subs    × 25
      + redemptions  × 2
```

Çəkilər bir faylda sabit saxlanılır (`loyalty.ts`). Score hər event-dən sonra yenidən hesablanır.

| Bal | Səviyyə |
|---|---|
| 0–49 | 🌱 Yeni |
| 50–199 | 👋 Tanış |
| 200–599 | ⭐ Daimi |
| 600–1499 | 💎 Sadiq |
| 1500+ | 👑 Əfsanə |

## 7. Filtr və oxuma qaydaları

**Toggle-lar (dashboard):**

| Toggle | Default |
|---|---|
| KICK hədiyyələri | ON |
| Channel points | ON (+ reward adlarının allow-list-i, vergüllə ayrılır, boş = hamısı) |
| Abunəlik / hədiyyə abunə | OFF |
| Bütün chat | OFF |
| Username-i də oxu | ON |
| Maksimum uzunluq | 200 simvol |

**Həmişə keçilir:**
- `!` ilə başlayan mesajlar
- streamerin öz mesajları
- botlar (`botrix, kickbot, kicklet, lumiastream, streamelements, nightbot, fossabot`)
- block list-dəki tamaşaçılar (`channel_users.blocked`)

Keçilən event-lər də DB-yə yazılır (statistika üçün), amma `spoken=0` və `skip_reason` ilə.

**Mətnin təmizlənməsi:** linklər silinir, emote-lar silinir, eyni simvolun uzun təkrarı qısaldılır (`aaaaaa` → `aaa`), mətn maksimum uzunluğa qədər kəsilir.

**Birbaşa oxuma mətni:**
- KICK: hədiyyə mesajı varsa o oxunur, yoxdursa `"<user> <amount> KICK göndərdi"`.
- Reward: `user_input` varsa o oxunur, yoxdursa reward adı.
- Chat: mesajın mətni.
- "Username-i də oxu" ON olanda mətnin əvvəlinə `"<user>: "` əlavə olunur.

## 8. Şablon cavablar (TemplateResponder)

Şablonlar yalnız mərhələ anlarında işə düşür:

| Trigger | Şərt | Nümunə | Default |
|---|---|---|---|
| `first_message` | kanalda ilk mesaj | "Xoş gəldin, {user}!" | OFF |
| `comeback` | 7+ gün aradan sonra ilk mesaj | "{user} {days} gün sonra qayıtdı!" | ON |
| `streak` | streak 3 / 7 / 14 / 30 olanda | "{user} {streak} gündür ardıcıl buradadır!" | ON |
| `msg_milestone` | msg_count 100 / 500 / 1000 / 5000 olanda | "Bu, {user}-in {n}-ci mesajıdır!" | ON |
| `level_up` | səviyyə qalxanda | "{user} artıq {level} səviyyəsindədir!" | ON |
| `spam` | 60 saniyədə 10-dan çox mesaj | "{user}, klaviaturanı bir az dincə burax 😄" | OFF |

- Hər trigger üçün bir neçə variant olur, təsadüfi biri seçilir. Mətnlər dashboard-da redaktə olunur və `settings_json`-da saxlanılır.
- **Limitlər:** hər tamaşaçıya bir trigger üçün sessiya ərzində 1 dəfə (sessiya = app-in açıq olduğu müddət). Bütün şablonlar üçün ümumi limit 30 saniyədə 1 dəfə.
- Şablonlar "Bütün chat" toggle-ı OFF olanda da işləyir. Blok edilmiş tamaşaçılar və botlar üçün işləmir.
- Şablon cümlələri `priority: 2`, səs yuvası `announcer`.

## 9. Səs

- **OSVoice:**
  - macOS: `say -v <voice> --file-format=WAVE --data-format=LEI16@22050 -o out.wav "text"`. Səs siyahısı `say -v '?'` ilə alınır.
  - Windows: PowerShell + `System.Speech.Synthesis.SpeechSynthesizer`, `SetOutputToWaveFile`. Səs siyahısı `GetInstalledVoices()` ilə alınır.
  - Mətn shell-ə heç vaxt string kimi qoşulmur: arqument massivi və ya stdin istifadə olunur (injection-a qarşı).
- **PiperVoice:** sherpa-onnx CLI (`sherpa-onnx-offline-tts`, Apache 2.0) + Piper VITS modelləri. Binary və model dashboard-dakı "Yüklə" düyməsi ilə app data qovluğuna endirilir. Orijinal `rhasspy/piper` arxivləşib, `piper1-gpl` GPL lisenziyalıdır, ona görə istifadə edilmir.
- **Səs yuvaları:**
  - `main`: default Türkcə OS səsi (Yelda/Tolga), yoxdursa ilk mövcud səs
  - `cyrillic`: mətndə `/[а-яё]/i` varsa istifadə olunur; default rus səsi (Milena/Irina)
  - `announcer`: şablon cavablar üçün; default `main` ilə eynidir, streamer başqa səs seçə bilər
- Sintez alınmasa OS `main` səsi ilə yenidən cəhd olunur, o da alınmasa element keçilir və logda göstərilir.
- WAV faylları temp qovluğunda saxlanılır, overlay "ended" siqnalı göndərəndən sonra silinir.

## 10. Növbə

- Prioritet növbəsi: 1 = KICK / reward / sub, 2 = şablon, 3 = chat. Eyni prioritet daxilində FIFO.
- Maksimum 15 element gözləyir. Növbə dolanda əvvəl ən köhnə 3-cü prioritetli element atılır, sonra 2-ci. Prioritet 1 heç vaxt atılmır (15 limitinə daxil deyil).
- Bir element oxunarkən növbəti element əvvəlcədən sintez olunur.
- Dashboard düymələri: **Keç** (cari səsi dayandırır), **Pauza / Davam**, **Test** (nümunə cümləni overlay-dən oxudur).

## 11. OBS overlay (`/overlay`)

- Overlay serverə WebSocket ilə qoşulur. Server `{id, audioUrl, text}` göndərir, overlay `<audio>` ilə oxudur və bitəndə `{type:"ended", id}` qaytarır. Növbəti element yalnız bundan sonra göndərilir.
- "Keç" düyməsində server `{type:"stop"}` göndərir.
- Overlay qoşulmayıbsa növbə pauza edilir və dashboard-da "OBS overlay qoşulmayıb" xəbərdarlığı çıxır. Element itmir.
- Fon şəffafdır. Altyazı seçimi var (mətni göstərir), default olaraq OFF.
- OBS-də "Control audio via OBS" seçilməlidir ki, səs OBS mikserinə getsin.

## 12. Dashboard (`http://localhost:7777/`)

- UI Azərbaycan dilindədir. Bütün mətnlər bir faylda saxlanılır (`i18n/az.ts`), Türkcə tərcümə v2-də əlavə olunacaq.
- Bölmələr:
  - bağlantı statusu (Pusher və overlay)
  - kanal quraşdırması (username, ehtiyat ID sahələri)
  - toggle-lar və filtrlər
  - səs yuvaları + "dinlə" düyməsi + Piper "Yüklə" düyməsi
  - şablon redaktoru
  - loyallıq: top 20, tamaşaçı axtarışı, profil (statistika, son mesajlar), blok, "məlumatı sil"
  - canlı log (son 100 event: oxundu / keçildi + səbəb)
- Dashboard canlı yenilənmə üçün eyni WebSocket serverinə qoşulur.
- Texnologiya: `Bun.serve` + HTML imports, sadə TypeScript, framework yoxdur.
- Server yalnız `127.0.0.1`-də dinləyir (şəbəkədən əlçatan deyil).

## 13. Paylanma və işə salma

- `bun build --compile` ilə hədəflər: `bun-windows-x64`, `bun-darwin-arm64`, `bun-darwin-x64`.
- Məlumat qovluğu (`settings`, `kick-tts.db`, `unknown-events.log`, modellər):
  - macOS: `~/Library/Application Support/KickTTS/`
  - Windows: `%APPDATA%\KickTTS\`
- İlk açılışda dashboard default brauzerdə avtomatik açılır.
- Port 7777 məşğuldursa (app artıq açıqdır), ikinci nüsxə dashboard-u brauzerdə açıb çıxır.
- README Azərbaycan dilində, qısa və texniki olmayan istifadəçi üçün yazılır:
  1. app-i aç
  2. Kick username-ini yaz
  3. OBS-də Browser Source əlavə et, URL `http://localhost:7777/overlay`, "Control audio via OBS" seç
  4. Test düyməsini bas
  - macOS-da imzasız app üçün "sağ klik → Open" addımı göstərilir.

## 14. Xəta idarəsi

| Hal | Davranış |
|---|---|
| Realtime açar sorğusu alınmadı | ehtiyat açar istifadə olunur, logda qeyd edilir |
| Kanal ID sorğusu 403 verdi | dashboard-da əl ilə daxil etmə təlimatı göstərilir |
| Pusher bağlantısı kəsildi | 1 saniyədən 30 saniyəyə qədər artan fasilələrlə yenidən qoşulur, status UI-da görünür |
| `pusher:error` | UI-da göstərilir |
| Event parse alınmadı | xam event `unknown-events.log` faylına yazılır, app dayanmır |
| TTS xətası | OS `main` səsi ilə yenidən cəhd olunur, o da alınmasa element keçilir və logda göstərilir |
| DB yazma xətası | logda göstərilir, səslənmə davam edir |
| Overlay qoşulmayıb | növbə pauza edilir, xəbərdarlıq çıxır |

## 15. Testlər

- **Unit testlər (`bun test`):**
  - normalizer: bölmə 4-dəki hər payload forması, emote silinməsi, iki dəfə JSON parse, natamam `KicksGifted`
  - filtr: botlar, `!` əmrləri, streamerin öz mesajı, link, simvol spamı, uzunluq kəsilməsi
  - loyallıq: formul, gündə 30 mesaj limiti, streak və gün keçidi, səviyyə sərhədləri
  - şablonlar: hər trigger şərti, sessiya limiti, 30 saniyəlik ümumi limit
  - növbə: prioritet, atma qaydası, prioritet 1-in qorunması
  - Store: "məlumatı sil" düyməsi, `raw_json`-un 7 gündən sonra təmizlənməsi
- **Canlı sınaq (əl ilə skript):** aktiv bir Kick kanalında 60 saniyə; chat gəlir və "Bütün chat" rejimində oxunur; `RewardRedeemedEvent` gəlsə düzgün parse olunur. Kanal `https://kick.com/stream/livestreams/en?page=1&limit=3&sort=desc` ünvanından tapılır, Cloudflare bloklasa böyük bir streamer seçilir.
- **Overlay sınağı:** yaradılmış WAV overlay səhifəsində oxunur və "ended" siqnalı serverə qayıdır.

## 16. Açıq məsələlər (implementasiyadan əvvəl və ya zamanı)

- Türkcə Piper modellərinin (`fahrettin`, `fettah`, `dfki`) lisenziyaları kommersiya istifadəsi üçün yoxlanmalıdır.
- `KicksGifted` və subscription event-lərinin real payload-ları canlı nümunə ilə təsdiqlənməlidir.
- Mesajların saxlanılması üçün məxfilik siyasətinin mətni lazımdır (GDPR, KVKK, Azərbaycanın fərdi məlumat qanunu).
- Məhsulun son adı hələ müəyyən deyil ("Kick TTS" müvəqqəti addır).
- Kod imzalanması (Apple $99/il, Windows sertifikatı) v1-dən sonra həll ediləcək.
