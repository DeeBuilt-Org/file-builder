import type { ComponentType, ReactNode } from "react";
import {
  InboxOutlined,
  CompressOutlined,
  SwapOutlined,
  ExpandOutlined,
  FilePdfOutlined,
  AppstoreOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import { PackagePanel, PackageCanvas } from "@/components/modes/package/PackageMode";
import { OrganizeCanvas, OrganizePanel } from "@/components/modes/organize/OrganizeMode";
import { SignFillCanvas, SignFillPanel } from "@/components/modes/signfill/SignFillMode";
import { CompressCanvas, CompressPanel } from "@/components/modes/image/CompressMode";
import { ConvertCanvas, ConvertPanel } from "@/components/modes/image/ConvertMode";
import { ResizeCanvas, ResizePanel } from "@/components/modes/image/ResizeMode";
import { ImagesToPdfCanvas, ImagesToPdfPanel } from "@/components/modes/imagepdf/ImagesToPdfMode";
import {
  ProtectCanvas,
  ProtectPanel,
  PROTECT_ACCENT,
} from "@/components/modes/security/ProtectMode";
import { UnlockCanvas, UnlockPanel, UNLOCK_ACCENT } from "@/components/modes/security/UnlockMode";

/**
 * The Mode registry — the single source of truth that drives the whole shell.
 *
 * Every mode is one entry here. The left rail, the canvas empty-state copy, the
 * accepted-format chips, and which control-panel renders all read from this
 * list. Adding a capability to File Builder = add a `ModeDef` here plus its two
 * components (Canvas + Panel). Never a layout change — that's the "globalize,
 * don't hardcode" rule made concrete, and it's what lets this grow into the
 * full Smallpdf-class suite over time.
 */
export type ModeId =
  | "package"
  | "compress"
  | "convert"
  | "resize"
  | "images-to-pdf"
  | "organize"
  | "sign-fill"
  | "protect"
  | "unlock";

/**
 * Rail groups. The rail is drawn flat, but a small divider is inserted whenever
 * the group changes between two adjacent modes. Image/file utilities and PDF
 * editing are different families (one operates on images, the other on a PDF you
 * already have), so they read as two labeled clusters — Ruthnie's directive.
 */
export type ModeGroup = "file" | "pdf";

/** Props both the Canvas and Panel of a mode receive from the shell. */
export interface ModeSurfaceProps {
  /** Live in dark mode — modes that paint their own surfaces need to know. */
  isDark: boolean;
  /** Switch the active mode, for "Continue in …" hand-offs between modes. */
  goToMode: (id: ModeId) => void;
}

export interface ModeDef {
  id: ModeId;
  /**
   * Which rail cluster this mode belongs to. A divider is drawn in the rail
   * whenever this differs from the previous mode's group. Defaults to "file".
   */
  group?: ModeGroup;
  /** Short label under the rail icon and in the panel title. */
  label: string;
  /** One-line description shown in the canvas empty state. */
  blurb: string;
  /** Rail + panel-title icon. */
  icon: ReactNode;
  /**
   * Accent color for this mode's rail highlight + panel icon. Mirrors Smallpdf's
   * per-tool colored tiles so the suite reads as distinct tools, not one form.
   */
  accent: string;
  /** Human-readable accepted formats, shown as chips in the empty state. */
  accepts: string[];
  /** Whether this mode is live. `false` renders a friendly "coming soon". */
  ready: boolean;
  /** The big center surface (upload drop-zone / preview). */
  Canvas: ComponentType<ModeSurfaceProps>;
  /** The right-hand options + action panel. */
  Panel: ComponentType<ModeSurfaceProps>;
}

export const MODES: ModeDef[] = [
  {
    id: "package",
    label: "Bundle",
    blurb: "Drop any files, name them, group them into folders, and download one clean ZIP.",
    icon: <InboxOutlined />,
    accent: "#2f4f46",
    accepts: ["Any file type"],
    ready: true,
    Canvas: PackageCanvas,
    Panel: PackagePanel,
  },
  {
    id: "compress",
    label: "Compress",
    blurb: "Shrink an image's file size with a live before-and-after estimate.",
    icon: <CompressOutlined />,
    accent: "#c0392b",
    accepts: ["PNG", "JPG", "WebP"],
    ready: true,
    Canvas: CompressCanvas,
    Panel: CompressPanel,
  },
  {
    id: "convert",
    label: "Convert",
    blurb: "Change an image between PNG, JPG, and WebP.",
    icon: <SwapOutlined />,
    accent: "#8e44ad",
    accepts: ["PNG", "JPG", "WebP"],
    ready: true,
    Canvas: ConvertCanvas,
    Panel: ConvertPanel,
  },
  {
    id: "resize",
    label: "Resize",
    blurb: "Scale an image to a target width or a preset size.",
    icon: <ExpandOutlined />,
    accent: "#2980b9",
    accepts: ["PNG", "JPG", "WebP"],
    ready: true,
    Canvas: ResizeCanvas,
    Panel: ResizePanel,
  },
  {
    id: "images-to-pdf",
    label: "Images → PDF",
    blurb: "Combine a set of images into a single PDF, one image per page.",
    icon: <FilePdfOutlined />,
    accent: "#d35400",
    accepts: ["PNG", "JPG", "WebP"],
    ready: true,
    Canvas: ImagesToPdfCanvas,
    Panel: ImagesToPdfPanel,
  },
  {
    id: "organize",
    group: "pdf",
    label: "Organize",
    blurb: "Reorder, rotate, delete, and extract pages — or merge several PDFs into one.",
    icon: <AppstoreOutlined />,
    accent: "#0f766e",
    accepts: ["PDF"],
    ready: true,
    Canvas: OrganizeCanvas,
    Panel: OrganizePanel,
  },
  {
    id: "sign-fill",
    group: "pdf",
    label: "Sign & Fill",
    blurb: "Add a signature, type text, drop a date or checkmark, or cover-and-replace — right in your browser.",
    icon: <EditOutlined />,
    accent: "#7c3aed",
    accepts: ["PDF"],
    ready: true,
    Canvas: SignFillCanvas,
    Panel: SignFillPanel,
  },
  {
    id: "protect",
    group: "pdf",
    label: "Protect",
    blurb: "Add a password to a PDF. It is encrypted in your browser and never uploaded.",
    icon: <LockOutlined />,
    accent: PROTECT_ACCENT,
    accepts: ["PDF"],
    ready: true,
    Canvas: ProtectCanvas,
    Panel: ProtectPanel,
  },
  {
    id: "unlock",
    group: "pdf",
    label: "Unlock",
    blurb: "Remove a password you know from a PDF.",
    icon: <UnlockOutlined />,
    accent: UNLOCK_ACCENT,
    accepts: ["PDF"],
    ready: true,
    Canvas: UnlockCanvas,
    Panel: UnlockPanel,
  },
];

export const MODE_MAP: Record<ModeId, ModeDef> = MODES.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ModeId, ModeDef>,
);
