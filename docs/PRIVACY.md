# Privacy

Masta Wastra is local first. This is what leaves the phone, and when.

| Data | Where it goes | When | Can I stop it? |
|---|---|---|---|
| Photos, closet, outfits, history, settings | Nowhere. IndexedDB on the device only | Never | Not applicable |
| Background removal | Runs on the device (IMG.LY, WASM in a Web Worker). The model files are downloaded once from IMG.LY's CDN; no photo is sent | First use downloads about 56 MB | Choose "Later, I will crop by hand" |
| Clothes parser (removes the person from product photos) | Runs on the device (segformer_b2_clothes, ONNX, WASM). The 29 MB model is downloaded once from Hugging Face; no photo is sent | With the one time setup | Choose "Later, I will crop by hand" |
| Cut-out of one piece (background removed, mid grey backdrop, 512 px long edge, WebP) | Our `/api/tag` route, then Google Gemini (`gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`) | Once per piece, right after it is added, or when you tap "Recognise again with AI" | Settings > Recognise pieces with AI: off |
| Location rounded to 2 decimals (about 1 km) | Open-Meteo forecast API, directly from the browser | When you tap Pick my outfit, at most once an hour per place | Pick a city or pick the weather by hand |
| City name you type | Open-Meteo geocoding API | When you search | Pick the weather by hand |

Google's free tier for the Gemini API says "Used to improve our products: Yes". The app says so in the one time setup sheet before the first piece is recognised, and in About > Privacy.

Our server (Vercel) holds no user data. It issues an anonymous install token (a random id and a timestamp, signed), keeps request counters in Upstash Redis (keys expire within a day), and logs only counts and error codes. It never logs images or tags.

Export: Settings > Back up closet (with or without photos). The install token is never included in a backup.
Delete: Settings > Delete everything clears IndexedDB, Cache Storage, local storage and unregisters the service worker.
