"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dumbbell, History, BarChart3, BookOpen, Settings } from "lucide-react"

const items = [
  { href: "/", label: "Программа", icon: Dumbbell },
  { href: "/technique", label: "Техника", icon: BookOpen },
  { href: "/history", label: "История", icon: History },
  { href: "/stats", label: "Прогресс", icon: BarChart3 },
  { href: "/settings", label: "TM", icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
