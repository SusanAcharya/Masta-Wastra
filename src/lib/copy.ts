// Every user-facing string lives here. tests/unit/copy.test.ts bans long dashes.

export const SOURCE_URL = "https://github.com/SusanAcharya/Masta-Wastra";
export const LOUNGE_URL = "https://www.designlounge.live";
export const OPEN_METEO_URL = "https://open-meteo.com/";

export const copy = {
  app: {
    name: "Masta Wastra",
    shortName: "Wastra",
    description: "Snap each piece once. Three outfits every morning, picked for the weather.",
  },
  tabs: {
    today: "Outfits",
    closet: "Closet",
    scan: "Add",
    history: "History",
    settings: "Settings",
    nav: "Primary",
  },
  welcome: {
    skip: "Skip",
    next: "Continue",
    start: "Add my first piece",
    carousel: "Introduction",
    slides: [
      {
        title: "Snap it once",
        body: "Photograph each piece of clothing one time. A shirt, your jeans, the good shoes.",
      },
      {
        title: "Cut out on your phone",
        body: "The background is removed right on this phone. Your photos are never uploaded to be cut out.",
      },
      {
        title: "Three outfits every morning",
        body: "Each morning you get three outfits picked for the weather and your day. Swipe right on the one you wear.",
      },
    ],
  },
  today: {
    title: "Today's outfits",
    exampleLabel: "Example",
    exampleReason: "Two quiet pieces and one accent. Mild, so no jacket.",
    emptyTitle: "Your outfits appear here",
    emptyBody: "Add a top, a bottom and a pair of shoes. Your first three outfits are ready the moment you do.",
    emptyAction: "Add your first piece",
    need: "Still needed",
  },
  closet: {
    title: "Your closet",
    count: (n: number) => (n === 1 ? "1 piece" : `${n} pieces`),
    emptyBody: "Every piece you photograph hangs here, cut out and tagged. Start with these three.",
    emptyAction: "Add a piece",
    slots: { top: "Tops", bottom: "Bottoms", shoes: "Shoes" },
    none: "None yet",
  },
  history: {
    title: "History",
    emptyTitle: "Nothing worn yet",
    emptyBody: "When you pick an outfit in the morning, it is saved here day by day. Later you will see what you wear most and what you never wear.",
    emptyAction: "See today's outfits",
    week: "This week",
  },
  scan: {
    title: "Add a piece",
    headline: "Snap it once",
    body: "Lay the piece flat on a bed or hang it on a door.",
    tips: ["Plain background", "Daylight, no flash", "The whole piece in frame"],
    soon: "Taking photos arrives in the next update.",
    close: "Close",
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
    body: "This page was not saved for offline use yet. Your closet and today's outfits still work.",
    action: "See today's outfits",
  },
} as const;
