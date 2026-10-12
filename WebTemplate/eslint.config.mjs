import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "intellect-ai-dashboard-template/**",
      "__MACOSX/**",
      ".next/**",
      "voice-service/**",
    ],
  },
];

export default eslintConfig;
