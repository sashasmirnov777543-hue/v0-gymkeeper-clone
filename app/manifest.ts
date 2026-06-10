import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Жимовой блок — трекер тренировок",
    short_name: "Жимовой блок",
    description:
      "Персональная программа жима лёжа: 13 циклов, логирование подходов и автоподбор веса по RIR. Работает офлайн.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#18181b",
    theme_color: "#18181b",
    lang: "ru",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
