// 멀티사이트 설정: 단일 레포로 3개 도메인을 빌드한다.
// 빌드 시 환경변수 SITE_ID=nomad|motors|kkul 로 사이트를 선택.
// Cloudflare Pages 프로젝트마다 SITE_ID를 다르게 설정할 것.
// 로컬 기본값은 nomad (기존 동작 유지).

const SITE_ID = import.meta.env.SITE_ID ?? "nomad";

type SiteConf = {
  website: string;
  author: string;
  brand: string;
  profile: string;
  desc: string;
  title: string;
  ogImage: string;
  lightAndDarkMode: boolean;
  postPerIndex: number;
  postPerPage: number;
  scheduledPostMargin: number;
  showArchives: boolean;
  showBackButton: boolean;
  editPost: { enabled: boolean; text: string; url: string };
  dynamicOgImage: boolean;
  dir: "ltr" | "rtl" | "auto";
  lang: string;
  timezone: string;
};

const COMMON = {
  profile: "/",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 4,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: false, // 승인 심사 중에는 GitHub 편집 링크 노출 금지 (풋프린트 방지)
    text: "페이지 수정",
    url: "https://github.com/imsungsuk455/weblog/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr" as const, // "rtl" | "auto"
  lang: "ko", // html lang code. Set this empty and default will be "en"
  timezone: "Asia/Seoul", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
};

const SITES: Record<string, SiteConf> = {
  nomad: {
    ...COMMON,
    website: "https://doctornomad.org/",
    author: "Dr. Nomad",
    brand: "닥터노마드",
    desc: "쏟아지는 경제 기사와 코인 시황 속에서 진짜 필요한 정보만 노트에 필기하듯 깔끔하게 정리해 드립니다. 투자의 기준이 되는 팩트와 인사이트를 만나보세요.",
    title: "닥터노마드 | 당신의 자산을 지키는 매일의 경제 기록",
  },
  motors: {
    ...COMMON,
    website: "https://doctormotors.org/",
    author: "Dr. Motors",
    brand: "닥터모터스",
    desc: "자동차 최신 뉴스, 시승기, 관리 팁 등 자동차에 관한 모든 정보를 전문가의 시선으로 깔끔하게 정리해 드립니다. 당신의 카 라이프를 위한 완벽한 가이드.",
    title: "닥터모터스 | 자동차의 모든 정보를 전문가의 시선으로",
  },
  kkul: {
    ...COMMON,
    website: "https://kkullog.org/",
    author: "Kkul-log",
    brand: "꿀로그",
    desc: "세상의 모든 매력적인 아이템을 한눈에! IT 기기부터 맛있는 식품까지, 당신의 현명한 쇼핑을 돕는 꿀같은 정보를 배달해 드립니다.",
    title: "꿀로그의 꿀템 세상 | 당신을 위한 쇼핑 가이드",
  },
};

export const SITE_ID_CURRENT = SITE_ID in SITES ? SITE_ID : "nomad";

export const SITE: SiteConf = SITES[SITE_ID_CURRENT];
