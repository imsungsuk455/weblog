export const SITE = {
  website: "https://drnomad.pages.dev/", // replace this with your deployed domain
  author: "닥터노마드(Dr. Nomad)",
  profile: "/",
  desc: "쏟아지는 경제 기사와 코인 시황 속에서 진짜 필요한 정보만 노트에 필기하듯 깔끔하게 정리해 드립니다. 투자의 기준이 되는 팩트와 인사이트를 만나보세요.",
  title: "닥터노마드 | 당신의 자산을 지키는 매일의 경제 기록",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 4,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: true,
    text: "페이지 수정",
    url: "https://github.com/satnaing/astro-paper/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "ko", // html lang code. Set this empty and default will be "en"
  timezone: "Asia/Seoul", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
} as const;
