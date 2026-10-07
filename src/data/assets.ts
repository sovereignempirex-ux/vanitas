import { getApiBaseUrl, getPortalUrl } from '../lib/runtime.ts';

export const BRAND_ASSETS = {
  // Bundled locally in /public/images — no external image dependencies.
  logo: '/images/logo.svg',
  heroBanner: '/images/overview-hero.jpg',
  name: 'Vanitas',
  tagline: 'Centralized API, Developer, Security & Intelligence Platform',
  centralApiUrl: getApiBaseUrl(),
  portalUrl: getPortalUrl(),
  icons: {
    // `path` is the served URL; `filename` is the on-disk name in
    // public/images/. Both must exist — these three were declared for a
    // long time while pointing at files that were never in the repo.
    website: {
      title: 'Vanitas Web Portal Icon',
      format: 'SVG / PNG Favicon',
      description: 'Official crystal sapphire emblem for the web portal and cloud console.',
      badge: 'Web Favicon (SVG, scales to any size)',
      filename: 'vanitas-web-crystal.svg',
      path: '/images/vanitas-web-crystal.svg',
    },
    application: {
      title: 'Vanitas Mobile & PWA App Icon',
      format: 'Adaptive Vector Icon (APK / WebApp)',
      description: 'Prismatic crystal icon with squircle glass frame for Android APK and iOS PWA.',
      badge: 'App Icon (1024x1024)',
      filename: 'vanitas-app-icon.png',
      path: '/images/vanitas-app-icon.png',
    },
    desktopExe: {
      title: 'Vanitas Windows Desktop (.exe) Icon',
      format: 'ICO / High-Res Vector Installer Icon',
      description: 'Hexagonal crystal core with titanium outer rim for Windows 10/11 x64 installer executable.',
      badge: 'Windows EXE (256x256 ICO)',
      filename: 'vanitas-desktop-installer.ico',
      path: '/images/vanitas-desktop-installer.ico',
    },
  } satisfies Record<string, {
    title: string;
    format: string;
    description: string;
    badge: string;
    filename: string;
    path: string;
  }>,
};

export const CHARACTER_AVATARS = [
  {
    id: 'vanitas_classic',
    name: 'Vanitas Sovereign',
    subtitle: 'Bearer of the Blue Moon Grimoire',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop',
    accentColor: '#3b82f6',
  },
  {
    id: 'vanitas_blue_eye',
    name: 'Vanitas Celestial',
    subtitle: 'Hourglass Ingress',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
    accentColor: '#60a5fa',
  },
  {
    id: 'vanitas_night',
    name: 'Vanitas Noir',
    subtitle: 'Security Command Master',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=800&auto=format&fit=crop',
    accentColor: '#2563eb',
  },
];
