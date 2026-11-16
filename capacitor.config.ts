import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.latentdev.athlete",
  appName: "Athlete",
  // CAP=1 build output (see "build:ios"): same bundle as the web app, served
  // from the app's own scheme instead of GitHub Pages.
  webDir: "dist",
  ios: {
    // Safe areas are handled in CSS with env(safe-area-inset-*), the web view
    // fills the whole screen.
    contentInset: "never",
    backgroundColor: "#0c0b0a",
  },
  plugins: {
    Keyboard: {
      // The layout hides the bottom nav itself when the keyboard opens
      // (visualViewport), so the web view must not resize on top of that.
      resize: "none",
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0c0b0a",
    },
  },
};

export default config;
