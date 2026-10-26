import {
  Folder,
  Users,
  Briefcase,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  BookOpen,
  Gauge,
  Megaphone,
  Heart,
  Target,
  Settings,
} from "lucide-react";
import type { SidebarFolderIconName } from "@/lib/sidebar-layout";

const ICONS = {
  folder: Folder,
  users: Users,
  briefcase: Briefcase,
  calendar: CalendarDays,
  clipboard: ClipboardList,
  messages: MessageSquare,
  book: BookOpen,
  chart: Gauge,
  megaphone: Megaphone,
  heart: Heart,
  target: Target,
  settings: Settings,
};

export function SidebarFolderIcon({
  name,
  size = 17,
}: {
  name: SidebarFolderIconName;
  size?: number;
}) {
  const Icon = ICONS[name] ?? Folder;
  return (
    <Icon size={size} strokeWidth={2} aria-hidden="true" className="shrink-0" />
  );
}
