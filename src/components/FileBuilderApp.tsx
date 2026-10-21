import { useState } from "react";
import { App as AntApp } from "antd";
import { ThemeProvider, useThemeMode } from "@/lib/theme";
import Shell from "@/components/Shell";
import { AppShell } from "@/components/shell/AppShell";
import { PackageProvider } from "@/components/modes/package/PackageContext";
import { OrganizeProvider } from "@/components/modes/organize/OrganizeContext";
import { SignFillProvider } from "@/components/modes/signfill/SignFillContext";
import { ImageWorkProvider } from "@/components/modes/image/ImageWorkContext";
import { ImagesToPdfProvider } from "@/components/modes/imagepdf/ImagesToPdfContext";
import type { ModeId } from "@/lib/modes";

/**
 * FileBuilderApp — the top-level. Owns which mode is active and hosts the
 * theme, AntD App context, and the Package mode's state provider. The Smallpdf
 * workspace (rail / canvas / panel) is rendered by AppShell inside the
 * chrome Shell.
 */
function FileBuilderInner() {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const [activeMode, setActiveMode] = useState<ModeId>("package");

  return (
    <Shell>
      {(footer) => (
        <AppShell
          activeMode={activeMode}
          onModeChange={setActiveMode}
          isDark={isDark}
          footer={footer}
        />
      )}
    </Shell>
  );
}

export function FileBuilderApp() {
  return (
    <ThemeProvider>
      <AntApp>
        <PackageProvider>
          <ImageWorkProvider>
            <ImagesToPdfProvider>
              <OrganizeProvider>
                <SignFillProvider>
                  <FileBuilderInner />
                </SignFillProvider>
              </OrganizeProvider>
            </ImagesToPdfProvider>
          </ImageWorkProvider>
        </PackageProvider>
      </AntApp>
    </ThemeProvider>
  );
}
