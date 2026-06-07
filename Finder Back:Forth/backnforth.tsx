// @ts-nocheck
// backnforth.tsx — Framer CODE OVERRIDES for macOS-Finder-style back/forward navigation.
//
// ─── SMART COMPONENT PATCH ───────────────────────────────────────────────────
//   Paste this inside your Smart Component, right after useVariantState:
//
//   useEffect(() => {
//       const handler = (e: any) => setVariant(e.detail.entries[e.detail.index] ?? "about me")
//       window.addEventListener("finder:nav", handler)
//       return () => window.removeEventListener("finder:nav", handler)
//   }, [])
//
// ─────────────────────────────────────────────────────────────────────────────

import type { ComponentType } from "react"
import { useState, useEffect } from "react"

// ── CONFIG ───────────────────────────────────────────────────────
const PRIMARY_VARIANT = "about me"
const MAX_HISTORY = 16
const STORAGE_KEY = "finder-nav-history"
const NAV_EVENT = "finder:nav"
const DISABLED_OPACITY = 0.5

// ── TYPES ────────────────────────────────────────────────────────
type HistoryState = { entries: string[]; index: number }
const FALLBACK: HistoryState = { entries: [PRIMARY_VARIANT], index: 0 }

// ── PERSISTENCE ──────────────────────────────────────────────────
function loadHistory(): HistoryState {
    if (typeof window === "undefined") return FALLBACK
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return FALLBACK
        const p = JSON.parse(raw)
        if (!p?.entries?.length || typeof p.index !== "number") return FALLBACK
        const entries = p.entries.filter((v: unknown) => typeof v === "string").slice(0, MAX_HISTORY)
        if (!entries.length) return FALLBACK
        return { entries, index: Math.min(Math.max(0, Math.floor(p.index)), entries.length - 1) }
    } catch { return FALLBACK }
}

// ── MODULE-LEVEL STORE ───────────────────────────────────────────
// All override instances share one store — no echo, no double setState.
let _store: HistoryState = loadHistory()
const _subs = new Set<() => void>()

function setNav(next: HistoryState) {
    if (next === _store) return
    _store = next
    try { window?.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    // Notify all sibling override instances
    _subs.forEach(fn => fn())
    // Notify the Smart Component
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: next }))
    }
}

function useNav(): [HistoryState, typeof setNav] {
    const [, tick] = useState(0)
    useEffect(() => {
        const fn = () => tick(n => n + 1)
        _subs.add(fn)
        return () => { _subs.delete(fn) }
    }, [])
    return [_store, setNav]
}

// ── HISTORY OPS ──────────────────────────────────────────────────
function pushVariant(state: HistoryState, target: string): HistoryState {
    if (!target || state.entries[state.index] === target) return state
    const truncated = state.entries.slice(0, state.index + 1)
    const next = [...truncated, target]
    // Always preserve entry[0] when capping
    const entries = next.length <= MAX_HISTORY
        ? next
        : [next[0], ...next.slice(next.length - MAX_HISTORY + 1)]
    return { entries, index: entries.length - 1 }
}

// ── OVERRIDES ────────────────────────────────────────────────────

function goTo(target: string) {
    return (Component: any): ComponentType =>
        (props: any) => {
            const [nav, update] = useNav()
            const isActive = (nav.entries[nav.index] ?? PRIMARY_VARIANT) === target
            return (
                <Component
                    {...props}
                    onClick={(e: any) => {
                        const next = pushVariant(nav, target)
                        if (next !== nav) update(next)
                        props.onClick?.(e)
                    }}
                    animate={{ opacity: isActive ? 1 : 0.8 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ ...props.style, cursor: "pointer" }}
                />
            )
        }
}

// withYellow — switches to the "extra" variant (layout/animation handled in Framer)
export function withYellow(C: any): ComponentType { return goTo("extra")(C) }

// withRed — resets nav history and returns to primary variant
export function withRed(Component: any): ComponentType {
    return (props: any) => (
        <Component
            {...props}
            onClick={(e: any) => {
                try { window?.sessionStorage.removeItem(STORAGE_KEY) } catch {}
                setNav({ ...FALLBACK })
                props.onClick?.(e)
            }}
            style={{ ...props.style, cursor: "pointer" }}
        />
    )
}

// withGreen — toggles browser fullscreen (like macOS green button / F11)
export function withGreen(Component: any): ComponentType {
    return (props: any) => {
        const [fullscreen, setFullscreen] = useState(false)
        useEffect(() => {
            const handler = () => setFullscreen(!!document.fullscreenElement)
            document.addEventListener("fullscreenchange", handler)
            return () => document.removeEventListener("fullscreenchange", handler)
        }, [])
        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen?.()
                    } else {
                        document.exitFullscreen?.()
                    }
                    props.onClick?.(e)
                }}
                style={{ ...props.style, cursor: "pointer" }}
            />
        )
    }
}

export function withGoToAboutMe(C: any): ComponentType { return goTo("about me")(C) }
export function withGoToCurrentlyWorking(C: any): ComponentType { return goTo("currently working")(C) }
export function withGoToOutOfOffice(C: any): ComponentType { return goTo("out of office")(C) }
export function withGoToAcademicRecord(C: any): ComponentType { return goTo("academic record")(C) }
export function withGoToSpotifyPlaylist(C: any): ComponentType { return goTo("spotify playlist")(C) }
export function withGoToCurrentInspo(C: any): ComponentType { return goTo("current inspo")(C) }
export function withGoToRecommendedWatch(C: any): ComponentType { return goTo("recommended watch")(C) }
export function withGoToAscii(C: any): ComponentType { return goTo("ascii")(C) }
export function withGoToLetterboxd(C: any): ComponentType { return goTo("letterboxd")(C) }
export function withGoToGoodreads(C: any): ComponentType { return goTo("goodreads")(C) }

export function withBack(Component: any): ComponentType {
    return (props: any) => {
        const [nav, update] = useNav()
        const can = nav.index > 0
        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    if (!can) return
                    update({ ...nav, index: nav.index - 1 })
                    props.onClick?.(e)
                }}
                animate={{ opacity: can ? 1 : DISABLED_OPACITY }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ ...props.style, pointerEvents: can ? "auto" : "none", cursor: can ? "pointer" : "default" }}
            />
        )
    }
}

export function withForward(Component: any): ComponentType {
    return (props: any) => {
        const [nav, update] = useNav()
        const can = nav.index < nav.entries.length - 1
        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    if (!can) return
                    update({ ...nav, index: nav.index + 1 })
                    props.onClick?.(e)
                }}
                animate={{ opacity: can ? 1 : DISABLED_OPACITY }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ ...props.style, pointerEvents: can ? "auto" : "none", cursor: can ? "pointer" : "default" }}
            />
        )
    }
}
