// Curated list for the hotel guest-language picker (hotels.languages, max 10
// per docs/erd.md). Not an exhaustive ISO 639-1 list — just common
// hospitality guest languages; extend as needed.

export interface LanguageOption {
  code: string;
  label: string;
}

export const SUPPORTED_GUEST_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pl", label: "Polish" },
  { code: "el", label: "Greek" },
  { code: "hr", label: "Croatian" },
  { code: "sl", label: "Slovenian" },
  { code: "sr", label: "Serbian" },
  { code: "hu", label: "Hungarian" },
  { code: "cs", label: "Czech" },
];

export function languageLabel(code: string): string {
  return SUPPORTED_GUEST_LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
}
