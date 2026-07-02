import { createBundledHighlighter } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type {
  HighlighterGeneric,
  ThemedToken,
  TokensResult,
} from "shiki/core";

export type SupportedCodeLanguage =
  | "css"
  | "javascript"
  | "typescript"
  | "json";
type SupportedCodeTheme = "github-light" | "github-dark";

type ThemeInput = SupportedCodeTheme | { name?: string };

type HighlightOptions = {
  code: string;
  language: string;
  themes: [ThemeInput, ThemeInput];
};

type CodeHighlighterPlugin = {
  getSupportedLanguages: () => SupportedCodeLanguage[];
  getThemes: () => [SupportedCodeTheme, SupportedCodeTheme];
  highlight: (
    options: HighlightOptions,
    callback?: (result: TokensResult) => void
  ) => TokensResult | null;
  name: "shiki";
  supportsLanguage: (language: string) => boolean;
  type: "code-highlighter";
};

const SUPPORTED_LANGUAGES: SupportedCodeLanguage[] = [
  "css",
  "javascript",
  "typescript",
  "json",
];

export const normalizeCodeLanguage = (
  language: string
): SupportedCodeLanguage | null => {
  const normalized = language.toLowerCase().trim();

  if (normalized === "css") {
    return "css";
  }

  if (normalized === "js" || normalized === "javascript" || normalized === "jsx") {
    return "javascript";
  }

  if (normalized === "ts" || normalized === "typescript" || normalized === "tsx") {
    return "typescript";
  }

  if (normalized === "json" || normalized === "jsonc") {
    return "json";
  }

  return null;
};

const createHighlighter = createBundledHighlighter<
  SupportedCodeLanguage,
  SupportedCodeTheme
>({
  langs: {
    css: () => import("@shikijs/langs/css"),
    javascript: () => import("@shikijs/langs/javascript"),
    typescript: () => import("@shikijs/langs/typescript"),
    json: () => import("@shikijs/langs/json"),
  },
  themes: {
    "github-light": () => import("@shikijs/themes/github-light"),
    "github-dark": () => import("@shikijs/themes/github-dark"),
  },
  engine: () => createJavaScriptRegexEngine({ forgiving: true }),
});

const highlighterCache = new Map<
  string,
  Promise<HighlighterGeneric<SupportedCodeLanguage, SupportedCodeTheme>>
>();

const tokensCache = new Map<string, TokensResult>();
const subscribers = new Map<string, Set<(result: TokensResult) => void>>();

const getThemeName = (theme: ThemeInput): SupportedCodeTheme =>
  typeof theme === "string" && theme === "github-dark"
    ? "github-dark"
    : "github-light";

const getHighlighter = (
  language: SupportedCodeLanguage
): Promise<HighlighterGeneric<SupportedCodeLanguage, SupportedCodeTheme>> => {
  const cached = highlighterCache.get(language);
  if (cached) {
    return cached;
  }

  const highlighterPromise = createHighlighter({
    langs: [language],
    themes: ["github-light", "github-dark"],
  });

  highlighterCache.set(language, highlighterPromise);
  return highlighterPromise;
};

const getTokensCacheKey = (
  code: string,
  language: SupportedCodeLanguage,
  themes: [SupportedCodeTheme, SupportedCodeTheme]
) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${themes[0]}:${themes[1]}:${code.length}:${start}:${end}`;
};

export const highlightLimitedCode = (
  code: string,
  language: string,
  themes: [ThemeInput, ThemeInput] = ["github-light", "github-dark"],
  callback?: (result: TokensResult) => void
): TokensResult | null => {
  const supportedLanguage = normalizeCodeLanguage(language);
  if (!supportedLanguage) {
    return null;
  }

  const themeNames: [SupportedCodeTheme, SupportedCodeTheme] = [
    getThemeName(themes[0]),
    getThemeName(themes[1]),
  ];
  const tokensCacheKey = getTokensCacheKey(code, supportedLanguage, themeNames);

  const cached = tokensCache.get(tokensCacheKey);
  if (cached) {
    return cached;
  }

  if (callback) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set());
    }
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  getHighlighter(supportedLanguage)
    .then((highlighter) => {
      const result = highlighter.codeToTokens(code, {
        lang: supportedLanguage,
        themes: {
          light: themeNames[0],
          dark: themeNames[1],
        },
      });

      tokensCache.set(tokensCacheKey, result);

      const subs = subscribers.get(tokensCacheKey);
      if (subs) {
        for (const sub of subs) {
          sub(result);
        }
        subscribers.delete(tokensCacheKey);
      }
    })
    .catch((error) => {
      console.error("Failed to highlight code:", error);
      subscribers.delete(tokensCacheKey);
    });

  return null;
};

export const limitedCodeHighlighter: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  supportsLanguage(language) {
    return normalizeCodeLanguage(language) !== null;
  },
  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  },
  getThemes() {
    return ["github-light", "github-dark"];
  },
  highlight({ code, language, themes }, callback) {
    return highlightLimitedCode(code, language, themes, callback);
  },
};

export const createRawCodeTokens = (code: string): TokensResult => ({
  bg: "transparent",
  fg: "inherit",
  tokens: code.split("\n").map((line) =>
    line === ""
      ? []
      : [
          {
            color: "inherit",
            content: line,
          } as ThemedToken,
        ]
  ),
});
