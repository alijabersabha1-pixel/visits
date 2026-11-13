import type { MetadataRoute } from "next";

/** تطبيق الميدان بينزل على الشاشة الرئيسية (PWA)، وبيفتح بدون شريط المتصفح */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "زيارات السفراء — جوال",
    short_name: "الميدان",
    description: "تسجيل الزيارات وحالات VPN والبطاقات من الميدان، حتى بدون نت",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#ffffff",
    theme_color: "#115d92",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
