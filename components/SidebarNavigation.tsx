"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  normalizeSidebarLayout,
  type SidebarLayout,
  type SidebarFolder,
} from "@/lib/sidebar-layout";
import { SidebarFolderIcon } from "@/components/SidebarFolderIcon";

export type SidebarNavItem = {
  id: string;
  label: string;
  Icon: LucideIcon;
  href: string;
  match: (pathname: string) => boolean;
};

export function SidebarNavigation({
  items,
  layout,
  pathname,
  badgeFor,
  mobile = false,
}: {
  items: SidebarNavItem[];
  layout?: SidebarLayout;
  pathname: string;
  badgeFor: (id: string) => number | null;
  mobile?: boolean;
}) {
  const id = useId();
  const nodes = normalizeSidebarLayout(
    layout,
    items.map((item) => item.id),
  ).items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const activeFolder = nodes.find(
    (node): node is SidebarFolder =>
      node.type === "folder" &&
      node.pages.some((page) => byId.get(page)?.match(pathname)),
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeFolder ? [activeFolder.id] : []),
  );
  const [mobileFolder, setMobileFolder] = useState<string | null>(
    activeFolder?.id ?? null,
  );
  useEffect(() => {
    if (activeFolder)
      setExpanded((previous) => new Set([...previous, activeFolder.id]));
    setMobileFolder(activeFolder?.id ?? null);
  }, [pathname, activeFolder?.id]);
  const openMobile = nodes.find(
    (node): node is SidebarFolder =>
      node.type === "folder" && node.id === mobileFolder && !!node.pages.length,
  );

  function badge(count: number | null) {
    return count && count > 0 ? (
      <span
        className={`shrink-0 rounded-full px-1 text-center font-bold ${mobile ? "min-w-[16px] text-[9px] leading-4" : "min-w-[18px] text-[10px] leading-[18px]"}`}
        style={{ background: "#DC2626", color: "#FFFFFF" }}
      >
        {count > 99 ? "99+" : count}
      </span>
    ) : null;
  }
  function link(item: SidebarNavItem, nested = false) {
    const active = item.match(pathname),
      Icon = item.Icon;
    return (
      <Link
        key={item.id}
        prefetch={false}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={
          mobile
            ? `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs ${active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-200 bg-white"}`
            : `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-neutral-900 text-white font-medium dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-neutral-100"}`
        }
      >
        <Icon
          size={mobile ? 14 : nested ? 15 : 17}
          strokeWidth={active ? 2.25 : 2}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1" style={{ letterSpacing: "-0.015em" }}>
          {item.label}
        </span>
        {badge(badgeFor(item.id))}
      </Link>
    );
  }
  function folderButton(folder: SidebarFolder) {
    const active = folder.id === activeFolder?.id;
    const open = mobile ? mobileFolder === folder.id : expanded.has(folder.id);
    const total = folder.pages.reduce(
      (sum, page) => sum + (badgeFor(page) ?? 0),
      0,
    );
    return (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-${folder.id}`}
        title={folder.label}
        onClick={() => {
          if (mobile) setMobileFolder(open ? null : folder.id);
          else
            setExpanded((previous) => {
              const next = new Set(previous);
              if (next.has(folder.id)) next.delete(folder.id);
              else next.add(folder.id);
              return next;
            });
        }}
        className={
          mobile
            ? `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-200 px-3 py-2 text-xs ${active ? "bg-neutral-100 font-medium" : "bg-white"}`
            : `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? "bg-neutral-100 text-neutral-900 font-medium" : "text-neutral-600 hover:bg-neutral-100"}`
        }
      >
        <SidebarFolderIcon name={folder.icon} size={mobile ? 14 : 17} />
        <span className="min-w-0 flex-1 truncate">{folder.label}</span>
        {!open && badge(total)}
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
    );
  }
  return mobile ? (
    <div className="min-w-0 flex-1">
      <nav
        aria-label="Menú principal"
        className="flex gap-1 overflow-x-auto pb-1"
      >
        {nodes.map((node) =>
          node.type === "page" ? (
            link(byId.get(node.id)!)
          ) : node.pages.length ? (
            <div key={node.id} className="shrink-0">
              {folderButton(node)}
            </div>
          ) : null,
        )}
      </nav>
      {openMobile && (
        <nav
          id={`${id}-${openMobile.id}`}
          aria-label={openMobile.label}
          className="mt-1 flex gap-1 overflow-x-auto border-t border-neutral-200 pt-2 pb-1"
        >
          {openMobile.pages.map((page) => link(byId.get(page)!, true))}
        </nav>
      )}
    </div>
  ) : (
    <nav aria-label="Menú principal" className="space-y-0.5">
      {nodes.map((node) =>
        node.type === "page" ? (
          link(byId.get(node.id)!)
        ) : node.pages.length ? (
          <div key={node.id}>
            {folderButton(node)}
            {expanded.has(node.id) && (
              <div
                id={`${id}-${node.id}`}
                role="group"
                aria-label={node.label}
                className="ml-5 my-1 space-y-0.5 border-l border-neutral-200 pl-1"
              >
                {node.pages.map((page) => link(byId.get(page)!, true))}
              </div>
            )}
          </div>
        ) : null,
      )}
    </nav>
  );
}
