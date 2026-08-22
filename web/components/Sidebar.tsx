"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "ORD" },
  { href: "/shipping", label: "SHIP" },
  { href: "#", label: "SET" },
  { href: "#", label: "ALR" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="sidebar">
      <div className="mark">OS</div>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`nav-item ${pathname === item.href ? "active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
