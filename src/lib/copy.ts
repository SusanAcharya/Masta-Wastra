// Every user-facing string lives here. tests/unit/copy.test.ts bans long dashes.

export const SOURCE_URL = "https://github.com/SusanAcharya/masta-wastra";
export const LOUNGE_URL = "https://www.designlounge.live";
export const OPEN_METEO_URL = "https://open-meteo.com/";

export const copy = {
  app: {
    name: "Masta Wastra",
    shortName: "Wastra",
    description: "Snap each piece once. Three outfits every morning, picked for the weather.",
  },
  tabs: {
    today: "Today",
    closet: "Closet",
    scan: "Scan",
    history: "History",
    settings: "Settings",
    nav: "Primary",
  },
  today: {
    title: "Today",
    emptyTitle: "No looks yet",
    emptyBody: "Snap a few pieces and three outfits arrive every morning, picked for the weather.",
    emptyAction: "Scan an item",
  },
  closet: {
    title: "Closet",
    emptyTitle: "Nothing hanging yet",
    emptyBody: "Photograph each piece once. It is cut out on your phone and hangs here.",
    emptyAction: "Scan an item",
  },
  history: {
    title: "History",
    emptyTitle: "No outfits worn yet",
    emptyBody: "Pick a look on Today and it lands here, day by day.",
    emptyAction: "Open Today",
  },
  scan: {
    title: "Closet scan",
    headline: "Snap it once",
    body: "Lay the piece flat on a bed or hang it on a door. Plain background, daylight, the whole item in frame.",
    close: "Close scan",
  },
  settings: {
    title: "Settings",
    appearance: "Appearance",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    themeHint: "System follows your phone's light or dark setting.",
    aboutSection: "About",
    about: "About and credits",
    aboutSupport: "Licences, source code, weather data",
  },
  common: {
    cancel: "Cancel",
    save: "Save",
  },
  about: {
    title: "About",
    headline: "Masta Wastra",
    meaning: "Masta means carefree. Wastra means clothing. A wardrobe that dresses you in the morning.",
    how: "Photos are cut out on your phone. Each piece is tagged once. Outfits come from rules about weather, colour and occasion, not from AI, so they are instant, free and work offline.",
    sourceLabel: "Source code",
    sourceAction: "Read the source",
    sourceBody: "Masta Wastra is free software under the GNU AGPL 3.0, because it uses IMG.LY background removal.",
    creditsLabel: "Credits",
    weather: "Weather data by Open-Meteo.com",
    weatherLicence: "Weather data is CC BY 4.0.",
    fonts: "Bodoni Moda and Tenor Sans, SIL Open Font License.",
    cutout: "Background removal by IMG.LY, AGPL 3.0.",
    icons: "Lounge Icons, with a few from Lucide (ISC).",
    back: "Back",
  },
  credit: {
    prefix: "Designed using",
    name: "Design Lounge",
  },
  offline: {
    title: "You are offline",
    body: "This page was not saved for offline use yet. Your closet and today's looks still work.",
    action: "Open Today",
  },
} as const;
