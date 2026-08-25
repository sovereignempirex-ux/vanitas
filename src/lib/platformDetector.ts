import { DetectedPlatform } from '../types.ts';

export interface PlatformInfo {
  detectedPlatform: DetectedPlatform;
  isMobile: boolean;
  isDesktop: boolean;
  recommendedType: 'apk' | 'exe' | 'dmg' | 'appimage';
  label: string;
  osName: string;
  architecture: string;
  iconType: 'smartphone' | 'laptop' | 'globe';
}

export function detectUserPlatform(): PlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      detectedPlatform: 'desktop_windows',
      isMobile: false,
      isDesktop: true,
      recommendedType: 'exe',
      label: 'Windows Computer (PC)',
      osName: 'Windows 10/11 x64',
      architecture: 'x86_64',
      iconType: 'laptop',
    };
  }

  const userAgent = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isTouchScreen = maxTouchPoints > 1;

  // Android Detection
  if (userAgent.includes('android')) {
    return {
      detectedPlatform: 'mobile_android',
      isMobile: true,
      isDesktop: false,
      recommendedType: 'apk',
      label: 'Android Phone / Tablet',
      osName: 'Android (APK Installer)',
      architecture: 'arm64-v8a / armeabi-v7a',
      iconType: 'smartphone',
    };
  }

  // iOS Detection (iPhone / iPad / iPod)
  if (
    userAgent.includes('iphone') ||
    userAgent.includes('ipad') ||
    userAgent.includes('ipod') ||
    (platform.includes('mac') && isTouchScreen)
  ) {
    return {
      detectedPlatform: 'mobile_ios',
      isMobile: true,
      isDesktop: false,
      recommendedType: 'apk', // Provide APK download with note, or direct mobile package
      label: 'Apple iOS Device (iPhone / iPad)',
      osName: 'iOS / iPadOS',
      architecture: 'ARM64',
      iconType: 'smartphone',
    };
  }

  // Windows PC Detection
  if (userAgent.includes('windows') || platform.includes('win')) {
    return {
      detectedPlatform: 'desktop_windows',
      isMobile: false,
      isDesktop: true,
      recommendedType: 'exe',
      label: 'Windows Computer (PC)',
      osName: 'Windows 10/11 (64-bit)',
      architecture: 'x86_64',
      iconType: 'laptop',
    };
  }

  // macOS Desktop Detection
  if (userAgent.includes('macintosh') || platform.includes('mac')) {
    return {
      detectedPlatform: 'desktop_mac',
      isMobile: false,
      isDesktop: true,
      recommendedType: 'dmg',
      label: 'Apple Mac (macOS)',
      osName: 'macOS Sonoma / Ventura',
      architecture: 'Apple Silicon (M1/M2/M3) & Intel',
      iconType: 'laptop',
    };
  }

  // Linux Desktop Detection
  if (userAgent.includes('linux') || platform.includes('linux')) {
    return {
      detectedPlatform: 'desktop_linux',
      isMobile: false,
      isDesktop: true,
      recommendedType: 'appimage',
      label: 'Linux Computer',
      osName: 'Linux (Ubuntu/Debian/Arch/Fedora)',
      architecture: 'x86_64 AppImage',
      iconType: 'laptop',
    };
  }

  // Fallback check based on screen width
  const isSmallScreen = window.innerWidth <= 768;
  if (isSmallScreen) {
    return {
      detectedPlatform: 'mobile_android',
      isMobile: true,
      isDesktop: false,
      recommendedType: 'apk',
      label: 'Mobile Device',
      osName: 'Mobile OS',
      architecture: 'ARM64',
      iconType: 'smartphone',
    };
  }

  return {
    detectedPlatform: 'desktop_windows',
    isMobile: false,
    isDesktop: true,
    recommendedType: 'exe',
    label: 'Desktop Computer',
    osName: 'Windows / PC',
    architecture: 'x86_64',
    iconType: 'laptop',
  };
}
